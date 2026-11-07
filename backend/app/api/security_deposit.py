import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.enums import InvoiceStatus, PaymentMode
from app.models.models import Payment, RentInvoice, SecurityDeposit, Stay
from app.schemas.schemas import SecurityDepositIn, SecurityDepositOut
from app.services.billing import refresh_invoice_status

router = APIRouter(tags=["security-deposits"])


@router.post("/security-deposits", response_model=SecurityDepositOut, status_code=201)
def create_security_deposit(
    body: SecurityDepositIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stay = db.get(Stay, body.stay_id)
    if stay is None or stay.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stay not found")

    existing = db.execute(
        select(SecurityDeposit).where(SecurityDeposit.stay_id == body.stay_id)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Security deposit already exists for this stay")

    deposit = SecurityDeposit(
        organization_id=auth.org_id,
        stay_id=body.stay_id,
        amount_paise=body.amount_paise,
        held_by_user_id=auth.user.id,
    )
    db.add(deposit)
    db.commit()
    db.refresh(deposit)
    return deposit


@router.get("/security-deposits", response_model=list[SecurityDepositOut])
def list_security_deposits(
    stay_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(SecurityDeposit).where(SecurityDeposit.organization_id == auth.org_id)

    if stay_id:
        stmt = stmt.where(SecurityDeposit.stay_id == stay_id)
    if status_filter:
        stmt = stmt.where(SecurityDeposit.status == status_filter)

    deposits = db.execute(stmt).scalars().all()
    return deposits


@router.patch("/security-deposits/{deposit_id}", response_model=SecurityDepositOut)
def update_security_deposit(
    deposit_id: uuid.UUID,
    body: SecurityDepositOut,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    deposit = db.execute(
        select(SecurityDeposit)
        .where(SecurityDeposit.id == deposit_id, SecurityDeposit.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if deposit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Security deposit not found")

    deposit.status = body.status
    deposit.deductions_paise = body.deductions_paise
    deposit.notes = body.notes
    deposit.refund_date = body.refund_date
    deposit.updated_at = func.now()

    db.commit()
    db.refresh(deposit)
    return deposit


@router.post("/security-deposits/{deposit_id}/refund", response_model=SecurityDepositOut)
def refund_security_deposit(
    deposit_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    deposit = db.execute(
        select(SecurityDeposit)
        .where(SecurityDeposit.id == deposit_id, SecurityDeposit.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if deposit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Security deposit not found")

    if deposit.status != "held":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deposit cannot be refunded")

    deposit.status = "refunded"
    deposit.refund_date = func.now()
    deposit.updated_at = func.now()

    db.commit()
    db.refresh(deposit)
    return deposit


@router.post("/security-deposits/{deposit_id}/settle", response_model=SecurityDepositOut)
def settle_security_deposit(
    deposit_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Set off a held deposit against the tenant's outstanding dues.

    - deposit funds pay the oldest unpaid invoices first (Payment mode: bank_transfer)
    - anything deducted is recorded in `deductions_paise`
    - leftover funds -> status refunded; fully consumed -> status forfeited
    """
    deposit = db.execute(
        select(SecurityDeposit)
        .where(SecurityDeposit.id == deposit_id, SecurityDeposit.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if deposit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Security deposit not found")

    if deposit.status != "held":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deposit cannot be settled")

    invoices = db.execute(
        select(RentInvoice)
        .where(
            RentInvoice.stay_id == deposit.stay_id,
            RentInvoice.status.in_([InvoiceStatus.pending, InvoiceStatus.partial]),
        )
        .order_by(RentInvoice.period_month.asc(), RentInvoice.due_date.asc())
    ).scalars().all()

    outstanding = 0
    balances: dict = {}
    for invoice in invoices:
        paid = db.execute(
            select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(Payment.invoice_id == invoice.id)
        ).scalar_one()
        balance = invoice.amount_paise - int(paid)
        if balance > 0:
            balances[invoice.id] = balance
            outstanding += balance

    applied = 0
    if outstanding > 0:
        fund = deposit.amount_paise
        for invoice in invoices:
            if fund <= 0:
                break
            pay = min(balances.get(invoice.id, 0), fund)
            if pay <= 0:
                continue
            db.add(
                Payment(
                    organization_id=auth.org_id,
                    invoice_id=invoice.id,
                    amount_paise=pay,
                    mode=PaymentMode.bank_transfer,
                    reference=f"Deposit settlement {deposit.id}",
                    received_by_user_id=auth.user.id,
                )
            )
            fund -= pay
            applied += pay
        db.flush()
        for invoice in invoices:
            refresh_invoice_status(db, invoice)

    deposit.deductions_paise = applied
    remainder = deposit.amount_paise - applied
    deposit.status = "refunded" if remainder > 0 else "forfeited"
    deposit.refund_date = date.today()
    deposit.notes = (
        f"Settled against outstanding dues: ₹{applied / 100:.0f}; refunded ₹{remainder / 100:.0f}."
        if remainder > 0
        else f"Fully forfeited against outstanding dues: ₹{applied / 100:.0f}."
    )
    deposit.updated_at = func.now()

    db.commit()
    db.refresh(deposit)
    return deposit