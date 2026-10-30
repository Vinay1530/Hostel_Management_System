import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_org
from app.models.enums import Role
from app.models.models import Bed, Floor, Property, Room, Stay, Tenant
from app.schemas.schemas import (
    SearchOut,
    SearchPropertyResult,
    SearchRoomResult,
    SearchTenantResult,
    TenantSearchProfile,
)

router = APIRouter(tags=["search"])
SEARCH_TYPES = {"pg", "room", "tenant"}


def _tenant_property_id(db: Session, auth: AuthContext) -> uuid.UUID | None:
    tenant = db.execute(
        select(Tenant).where(
            Tenant.organization_id == auth.org_id,
            Tenant.phone == auth.user.phone,
        )
    ).scalar_one_or_none()
    if tenant is None:
        return None
    return db.execute(
        select(Floor.property_id)
        .join(Room, Room.floor_id == Floor.id)
        .join(Bed, Bed.room_id == Room.id)
        .join(Stay, Stay.bed_id == Bed.id)
        .where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
        .limit(1)
    ).scalar_one_or_none()


def _pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/search", response_model=SearchOut)
def search(
    q: str = Query(min_length=2, max_length=50),
    types: str | None = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    query = q.strip()
    if len(query) < 2:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Search query must contain at least 2 characters")
    requested = set(types.split(",")) if types else SEARCH_TYPES
    if not requested or not requested.issubset(SEARCH_TYPES):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "types must contain pg, room, or tenant")

    pattern = _pattern(query)
    is_staff = auth.role in (Role.owner, Role.manager)
    property_id = None if is_staff else _tenant_property_id(db, auth)
    pgs: list[SearchPropertyResult] = []
    rooms: list[SearchRoomResult] = []
    tenants: list[SearchTenantResult] = []

    if "pg" in requested:
        stmt = (
            select(
                Property,
                func.count(func.distinct(Bed.id)).label("total_beds"),
                func.count(func.distinct(Stay.bed_id)).label("occupied_beds"),
            )
            .outerjoin(Floor, Floor.property_id == Property.id)
            .outerjoin(Room, Room.floor_id == Floor.id)
            .outerjoin(Bed, Bed.room_id == Room.id)
            .outerjoin(Stay, (Stay.bed_id == Bed.id) & Stay.active.is_(True))
            .where(
                Property.organization_id == auth.org_id,
                or_(
                    Property.name.ilike(pattern, escape="\\"),
                    Property.locality.ilike(pattern, escape="\\"),
                    Property.city.ilike(pattern, escape="\\"),
                ),
            )
            .group_by(Property.id)
            .order_by(Property.name)
            .limit(10)
        )
        if not is_staff:
            stmt = stmt.where(Property.id == property_id) if property_id else stmt.where(False)
        pgs = [
            SearchPropertyResult(
                id=prop.id,
                name=prop.name,
                locality=prop.locality,
                city=prop.city,
                occupied_beds=occupied,
                total_beds=total,
            )
            for prop, total, occupied in db.execute(stmt).all()
        ]

    if "room" in requested:
        stmt = (
            select(Room, Floor.property_id, Floor.name, Property.name)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Property, Property.id == Floor.property_id)
            .where(
                Room.organization_id == auth.org_id,
                or_(
                    Room.number.ilike(pattern, escape="\\"),
                    Property.name.ilike(pattern, escape="\\"),
                ),
            )
            .order_by(Property.name, Floor.name, Room.number)
            .limit(10)
        )
        if not is_staff:
            stmt = stmt.where(Floor.property_id == property_id) if property_id else stmt.where(False)
        rooms = [
            SearchRoomResult(
                id=room.id,
                property_id=prop_id,
                number=room.number,
                property_name=property_name,
                floor=floor_name,
                sharing_type=room.sharing_type,
            )
            for room, prop_id, floor_name, property_name in db.execute(stmt).all()
        ]

    if "tenant" in requested:
        stmt = (
            select(Tenant, Property.id, Property.name, Room.number)
            .join(Stay, (Stay.tenant_id == Tenant.id) & Stay.active.is_(True))
            .join(Bed, Bed.id == Stay.bed_id)
            .join(Room, Room.id == Bed.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Property, Property.id == Floor.property_id)
            .where(
                Tenant.organization_id == auth.org_id,
                or_(
                    Tenant.full_name.ilike(pattern, escape="\\"),
                    *([Tenant.phone.ilike(pattern, escape="\\")] if is_staff else []),
                ),
            )
            .order_by(Tenant.full_name)
            .limit(10)
        )
        if not is_staff:
            stmt = stmt.where(Property.id == property_id) if property_id else stmt.where(False)
        tenants = [
            SearchTenantResult(
                id=tenant.id,
                full_name=tenant.full_name,
                phone=tenant.phone if is_staff else None,
                property_id=prop_id,
                property_name=property_name,
                room_number=room_number,
            )
            for tenant, prop_id, property_name, room_number in db.execute(stmt).all()
        ]

    return SearchOut(pgs=pgs, rooms=rooms, tenants=tenants)


@router.get("/search/tenants/{tenant_id}", response_model=TenantSearchProfile)
def get_search_tenant_profile(
    tenant_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Tenant, Property.name, Room.number, Stay.start_date)
        .join(Stay, (Stay.tenant_id == Tenant.id) & Stay.active.is_(True))
        .join(Bed, Bed.id == Stay.bed_id)
        .join(Room, Room.id == Bed.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .join(Property, Property.id == Floor.property_id)
        .where(Tenant.id == tenant_id, Tenant.organization_id == auth.org_id)
    )
    if auth.role == Role.tenant:
        own_property_id = _tenant_property_id(db, auth)
        stmt = stmt.where(Property.id == own_property_id) if own_property_id else stmt.where(False)
    row = db.execute(stmt.limit(1)).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    tenant, property_name, room_number, move_in_date = row
    return TenantSearchProfile(
        id=tenant.id,
        full_name=tenant.full_name,
        phone=tenant.phone if auth.role in (Role.owner, Role.manager) else None,
        property_name=property_name,
        room_number=room_number,
        move_in_date=move_in_date,
    )
