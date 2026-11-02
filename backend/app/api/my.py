import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, get_auth_context
from app.models.enums import PaymentMode, Role
from app.models.models import Bed, RentInvoice, Room, Stay, Tenant
from app.services.billing import property_for_stay
from app.services.notify import notify_staff

router = APIRouter(tags=["my"])


class MyPayment(BaseModel):
    payment_id: uuid.UUID
    amount_paise: int
    mode: PaymentMode
    reference: str | None
    paid_at: object


class MyTransactionRow(BaseModel):
    invoice_id: uuid.UUID
    period_month: str
    period_start: object
    period_end: object
    amount_paise: int
    paid_paise: int
    balance_paise: int
    due_date: object
    status: str
    payments: list[MyPayment] = []


class MyDuesRow(BaseModel):
    invoice_id: uuid.UUID
    period_month: str
    amount_paise: int
    paid_paise: int
    balance_paise: int
    due_date: object
    status: str
    property_name: str
    room_number: str
    bed_label: str


class MyProfile(BaseModel):
    full_name: str
    phone: str
    email: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    id_number: str | None = None
    room_number: str | None
    bed_label: str | None
    property_name: str | None
    rent_paise: int | None
    deposit_paise: int | None = None
    move_in_date: date | None = None
    notice_start_date: date | None = None
    notice_end_date: date | None = None
    notice_period_days: int | None = None


class MyOverview(BaseModel):
    profile: MyProfile
    invoices: list[MyDuesRow]


class NoticeIn(BaseModel):
    end_date: date | None = Field(None, description="Desired leaving date (YYYY-MM-DD)")


def _current_tenant(db: Session, org_id: uuid.UUID, auth: AuthContext) -> Tenant:
    tenant = db.execute(
        select(Tenant).where(Tenant.phone == auth.user.phone, Tenant.organization_id == org_id)
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tenant profile linked to your phone in this organization")
    return tenant


@router.get("/my/overview", response_model=MyOverview)
def my_overview(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    """Tenant-facing view: profile, current bed and rent dues. Requires tenant (or staff, for demo) login."""
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)

    stay = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()

    profile = MyProfile(full_name=tenant.full_name, phone=tenant.phone, room_number=None, bed_label=None, property_name=None, rent_paise=None)
    if stay:
        bed = db.get(Bed, stay.bed_id)
        room = db.get(Room, bed.room_id)
        prop = property_for_stay(db, auth.org_id, stay)
        profile = MyProfile(
            full_name=tenant.full_name,
            phone=tenant.phone,
            email=tenant.email,
            emergency_contact_name=tenant.emergency_contact_name,
            emergency_contact_phone=tenant.emergency_contact_phone,
            id_number=tenant.id_number,
            room_number=room.number,
            bed_label=bed.label,
            property_name=prop.name if prop else None,
            rent_paise=stay.agreed_rent_paise,
            deposit_paise=stay.deposit_paise,
            move_in_date=stay.start_date,
            notice_start_date=stay.notice_start_date,
            notice_end_date=stay.notice_end_date,
            notice_period_days=prop.notice_period_days if prop else 30,
        )

    invoices = db.execute(
        select(RentInvoice)
        .where(RentInvoice.stay_id.in_(
            select(Stay.id).where(Stay.tenant_id == tenant.id)
        ))
        .order_by(RentInvoice.period_month.desc())
    ).scalars().all()

    rows: list[MyDuesRow] = []
    for inv in invoices:
        paid = sum(p.amount_paise for p in inv.payments) if inv.payments else 0
        bed = db.get(Bed, inv.stay.bed_id)
        room = db.get(Room, bed.room_id)
        prop = property_for_stay(db, auth.org_id, inv.stay)
        rows.append(
            MyDuesRow(
                invoice_id=inv.id,
                period_month=inv.period_month,
                amount_paise=inv.amount_paise,
                paid_paise=paid,
                balance_paise=inv.amount_paise - paid,
                due_date=inv.due_date,
                status=inv.status.value,
                property_name=prop.name if prop else "-",
                room_number=room.number,
                bed_label=bed.label,
            )
        )
    return MyOverview(profile=profile, invoices=rows)


@router.get("/my/role")
def my_role(auth: AuthContext = Depends(get_auth_context)):
    return {"role": auth.role.value if auth.role else None, "org_id": auth.org_id}


@router.get("/my/transactions", response_model=list[MyTransactionRow])
def my_transactions(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    """Full transaction history: invoices with every payment that hit them."""
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)

    invoices = db.execute(
        select(RentInvoice)
        .where(RentInvoice.stay_id.in_(select(Stay.id).where(Stay.tenant_id == tenant.id)))
        .order_by(RentInvoice.period_month.desc())
    ).scalars().all()

    out: list[MyTransactionRow] = []
    for inv in invoices:
        pays = sorted(inv.payments, key=lambda p: p.paid_at) if inv.payments else []
        paid = sum(p.amount_paise for p in pays)
        out.append(
            MyTransactionRow(
                invoice_id=inv.id,
                period_month=inv.period_month,
                period_start=inv.period_start,
                period_end=inv.period_end,
                amount_paise=inv.amount_paise,
                paid_paise=paid,
                balance_paise=inv.amount_paise - paid,
                due_date=inv.due_date,
                status=inv.status,
                payments=[
                    MyPayment(
                        payment_id=p.id,
                        amount_paise=p.amount_paise,
                        mode=p.mode,
                        reference=p.reference,
                        paid_at=p.paid_at,
                    )
                    for p in pays
                ],
            )
        )
    return out


@router.post("/my/notice", response_model=MyOverview)
def start_notice(
    body: NoticeIn | None = None,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Tenant starts their 30-day (or property-configured) notice period."""
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)
    stay = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if not stay:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active stay found")
    if stay.notice_start_date:
        raise HTTPException(status.HTTP_409_CONFLICT, "Notice period already started")

    prop = property_for_stay(db, auth.org_id, stay)
    days = prop.notice_period_days if prop else 30
    today = date.today()
    end_date = body.end_date if body and body.end_date else today + timedelta(days=days)
    if end_date < today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "End date can't be in the past")

    stay.notice_start_date = today
    stay.notice_end_date = end_date
    db.commit()
    db.refresh(stay)

    notify_staff(
        db,
        auth.org_id,
        "Notice period started",
        f"{tenant.full_name} (Room {db.get(Room, stay.bed_id).number if db.get(Room, stay.bed_id) else '-'})"
        f" is leaving on {stay.notice_end_date.isoformat()}.",
    )
    db.commit()
    return my_overview(auth=auth, db=db)


@router.post("/my/notice/cancel", response_model=MyOverview)
def cancel_notice(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)
    stay = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if not stay or not stay.notice_start_date:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No notice period running")
    stay.notice_start_date = None
    stay.notice_end_date = None
    db.commit()
    notify_staff(
        db, auth.org_id, "Notice period cancelled", f"{tenant.full_name} cancelled their notice period."
    )
    db.commit()
    return my_overview(auth=auth, db=db)
