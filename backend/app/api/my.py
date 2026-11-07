import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import (
    AuthContext,
    get_auth_context,
    hash_password,
    issue_otp,
    require_staff,
    verify_otp,
    verify_password,
)
from app.models.enums import PaymentMode, Role
from app.models.models import Bed, RentInvoice, Room, Stay, Tenant, Property, User
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
    avatar_url: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    id_number: str | None = None
    notes: str | None = None
    room_number: str | None
    bed_label: str | None
    property_name: str | None
    rent_paise: int | None
    deposit_paise: int | None = None
    move_in_date: date | None = None
    notice_start_date: date | None = None
    notice_end_date: date | None = None
    notice_period_days: int | None = None


class MyProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    id_number: str | None = None
    notes: str | None = None


class MyPasswordUpdate(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=100)


class MyEmailUpdate(BaseModel):
    email: str | None = None


class MyEmailOtpRequest(BaseModel):
    email: EmailStr


class MyEmailOtpVerify(BaseModel):
    email: EmailStr
    code: str


class MyAvatarUpdate(BaseModel):
    avatar_url: str


class MyPhoneOtpRequest(BaseModel):
    new_phone: str = Field(pattern=r"^\d{10,15}$")


class MyPhoneOtpVerify(BaseModel):
    new_phone: str = Field(pattern=r"^\d{10,15}$")
    code: str = Field(pattern=r"^\d{6}$")


class MyOverview(BaseModel):
    profile: MyProfile
    invoices: list[MyDuesRow]


class NoticeIn(BaseModel):
    end_date: date | None = Field(None, description="Desired leaving date (YYYY-MM-DD)")


def _current_tenant_or_none(db: Session, org_id: uuid.UUID, auth: AuthContext) -> Tenant | None:
    return db.execute(
        select(Tenant).where(Tenant.phone == auth.user.phone, Tenant.organization_id == org_id)
    ).scalar_one_or_none()


def _current_tenant(db: Session, org_id: uuid.UUID, auth: AuthContext) -> Tenant:
    tenant = db.execute(
        select(Tenant).where(Tenant.phone == auth.user.phone, Tenant.organization_id == org_id)
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tenant profile linked to your phone in this organization")
    return tenant


def _tenant_profile(db: Session, org_id: uuid.UUID, auth: AuthContext) -> MyProfile:
    tenant = _current_tenant(db, org_id, auth)
    stay = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    user = auth.user
    profile = MyProfile(
        full_name=tenant.full_name,
        phone=tenant.phone,
        email=user.email,
        avatar_url=user.avatar_url,
        emergency_contact_name=tenant.emergency_contact_name,
        emergency_contact_phone=tenant.emergency_contact_phone,
        id_number=tenant.id_number,
        notes=tenant.notes,
        room_number=None,
        bed_label=None,
        property_name=None,
        rent_paise=stay.agreed_rent_paise if stay else None,
        deposit_paise=stay.deposit_paise if stay else None,
        move_in_date=stay.start_date if stay else None,
        notice_start_date=stay.notice_start_date,
        notice_end_date=stay.notice_end_date,
        notice_period_days=30,
    )
    if stay:
        bed = db.get(Bed, stay.bed_id)
        room = db.get(Room, bed.room_id) if bed else None
        prop = property_for_stay(db, org_id, stay) if stay else None
        profile.room_number = room.number if room else None
        profile.bed_label = bed.label if bed else None
        profile.property_name = prop.name if prop else None
        profile.notice_period_days = prop.notice_period_days if prop else 30
    return profile


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

    bed = db.get(Bed, stay.bed_id)
    room = db.get(Room, bed.room_id) if bed else None
    notify_staff(
        db,
        auth.org_id,
        "Notice period started",
        f"{tenant.full_name} (Room {room.number if room else '-'})"
        f" is leaving on {stay.notice_end_date.isoformat()}.",
        tenant_id=tenant.id,
    )
    db.commit()
    return my_overview(auth=auth, db=db)


@router.get("/my/profile", response_model=MyProfile)
def my_profile_full(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant_or_none(db, auth.org_id, auth)
    if tenant is None:
        # Staff (MANAGER/OWNER) accounts have no Tenant row: build profile from the User.
        user = auth.user
        return MyProfile(
            full_name=user.name or user.phone,
            phone=user.phone,
            email=user.email,
            avatar_url=user.avatar_url,
            emergency_contact_name=None,
            emergency_contact_phone=None,
            id_number=None,
            notes=None,
            room_number=None,
            bed_label=None,
            property_name=None,
            rent_paise=None,
        )
    return _tenant_profile(db, auth.org_id, auth)


@router.patch("/my/profile", response_model=MyProfile)
def update_my_profile(
    body: MyProfileUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant_or_none(db, auth.org_id, auth)
    user = auth.user
    for k, v in body.model_dump(exclude_unset=True).items():
        if tenant is not None and hasattr(tenant, k):
            setattr(tenant, k, v)
        elif k == "full_name" and v is not None:
            # Staff accounts keep their name on the User record.
            user.name = v
        elif k == "email":
            user.email = v if v is not None else user.email
    db.commit()
    if tenant is not None:
        db.refresh(tenant)
    db.refresh(user)
    return my_profile_full(auth=auth, db=db)


@router.patch("/my/email", response_model=MyProfile)
def update_my_email(
    body: MyEmailUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    user = auth.user
    if body.email is not None:
        user.email = body.email
    db.commit()
    return my_profile_full(auth=auth, db=db)


@router.post("/my/email/otp/request")
def request_my_email_otp(
    body: MyEmailOtpRequest,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """OTP request for email change. Keys the token on the user's phone; returns the code in dev mode."""
    code = issue_otp(db, auth.user.phone)
    settings = get_settings()
    return {"email": body.email, "dev_code": code if settings.otp_dev_mode else None}


@router.post("/my/email/otp/verify", response_model=MyProfile)
def verify_my_email_otp(
    body: MyEmailOtpVerify,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    if not verify_otp(db, auth.user.phone, body.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired OTP")
    auth.user.email = body.email
    db.commit()
    db.refresh(auth.user)
    # Managers have no tenant profile; build the profile without requiring one.
    try:
        return my_profile_full(auth=auth, db=db)
    except HTTPException:
        return MyProfile(
            full_name=auth.user.name or auth.user.phone,
            phone=auth.user.phone,
            email=auth.user.email,
            avatar_url=auth.user.avatar_url,
            room_number=None,
            bed_label=None,
            property_name=None,
            rent_paise=None,
        )


@router.post("/my/phone/otp/request")
def request_my_phone_otp(
    body: MyPhoneOtpRequest,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Owners/managers change their login phone after verifying the new number."""
    new_phone = body.new_phone
    if new_phone == auth.user.phone:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "New number is the same as your current number",
        )
    existing = db.execute(select(User).where(User.phone == new_phone)).scalar_one_or_none()
    if existing and existing.id != auth.user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This phone number is already registered")

    code = issue_otp(db, new_phone)
    settings = get_settings()
    return {"phone": new_phone, "dev_code": code if settings.otp_dev_mode else None}


@router.post("/my/phone/otp/verify", response_model=MyProfile)
def verify_my_phone_otp(
    body: MyPhoneOtpVerify,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    if not verify_otp(db, body.new_phone, body.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired OTP")

    existing = db.execute(select(User).where(User.phone == body.new_phone)).scalar_one_or_none()
    if existing and existing.id != auth.user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This phone number is already registered")

    old_phone = auth.user.phone
    auth.user.phone = body.new_phone

    # Keep any tenant identity linked to this phone in the active PG in sync.
    if auth.org_id:
        tenants = db.execute(
            select(Tenant).where(
                Tenant.organization_id == auth.org_id,
                Tenant.phone == old_phone,
            )
        ).scalars().all()
        for tenant in tenants:
            tenant.phone = body.new_phone

    db.commit()
    db.refresh(auth.user)
    return my_profile_full(auth=auth, db=db)


@router.post("/my/change-password")
def change_my_password(
    body: MyPasswordUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    user = auth.user
    if not user.password_hash or not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


@router.patch("/my/avatar")
def update_my_avatar(
    body: MyAvatarUpdate,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    user = auth.user
    user.avatar_url = body.avatar_url
    db.commit()
    return my_profile_full(auth=auth, db=db)


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
