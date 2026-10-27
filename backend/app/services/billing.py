import uuid
from datetime import date, timedelta
from decimal import ROUND_FLOOR, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import BillingCycle, InvoiceStatus
from app.models.models import Bed, Charge, Floor, Payment, Property, RentInvoice, Room, Stay


def period_bounds(month: str) -> tuple:
    """month='YYYY-MM' -> (first_day, last_day)."""
    year, mon = int(month[:4]), int(month[5:7])
    start = date(year, mon, 1)
    if mon == 12:
        end = date(year, 12, 31)
    else:
        end = date(year, mon + 1, 1) - timedelta(days=1)
    return start, end


def pro_rate_paise(rent_paise: int, start: date, period_start: date, period_end: date) -> int:
    """Rent pro-rated for the days a stay was active within the period."""
    if start <= period_start:
        return rent_paise
    if start > period_end:
        return 0
    total_days = (period_end - period_start).days + 1
    active_days = (period_end - start).days + 1
    return int((Decimal(rent_paise) * Decimal(active_days) / Decimal(total_days)).to_integral_value(rounding=ROUND_FLOOR))


def property_for_stay(db: Session, org_id, stay: Stay) -> Property | None:
    """Property config lives on the property: bed -> room -> floor -> property."""
    return db.execute(
        select(Property)
        .join(Floor, Floor.property_id == Property.id)
        .join(Room, Room.floor_id == Floor.id)
        .join(Bed, Bed.room_id == Room.id)
        .where(Bed.id == stay.bed_id, Property.organization_id == org_id)
    ).scalar_one_or_none()


def due_date_for(month: str, prop: Property) -> date:
    year, mon = int(month[:4]), int(month[5:7])
    if prop.advance_or_arrears == BillingCycle.advance:
        # March rent is due on Feb's due_day (paid in advance)
        if mon == 1:
            year, mon = year - 1, 12
        else:
            mon -= 1
        return date(year, mon, prop.due_day)
    return date(year, mon, prop.due_day)


def generate_invoices(
    db: Session, org_id: uuid.UUID, month: str, property_id=None
) -> list[RentInvoice]:
    """One invoice per active stay for `month`, unless one already exists.

    - advance cycle: due date lands in the previous month's due_day
    - pro-rate first month per property config
    - unapplied charges for the same month are folded into the invoice
    - optional property_id scopes the run to one PG
    """
    period_start, period_end = period_bounds(month)
    stay_stmt = select(Stay).where(Stay.organization_id == org_id, Stay.active.is_(True))
    if property_id:
        stay_stmt = stay_stmt.where(
            Stay.bed_id.in_(
                select(Bed.id)
                .join(Room, Room.id == Bed.room_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Floor.property_id == property_id)
            )
        )
    stays = db.execute(stay_stmt).scalars().all()

    created: list[RentInvoice] = []
    for stay in stays:
        if stay.start_date > period_end:
            continue  # joined after this period

        existing = db.execute(
            select(RentInvoice).where(RentInvoice.stay_id == stay.id, RentInvoice.period_month == month)
        ).scalar_one_or_none()
        if existing:
            continue

        prop = property_for_stay(db, org_id, stay)
        base = stay.agreed_rent_paise
        if prop and prop.pro_rate_first_month and stay.start_date > period_start:
            rent = pro_rate_paise(base, stay.start_date, period_start, period_end)
        else:
            rent = base

        invoice = RentInvoice(
            organization_id=org_id,
            stay_id=stay.id,
            period_month=month,
            period_start=period_start,
            period_end=period_end,
            amount_paise=rent,
            due_date=due_date_for(month, prop) if prop else period_end,
        )
        db.add(invoice)
        db.flush()

        charges = db.execute(
            select(Charge).where(
                Charge.stay_id == stay.id,
                Charge.charge_month == month,
                Charge.applied_invoice_id.is_(None),
            )
        ).scalars().all()
        for c in charges:
            invoice.amount_paise += c.amount_paise
            c.applied_invoice_id = invoice.id

        created.append(invoice)

    db.commit()
    for inv in created:
        db.refresh(inv)
    return created


def paid_paise_for(db: Session, invoice: RentInvoice) -> int:
    """Paid total via SQL to avoid stale relationship caches after commits."""
    from sqlalchemy import func

    total = db.execute(
        select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(Payment.invoice_id == invoice.id)
    ).scalar_one()
    return int(total)


def refresh_invoice_status(db: Session, invoice: RentInvoice) -> RentInvoice:
    paid = paid_paise_for(db, invoice)
    if paid <= 0:
        invoice.status = InvoiceStatus.pending
    elif paid < invoice.amount_paise:
        invoice.status = InvoiceStatus.partial
    else:
        invoice.status = InvoiceStatus.paid
    db.commit()
    db.refresh(invoice)
    return invoice
