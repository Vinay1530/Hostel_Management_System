import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.enums import InvoiceStatus
from app.models.models import (
    Bed,
    Charge,
    Floor,
    Organization,
    Payment,
    Property,
    RentInvoice,
    Room,
    Stay,
    Tenant,
)
from app.schemas.schemas import (
    ChargeIn,
    ChargeOut,
    DuesOut,
    DuesSummary,
    DueRow,
    GenerateInvoicesIn,
    InvoiceOut,
    InvoiceWithPayments,
    PaymentIn,
    PaymentOut,
)
from app.services import billing as engine
from app.services.receipts import render_receipt_pdf

router = APIRouter(tags=["billing"])


# ---------- charges ----------

@router.get("/charges", response_model=list[ChargeOut])
def list_charges(applied: bool | None = None, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    stmt = select(Charge).where(Charge.organization_id == auth.org_id).order_by(Charge.created_at.desc())
    if applied is True:
        stmt = stmt.where(Charge.applied_invoice_id.is_not(None))
    elif applied is False:
        stmt = stmt.where(Charge.applied_invoice_id.is_(None))
    return db.execute(stmt).scalars().all()


@router.post("/charges", response_model=ChargeOut, status_code=201)
def create_charge(body: ChargeIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    stay = db.get(Stay, body.stay_id)
    if stay is None or stay.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stay not found")
    c = Charge(organization_id=auth.org_id, **body.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.delete("/charges/{charge_id}", status_code=204)
def delete_charge(charge_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    c = db.get(Charge, charge_id)
    if c is None or c.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Charge not found")
    db.delete(c)
    db.commit()


# ---------- invoice generation ----------

@router.post("/invoices/generate", response_model=list[InvoiceOut])
def generate_month(body: GenerateInvoicesIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    """Idempotent: skips stays that already have an invoice for the month."""
    invoices = engine.generate_invoices(db, auth.org_id, body.month, property_id=body.property_id)
    return invoices


# ---------- invoices / payments ----------

@router.get("/invoices", response_model=list[InvoiceWithPayments])
def list_invoices(
    status_filter: InvoiceStatus | None = None,
    stay_id: uuid.UUID | None = None,
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = (
        select(RentInvoice)
        .options(joinedload(RentInvoice.payments))
        .where(RentInvoice.organization_id == auth.org_id)
        .order_by(RentInvoice.period_month.desc(), RentInvoice.due_date)
    )
    if status_filter:
        stmt = stmt.where(RentInvoice.status == status_filter)
    if stay_id:
        stmt = stmt.where(RentInvoice.stay_id == stay_id)
    if property_id:
        stmt = stmt.where(
            RentInvoice.stay_id.in_(
                select(Stay.id)
                .join(Bed, Bed.id == Stay.bed_id)
                .join(Room, Room.id == Bed.room_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Floor.property_id == property_id)
            )
        )
    invoices = db.execute(stmt).unique().scalars().all()
    out = []
    for inv in invoices:
        paid = sum(p.amount_paise for p in inv.payments)
        out.append(
            InvoiceWithPayments(
                **{k: getattr(inv, k) for k in ("id", "stay_id", "period_month", "period_start", "period_end", "amount_paise", "due_date", "status")},
                payments=inv.payments,
                paid_paise=paid,
                balance_paise=max(inv.amount_paise - paid, 0),
            )
        )
    return out


@router.post("/payments", response_model=PaymentOut, status_code=201)
def record_payment(body: PaymentIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    """Manual/cash entry. UPI gateway integration comes later (weeks 9-10)."""
    invoice = db.execute(
        select(RentInvoice).where(RentInvoice.id == body.invoice_id, RentInvoice.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")
    if invoice.status == InvoiceStatus.void:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice is void")
    paid = engine.paid_paise_for(db, invoice)
    if paid >= invoice.amount_paise:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invoice already fully paid")

    if body.amount_paise > invoice.amount_paise - paid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Overpayment: outstanding is {invoice.amount_paise - paid} paise",
        )

    payment = Payment(
        organization_id=auth.org_id,
        invoice_id=invoice.id,
        amount_paise=body.amount_paise,
        mode=body.mode,
        reference=body.reference,
        received_by_user_id=auth.user.id,
    )
    db.add(payment)
    db.commit()
    engine.refresh_invoice_status(db, invoice)
    db.refresh(payment)
    return payment


@router.get("/payments/{payment_id}/receipt")
def receipt(payment_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    """PDF receipt for a payment."""
    payment = db.execute(
        select(Payment)
        .options(joinedload(Payment.invoice).joinedload(RentInvoice.stay).joinedload(Stay.tenant))
        .where(Payment.id == payment_id, Payment.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    stay = payment.invoice.stay
    tenant = stay.tenant
    room = db.get(Room, db.get(Bed, stay.bed_id).room_id)
    prop = engine.property_for_stay(db, auth.org_id, stay)
    org = db.get(Organization, auth.org_id)

    pdf = render_receipt_pdf(
        org_name=org.name if org else "PG Owner",
        tenant_name=tenant.full_name,
        property_name=prop.name if prop else "-",
        room=f"{room.number}/{db.get(Bed, stay.bed_id).label}",
        period=payment.invoice.period_month,
        invoice_amount=payment.invoice.amount_paise,
        payment_amount=payment.amount_paise,
        mode=payment.mode.value,
        reference=payment.reference,
        paid_at=payment.paid_at,
        receipt_no=str(payment.id)[:8].upper(),
    )
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=receipt_{str(payment.id)[:8]}.pdf"},
    )


# ---------- dues dashboard (key screen) ----------

@router.get("/dues", response_model=DuesOut)
def dues_dashboard(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = (
        select(RentInvoice)
        .join(Stay, RentInvoice.stay_id == Stay.id)
        .join(Tenant, Stay.tenant_id == Tenant.id)
        .join(Bed, Stay.bed_id == Bed.id)
        .join(Room, Bed.room_id == Room.id)
        .join(Floor, Room.floor_id == Floor.id)
        .join(Property, Floor.property_id == Property.id)
        .options(joinedload(RentInvoice.payments))
        .where(RentInvoice.organization_id == auth.org_id, RentInvoice.status != InvoiceStatus.void)
        .order_by(RentInvoice.due_date)
    )
    if property_id:
        stmt = stmt.where(Property.id == property_id)
    invoices = db.execute(stmt).unique().scalars().all()

    billed = collected = 0
    counts = {"pending": 0, "partial": 0, "paid": 0}
    rows: list[DueRow] = []
    for inv in invoices:
        paid = sum(p.amount_paise for p in inv.payments)
        billed += inv.amount_paise
        collected += paid
        counts[inv.status.value] = counts.get(inv.status.value, 0) + 1

        prop = engine.property_for_stay(db, auth.org_id, inv.stay)
        bed = db.get(Bed, inv.stay.bed_id)
        room = db.get(Room, bed.room_id)
        tenant = db.get(Tenant, inv.stay.tenant_id)

        rows.append(
            DueRow(
                invoice_id=inv.id,
                tenant_id=tenant.id,
                tenant_name=tenant.full_name,
                tenant_phone=tenant.phone,
                property_id=prop.id if prop else None,
                property_name=prop.name if prop else "-",
                room_number=room.number,
                bed_label=bed.label,
                period_month=inv.period_month,
                amount_paise=inv.amount_paise,
                paid_paise=paid,
                balance_paise=inv.amount_paise - paid,
                due_date=inv.due_date,
                status=inv.status,
            )
        )

    outstanding = billed - collected
    return DuesOut(
        summary=DuesSummary(
            total_invoices=len(invoices),
            pending=counts["pending"],
            partial=counts["partial"],
            paid=counts["paid"],
            billed_paise=billed,
            collected_paise=collected,
            outstanding_paise=outstanding,
        ),
        rows=rows,
    )
