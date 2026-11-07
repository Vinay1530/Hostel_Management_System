import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.api.properties import _floor_sort_key
from app.models.models import OccupancyMap, Bed, Room, Floor, Property, Stay, Tenant
from app.schemas.schemas import OccupancyAssignIn, OccupancyAssignOut, OccupancyMapIn, OccupancyMapOut
from app.services.collaboration import sync_tenant_participation

router = APIRouter(tags=["occupancy-map"])


def _floor_number(floor: Floor) -> int:
    key = _floor_sort_key(floor.name)
    return 1 if key < 0 else key + 2


def _property_of_bed(db, org_id, bed_id) -> Property:
    return db.execute(
        select(Property)
        .join(Floor, Floor.property_id == Property.id)
        .join(Room, Room.floor_id == Floor.id)
        .join(Bed, Bed.room_id == Room.id)
        .where(Bed.id == bed_id, Property.organization_id == org_id)
    ).scalar_one()


def _sync_map_for_stay(db: Session, org_id, bed_id, tenant_id) -> None:
    """Keep the occupancy map row for `bed_id` reflecting the given stay state.

    Called from stay create/end and move requests so the map stays live even
    when tenants are managed from other screens."""
    map_entry = db.execute(
        select(OccupancyMap).where(OccupancyMap.organization_id == org_id, OccupancyMap.bed_id == bed_id)
    ).scalar_one_or_none()
    if map_entry is None:
        return
    map_entry.is_occupied = tenant_id is not None
    map_entry.tenant_id = tenant_id


@router.post("/occupancy-maps", response_model=OccupancyMapOut, status_code=201)
def create_occupancy_map(
    body: OccupancyMapIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    bed = db.get(Bed, body.bed_id)
    if bed is None or bed.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")

    existing = db.execute(
        select(OccupancyMap).where(OccupancyMap.bed_id == body.bed_id)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Occupancy map entry already exists for this bed")

    map_entry = OccupancyMap(
        organization_id=auth.org_id,
        property_id=body.property_id,
        floor_id=body.floor_id,
        room_id=body.room_id,
        bed_id=body.bed_id,
        x_position=body.x_position,
        y_position=body.y_position,
        floor_number=body.floor_number,
        room_number=body.room_number,
        bed_label=body.bed_label,
        is_occupied=body.is_occupied,
    )
    db.add(map_entry)
    db.commit()
    db.refresh(map_entry)
    return map_entry


@router.get("/occupancy-maps/{property_id}", response_model=list[OccupancyMapOut])
def list_occupancy_maps(
    property_id: uuid.UUID,
    floor_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(OccupancyMap).where(
        OccupancyMap.organization_id == auth.org_id,
        OccupancyMap.property_id == property_id,
    )

    if floor_id:
        stmt = stmt.where(OccupancyMap.floor_id == floor_id)

    stmt = stmt.order_by(OccupancyMap.floor_number, OccupancyMap.room_number, OccupancyMap.bed_label)

    maps = db.execute(stmt).scalars().all()
    return maps


@router.patch("/occupancy-maps/{map_id}", response_model=OccupancyMapOut)
def update_occupancy_map(
    map_id: uuid.UUID,
    body: OccupancyMapOut,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    map_entry = db.execute(
        select(OccupancyMap)
        .where(OccupancyMap.id == map_id, OccupancyMap.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if map_entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Occupancy map entry not found")

    map_entry.x_position = body.x_position
    map_entry.y_position = body.y_position
    map_entry.floor_number = body.floor_number
    map_entry.room_number = body.room_number
    map_entry.bed_label = body.bed_label
    map_entry.is_occupied = body.is_occupied
    map_entry.tenant_id = body.tenant_id

    db.commit()
    db.refresh(map_entry)
    return map_entry


@router.delete("/occupancy-maps/{map_id}", status_code=204)
def delete_occupancy_map(
    map_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    map_entry = db.execute(
        select(OccupancyMap)
        .where(OccupancyMap.id == map_id, OccupancyMap.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if map_entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Occupancy map entry not found")

    db.delete(map_entry)
    db.commit()


@router.post("/occupancy-maps/{map_id}/assign", response_model=OccupancyAssignOut, status_code=201)
def assign_tenant_to_bed(
    map_id: uuid.UUID,
    body: OccupancyAssignIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Allocate a tenant onto a bed straight from the occupancy map.

    Creates an active Stay for the bed and flips the map tile to occupied."""
    map_entry = db.execute(
        select(OccupancyMap)
        .where(OccupancyMap.id == map_id, OccupancyMap.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if map_entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Occupancy map entry not found")

    tenant = db.get(Tenant, body.tenant_id)
    if tenant is None or tenant.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    bed_occupied = db.execute(
        select(Stay).where(Stay.bed_id == map_entry.bed_id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if bed_occupied:
        raise HTTPException(status.HTTP_409_CONFLICT, "This bed is already occupied")

    tenant_occupied = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if tenant_occupied:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tenant already has an active stay")

    stay = Stay(
        organization_id=auth.org_id,
        tenant_id=tenant.id,
        bed_id=map_entry.bed_id,
        start_date=body.start_date,
        agreed_rent_paise=body.agreed_rent_paise,
        deposit_paise=body.deposit_paise,
    )
    db.add(stay)
    db.flush()

    prop = _property_of_bed(db, auth.org_id, map_entry.bed_id)
    sync_tenant_participation(db, prop, tenant, joined=True)

    map_entry.is_occupied = True
    map_entry.tenant_id = tenant.id

    db.commit()
    db.refresh(stay)
    db.refresh(map_entry)
    return OccupancyAssignOut(map=map_entry, stay_id=stay.id)


@router.post("/occupancy-maps/{map_id}/vacate", response_model=OccupancyMapOut)
def vacate_occupancy_bed(
    map_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """End the active stay on this bed and free the map tile."""
    map_entry = db.execute(
        select(OccupancyMap)
        .where(OccupancyMap.id == map_id, OccupancyMap.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if map_entry is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Occupancy map entry not found")

    stay = db.execute(
        select(Stay).where(Stay.bed_id == map_entry.bed_id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if stay is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active stay on this bed")

    from datetime import date as _date

    stay.end_date = _date.today()
    stay.active = False

    prop = _property_of_bed(db, auth.org_id, map_entry.bed_id)
    db.flush()
    sync_tenant_participation(db, prop, stay.tenant, joined=False)

    map_entry.is_occupied = False
    map_entry.tenant_id = None

    db.commit()
    db.refresh(map_entry)
    return map_entry


@router.post("/occupancy-maps/{property_id}/seed", response_model=list[OccupancyMapOut], status_code=201)
def seed_occupancy_map(
    property_id: uuid.UUID,
    floor_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Create grid map entries for every bed of the property that has no entry yet.

    Beds are ordered floor -> room -> bed label and laid out 8 per row, so the
    map is usable immediately without manual placement."""
    prop = db.execute(
        select(Property).where(Property.id == property_id, Property.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if prop is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")

    stmt = (
        select(Bed, Room, Floor)
        .join(Room, Room.id == Bed.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .where(Floor.property_id == property_id)
        .order_by(Floor.name, Room.number, Bed.label)
    )
    if floor_id:
        stmt = stmt.where(Floor.id == floor_id)
    rows = db.execute(stmt).all()

    existing_beds = {
        m.bed_id
        for m in db.execute(
            select(OccupancyMap).where(OccupancyMap.organization_id == auth.org_id, OccupancyMap.property_id == property_id)
        ).scalars().all()
    }

    created: list[OccupancyMap] = []
    for idx, (bed, room, floor) in enumerate(rows):
        if bed.id in existing_beds:
            continue
        active = db.execute(
            select(Stay).where(Stay.bed_id == bed.id, Stay.active.is_(True))
        ).scalar_one_or_none()
        map_entry = OccupancyMap(
            organization_id=auth.org_id,
            property_id=property_id,
            floor_id=floor.id,
            room_id=room.id,
            bed_id=bed.id,
            x_position=idx % 8,
            y_position=idx // 8,
            floor_number=_floor_number(floor),
            room_number=room.number,
            bed_label=bed.label,
            is_occupied=active is not None,
            tenant_id=active.tenant_id if active else None,
        )
        db.add(map_entry)
        created.append(map_entry)

    db.commit()
    for m in created:
        db.refresh(m)
    return created