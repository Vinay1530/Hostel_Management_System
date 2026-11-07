import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ChargeType, ComplaintStatus, InvoiceStatus
from app.models.models import Charge, Complaint, Organization, RentInvoice
from app.services.billing import generate_invoices, refresh_invoice_status
from app.services.notify import notify_staff


def run_monthly_invoicing(db: Session, month: str) -> dict:
    """Generate one invoice per active stay for `month` in every organization.

    Idempotent: `generate_invoices` skips stays that already have an invoice
    for the period, so this is safe to call daily.
    """
    orgs = db.execute(select(Organization)).scalars().all()
    created = 0
    for org in orgs:
        invoices = generate_invoices(db, org.id, month)
        created += len(invoices)
    return {"organizations": len(orgs), "invoices_created": created}


def apply_late_fees(db: Session, fee_paise: int, apply_from: date | None = None) -> dict:
    """Add one late-fee charge per overdue invoice (pending or partial).

    A fee is only added when the invoice already has no late_fee charge, so
    repeated runs do not stack fees. The fee is folded into the invoice amount
    and linked through Charge.applied_invoice_id like other charges.
    """
    if apply_from is None:
        apply_from = date.today()
    invoices = db.execute(
        select(RentInvoice).where(
            RentInvoice.status.in_([InvoiceStatus.pending, InvoiceStatus.partial]),
            RentInvoice.due_date < apply_from,
        )
    ).scalars().all()

    applied = 0
    for invoice in invoices:
        existing = db.execute(
            select(Charge).where(
                Charge.applied_invoice_id == invoice.id,
                Charge.charge_type == ChargeType.late_fee,
            )
        ).scalar_one_or_none()
        if existing:
            continue
        db.add(
            Charge(
                organization_id=invoice.organization_id,
                stay_id=invoice.stay_id,
                charge_type=ChargeType.late_fee,
                amount_paise=fee_paise,
                description=f"Late fee for {invoice.period_month} invoice (due {invoice.due_date})",
                charge_month=invoice.period_month,
                applied_invoice_id=invoice.id,
            )
        )
        invoice.amount_paise += fee_paise
        applied += 1

    db.commit()
    if applied:
        # recalc statuses once at the end instead of per invoice
        for invoice in invoices:
            refresh_invoice_status(db, invoice)
    return {"late_fees_applied": applied}


def escalate_stale_complaints(db: Session, threshold_hours: int) -> dict:
    """Notify owners/managers once for complaints unresolved past the threshold."""
    cutoff = datetime.now(timezone.utc).timestamp() - threshold_hours * 3600
    cutoff_dt = datetime.fromtimestamp(cutoff, tz=timezone.utc)

    complaints = db.execute(
        select(Complaint).where(
            Complaint.status.in_([ComplaintStatus.open, ComplaintStatus.in_progress]),
            Complaint.escalated_at.is_(None),
            Complaint.created_at <= cutoff_dt,
        )
    ).scalars().all()

    escalated = 0
    for complaint in complaints:
        hours = max(1, int((datetime.now(timezone.utc) - complaint.created_at.replace(tzinfo=timezone.utc)).total_seconds() // 3600))
        notify_staff(
            db,
            complaint.organization_id,
            "Complaint waiting too long",
            f"\"{complaint.title}\" ({complaint.category.value}) has been unresolved for {hours}h.",
            complaint_id=complaint.id,
        )
        complaint.escalated_at = datetime.now(timezone.utc)
        escalated += 1

    db.commit()
    return {"complaints_escalated": escalated}


def run_daily_automation(db: Session, month: str, late_fee_paise: int, escalation_hours: int) -> dict:
    """Everything the scheduler runs in one pass. Each step best-effort."""
    report: dict = {}
    try:
        report["invoicing"] = run_monthly_invoicing(db, month)
    except Exception as e:
        db.rollback()
        report["invoicing_error"] = str(e)
    try:
        report["late_fees"] = apply_late_fees(db, late_fee_paise)
    except Exception as e:
        db.rollback()
        report["late_fees_error"] = str(e)
    try:
        report["escalation"] = escalate_stale_complaints(db, escalation_hours)
    except Exception as e:
        db.rollback()
        report["escalation_error"] = str(e)
    return report
