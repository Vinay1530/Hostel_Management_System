import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.enums import InvoiceStatus
from app.models.models import (
    PaymentReminder,
    RentInvoice,
    Stay,
    Bed,
    Room,
    Floor,
)
from app.schemas.schemas import (
    PaymentReminderIn,
    PaymentReminderOut,
)

router = APIRouter(tags=["payment-reminders"])


@router.post("/payment-reminders", response_model=PaymentReminderOut, status_code=201)
def create_payment_reminder(
    body: PaymentReminderIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    invoice = db.execute(
        select(RentInvoice)
        .where(RentInvoice.id == body.invoice_id, RentInvoice.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found")

    reminder = PaymentReminder(
        organization_id=auth.org_id,
        invoice_id=body.invoice_id,
        reminder_type=body.reminder_type,
        reminder_date=body.reminder_date,
        channel=body.channel,
        status="pending",
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return reminder


@router.get("/payment-reminders", response_model=list[PaymentReminderOut])
def list_payment_reminders(
    invoice_id: uuid.UUID | None = None,
    status_filter: str | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(PaymentReminder).where(PaymentReminder.organization_id == auth.org_id)

    if invoice_id:
        stmt = stmt.where(PaymentReminder.invoice_id == invoice_id)
    if status_filter:
        stmt = stmt.where(PaymentReminder.status == status_filter)

    reminders = db.execute(stmt).scalars().all()
    return reminders


@router.patch("/payment-reminders/{reminder_id}/sent", response_model=PaymentReminderOut)
def mark_reminder_sent(
    reminder_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    reminder = db.execute(
        select(PaymentReminder)
        .where(PaymentReminder.id == reminder_id, PaymentReminder.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if reminder is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reminder not found")

    reminder.status = "sent"
    reminder.sent_at = func.now()
    db.commit()
    db.refresh(reminder)
    return reminder


@router.post("/payment-reminders/generate-due", response_model=list[PaymentReminderOut])
def generate_due_reminders(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    stmt = (
        select(RentInvoice)
        .where(
            RentInvoice.organization_id == auth.org_id,
            RentInvoice.status != InvoiceStatus.paid,
            RentInvoice.status != InvoiceStatus.void,
        )
    )
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

    invoices = db.execute(stmt).scalars().all()

    reminders_created = []
    for inv in invoices:
        existing = db.execute(
            select(PaymentReminder).where(
                PaymentReminder.invoice_id == inv.id,
                PaymentReminder.status.in_(("pending", "sent")),
            )
        ).scalar_one_or_none()
        if existing:
            continue

        reminder = PaymentReminder(
            organization_id=auth.org_id,
            invoice_id=inv.id,
            reminder_type="initial",
            reminder_date=inv.due_date,
            channel="email",
            status="pending",
        )
        db.add(reminder)
        reminders_created.append(reminder)

    db.commit()
    for r in reminders_created:
        db.refresh(r)
    return reminders_created