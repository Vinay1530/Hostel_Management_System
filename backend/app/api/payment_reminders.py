import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.security import AuthContext, ensure_login_user, require_staff
from app.models.enums import InvoiceStatus, Role
from app.models.models import (
    Bed,
    ChatMessage,
    Floor,
    PaymentReminder,
    Property,
    RentInvoice,
    Room,
    Stay,
    Tenant,
    User,
)
from app.schemas.schemas import (
    PaymentReminderIn,
    PaymentReminderOut,
)
from app.api.collaboration import _message_out, chat_connections
from app.services.collaboration import get_or_create_direct_conversation
from app.services.notify import notify_user

router = APIRouter(tags=["payment-reminders"])


def _month_label(period_month: str) -> str:
    try:
        return datetime.strptime(period_month, "%Y-%m").strftime("%B %Y")
    except ValueError:
        return period_month


def _inr(paise: int) -> str:
    return f"₹{paise / 100:,.0f}"


def _reminder_message(
    db: Session, invoice: RentInvoice, auth: AuthContext, reminder: PaymentReminder
) -> tuple[ChatMessage, uuid.UUID] | None:
    """Mirror a manager-sent reminder into the tenant's direct chat."""
    stay = db.get(Stay, invoice.stay_id)
    if stay is None:
        return None
    bed = db.get(Bed, stay.bed_id)
    room = db.get(Room, bed.room_id) if bed else None
    floor = db.get(Floor, room.floor_id) if room else None
    prop = db.get(Property, floor.property_id) if floor else None
    tenant = db.get(Tenant, stay.tenant_id)
    if prop is None or tenant is None:
        return None

    user = db.execute(select(User).where(User.phone == tenant.phone)).scalar_one_or_none()
    if user is None:
        user = ensure_login_user(
            db, tenant.phone, None, auth.org_id, Role.tenant, name=tenant.full_name
        )

    conversation = get_or_create_direct_conversation(
        db, auth.org_id, prop, auth.user.id, user.id
    )
    heading = (
        "Final rent reminder"
        if reminder.reminder_type in ("final", "overdue")
        else "Rent reminder"
    )
    where = f"Room {room.number} · Bed {bed.label}" if room and bed else (prop.name or "your PG")
    text = (
        f"🔔 {heading}: {_inr(invoice.amount_paise)} for "
        f"{_month_label(invoice.period_month)} is due on "
        f"{invoice.due_date.strftime('%d %b %Y')} ({where}). "
        "Please pay at your earliest convenience."
    )
    message = ChatMessage(
        conversation_id=conversation.id,
        sender_id=auth.user.id,
        body=text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)

    notify_user(db, user.id, "Rent reminder", text)
    db.commit()
    return message, conversation.id


@router.post("/payment-reminders", response_model=PaymentReminderOut, status_code=201)
async def create_payment_reminder(
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

    mirrored = _reminder_message(db, invoice, auth, reminder)
    if mirrored is not None:
        message, conversation_id = mirrored
        await chat_connections.broadcast(
            conversation_id,
            {
                "type": "message",
                "message": _message_out(db, message).model_dump(mode="json"),
            },
        )
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