import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, get_auth_context
from app.models.enums import Role
from app.models.models import Bed, RentInvoice, Room, Stay, Tenant

router = APIRouter(tags=["my"])


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
    room_number: str | None
    bed_label: str | None
    property_name: str | None
    rent_paise: int | None


class MyOverview(BaseModel):
    profile: MyProfile
    invoices: list[MyDuesRow]


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
        from app.services.billing import property_for_stay

        prop = property_for_stay(db, auth.org_id, stay)
        profile = MyProfile(
            full_name=tenant.full_name,
            phone=tenant.phone,
            room_number=room.number,
            bed_label=bed.label,
            property_name=prop.name if prop else None,
            rent_paise=stay.agreed_rent_paise,
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
        from app.services.billing import property_for_stay as _pfs

        prop = _pfs(db, auth.org_id, inv.stay)
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
