import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_org, require_staff
from app.models.enums import BedStatus
from app.models.enums import Role
from app.models.models import Bed, Floor, Membership, Organization, Property, Room, Stay, Tenant, User
from app.services.collaboration import ensure_property_conversations
from app.schemas.schemas import (
    BedGrid,
    BedIn,
    BedOut,
    BulkBedsIn,
    FloorGrid,
    FloorIn,
    FloorOut,
    GridOut,
    LayoutIn,
    LayoutOut,
    LayoutRoomSummary,
    LayoutFloorSummary,
    PropertyGrid,
    PropertyIn,
    PropertyDetailOut,
    PropertyListOut,
    PropertyOut,
    PropertyRoomSummary,
    PropertyUpdate,
    RoomBedDetail,
    RoomDetailOut,
    RoomGrid,
    RoomIn,
    RoomOut,
    RoomTenantDetail,
    RoomUpdate,
)

FLOOR_NAMES = ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]


def _floor_sort_key(name: str) -> int:
    if name == "Ground":
        return -1
    for idx, label in enumerate(FLOOR_NAMES):
        if name == label:
            return idx
    return 1000 + len(name)
BED_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

router = APIRouter(tags=["properties"])


def _own_property(db: Session, org_id: uuid.UUID, property_id: uuid.UUID) -> Property:
    p = db.get(Property, property_id)
    if p is None or p.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    return p


def _own_floor(db: Session, org_id: uuid.UUID, floor_id: uuid.UUID) -> Floor:
    f = db.get(Floor, floor_id)
    if f is None or f.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Floor not found")
    return f


def _own_room(db: Session, org_id: uuid.UUID, room_id: uuid.UUID) -> Room:
    r = db.get(Room, room_id)
    if r is None or r.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    return r


def _own_bed(db: Session, org_id: uuid.UUID, bed_id: uuid.UUID) -> Bed:
    b = db.get(Bed, bed_id)
    if b is None or b.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    return b


def _active_property_id(db: Session, auth: AuthContext) -> uuid.UUID | None:
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


def _visible_property(
    db: Session, auth: AuthContext, property_id: uuid.UUID
) -> Property:
    prop = db.execute(
        select(Property).where(
            Property.id == property_id,
            Property.organization_id == auth.org_id,
        )
    ).scalar_one_or_none()
    if prop is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    if auth.role in (Role.owner, Role.manager):
        return prop
    if auth.role == Role.tenant and _active_property_id(db, auth) == prop.id:
        return prop
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")


# ---------- properties ----------

@router.get("/properties", response_model=list[PropertyListOut])
def list_properties(auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Property,
            func.count(func.distinct(Room.id)).label("total_rooms"),
            func.count(func.distinct(Bed.id)).label("total_beds"),
            func.count(func.distinct(Stay.bed_id)).label("occupied_beds"),
            func.count(
                func.distinct(
                    case(((Bed.status == BedStatus.vacant) & Stay.id.is_(None), Bed.id))
                )
            ).label("vacant_beds"),
        )
        .outerjoin(Floor, Floor.property_id == Property.id)
        .outerjoin(Room, Room.floor_id == Floor.id)
        .outerjoin(Bed, Bed.room_id == Room.id)
        .outerjoin(Stay, (Stay.bed_id == Bed.id) & Stay.active.is_(True))
        .where(Property.organization_id == auth.org_id)
        .group_by(Property.id)
        .order_by(Property.created_at)
    ).all()
    return [
        PropertyListOut.model_validate(prop).model_copy(
            update={
                "total_rooms": total_rooms,
                "total_beds": total_beds,
                "occupied_beds": occupied_beds,
                "vacant_beds": vacant_beds,
            }
        )
        for prop, total_rooms, total_beds, occupied_beds, vacant_beds in rows
    ]


@router.get("/properties/{property_id}", response_model=PropertyDetailOut)
def get_property_details(
    property_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    prop = _visible_property(db, auth, property_id)
    total_rooms, total_beds, occupied_beds, vacant_beds = db.execute(
        select(
            func.count(func.distinct(Room.id)),
            func.count(func.distinct(Bed.id)),
            func.count(func.distinct(Stay.bed_id)),
            func.count(
                func.distinct(
                    case(((Bed.status == BedStatus.vacant) & Stay.id.is_(None), Bed.id))
                )
            ),
        )
        .select_from(Floor)
        .outerjoin(Room, Room.floor_id == Floor.id)
        .outerjoin(Bed, Bed.room_id == Room.id)
        .outerjoin(Stay, (Stay.bed_id == Bed.id) & Stay.active.is_(True))
        .where(Floor.property_id == prop.id)
    ).one()
    owner = db.execute(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(
            Membership.organization_id == prop.organization_id,
            Membership.role == Role.owner,
        )
        .order_by(User.id)
        .limit(1)
    ).scalar_one_or_none()
    organization = db.get(Organization, prop.organization_id)
    return PropertyDetailOut.model_validate(prop).model_copy(
        update={
            "owner_name": owner.name if owner else None,
            "contact_phone": organization.contact_phone if organization else None,
            "total_rooms": total_rooms,
            "total_beds": total_beds,
            "occupied_beds": occupied_beds,
            "vacant_beds": vacant_beds,
        }
    )


@router.get("/properties/{property_id}/rooms", response_model=list[PropertyRoomSummary])
def list_property_room_summaries(
    property_id: uuid.UUID,
    floor: str | None = None,
    room_status: str | None = Query(None, alias="status"),
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    _visible_property(db, auth, property_id)
    if room_status not in (None, "vacant", "partially_filled", "full"):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "status must be vacant, partially_filled, or full",
        )
    stmt = (
        select(
            Room,
            Floor.name,
            func.count(func.distinct(Bed.id)).label("total_beds"),
            func.count(func.distinct(Stay.bed_id)).label("occupied_beds"),
        )
        .join(Floor, Floor.id == Room.floor_id)
        .outerjoin(Bed, Bed.room_id == Room.id)
        .outerjoin(Stay, (Stay.bed_id == Bed.id) & Stay.active.is_(True))
        .where(Floor.property_id == property_id)
        .group_by(Room.id, Floor.name)
        .order_by(Floor.name, Room.number)
    )
    if floor:
        stmt = stmt.where(Floor.name == floor)
    results = []
    for room, floor_name, total_beds, occupied_beds in db.execute(stmt).all():
        status_name = (
            "vacant" if occupied_beds == 0
            else "full" if occupied_beds >= total_beds
            else "partially_filled"
        )
        if room_status and room_status != status_name:
            continue
        results.append(
            PropertyRoomSummary(
                id=room.id,
                number=room.number,
                floor=floor_name,
                sharing_type=room.sharing_type,
                total_beds=total_beds,
                occupied_beds=occupied_beds,
                status=status_name,
            )
        )
    results.sort(key=lambda room: (_floor_sort_key(room.floor), room.number))
    return results


@router.post("/properties", response_model=PropertyOut, status_code=201)
def create_property(body: PropertyIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    p = Property(organization_id=auth.org_id, **body.model_dump())
    db.add(p)
    db.flush()
    ensure_property_conversations(db, p)
    db.commit()
    db.refresh(p)
    return p


@router.patch("/properties/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: uuid.UUID, body: PropertyUpdate,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    p = _own_property(db, auth.org_id, property_id)
    old_facilities = p.facilities
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    # Auto-attach: rooms that still mirror the PG's previous facilities (i.e. were
    # never customized individually) pick up the new PG-level set. Rooms the manager
    # edited on their own keep their custom list.
    if body.facilities is not None:
        rooms = (
            db.execute(
                select(Room)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Floor.property_id == p.id)
            )
            .scalars()
            .all()
        )
        for r in rooms:
            if r.facilities is None or r.facilities == old_facilities:
                r.facilities = p.facilities
    db.commit()
    db.refresh(p)
    return p


@router.delete("/properties/{property_id}", status_code=204)
def delete_property(property_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    p = _own_property(db, auth.org_id, property_id)
    active = db.execute(
        select(Stay)
        .join(Bed, Bed.id == Stay.bed_id)
        .join(Room, Room.id == Bed.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .where(Floor.property_id == p.id, Stay.active.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Property has active tenants — end their stays (vacate) before deleting it",
        )
    db.delete(p)
    db.commit()


# ---------- layout wizard (bulk PG creation) ----------

@router.post("/properties/layout", response_model=LayoutOut, status_code=201)
def create_layout(
    body: LayoutIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Creates the whole PG: floors, auto-numbered rooms (Ground 001.., 1st 101..),
    and default beds per room. Room facilities get assigned afterwards per room."""
    prop = Property(
        organization_id=auth.org_id,
        name=body.name,
        address=body.address,
        city=body.city,
        locality=body.locality,
        facilities=body.facilities,
    )
    db.add(prop)
    db.flush()
    ensure_property_conversations(db, prop)

    floor_out: list[LayoutFloorSummary] = []
    total_rooms = total_beds = 0

    for fi in range(body.no_of_floors):
        floor = Floor(
            organization_id=auth.org_id,
            property_id=prop.id,
            name=FLOOR_NAMES[fi] if fi < len(FLOOR_NAMES) else f"F{fi}",
        )
        db.add(floor)
        db.flush()

        prefix = fi * 100
        rooms_summary: list[LayoutRoomSummary] = []
        for ri in range(1, body.rooms_per_floor + 1):
            room = Room(
                organization_id=auth.org_id,
                floor_id=floor.id,
                number=f"{prefix + ri:03d}",
                sharing_type=body.beds_per_room,
                facilities=body.facilities,  # PG facilities auto-attach to every room; editable per room later
            )
            db.add(room)
            db.flush()
            db.add_all(
                Bed(
                    organization_id=auth.org_id,
                    room_id=room.id,
                    label=BED_LETTERS[bi],
                    rent_paise=body.rent_paise,
                    deposit_paise=body.deposit_paise,
                )
                for bi in range(body.beds_per_room)
            )
            beds = body.beds_per_room
            total_rooms += 1
            total_beds += beds
            rooms_summary.append(
                LayoutRoomSummary(id=room.id, number=room.number, facilities=room.facilities, beds=beds)
            )
        floor_out.append(LayoutFloorSummary(id=floor.id, name=floor.name, rooms=rooms_summary))

    db.commit()
    return LayoutOut(
        property_id=prop.id,
        property_name=prop.name,
        floors=floor_out,
        totals={
            "floors": body.no_of_floors,
            "rooms": total_rooms,
            "beds": total_beds,
        },
    )


# ---------- room editing (facilities, bed count) ----------

@router.patch("/rooms/{room_id}", response_model=RoomOut)
def update_room(
    room_id: uuid.UUID, body: RoomUpdate,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    """Edit a room after creation: facilities, room number, bed count (vacant-only removal),
    and apply a rent/deposit to all its beds at once."""
    room = _own_room(db, auth.org_id, room_id)
    data = body.model_dump(exclude_unset=True)
    rent = data.pop("bed_rent_paise", None)
    deposit = data.pop("bed_deposit_paise", None)
    beds_count = data.pop("beds_count", None)

    for k, v in data.items():
        setattr(room, k, v)

    beds = db.execute(select(Bed).where(Bed.room_id == room.id).order_by(Bed.label)).scalars().all()
    active_stay_bed_ids = set(
        db.execute(select(Stay.bed_id).where(Stay.active.is_(True))).scalars().all()
    )

    if rent is not None or deposit is not None:
        for b in beds:
            if rent is not None:
                b.rent_paise = rent
            if deposit is not None:
                b.deposit_paise = deposit

    if beds_count is not None and beds_count != len(beds):
        if beds_count > len(beds):
            existing = {b.label for b in beds}
            n = len(beds)
            new_count = beds_count - len(beds)
            new_labels = []
            i = 0
            while len(new_labels) < new_count and i < len(BED_LETTERS):
                label = BED_LETTERS[i]
                i += 1
                if label not in existing:
                    new_labels.append(label)
            if len(new_labels) < new_count:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Too many beds (labels exhausted)")
            db.add_all(
                Bed(
                    organization_id=auth.org_id,
                    room_id=room.id,
                    label=label,
                    rent_paise=rent if rent is not None else (beds[0].rent_paise if beds else 0),
                    deposit_paise=deposit if deposit is not None else (beds[0].deposit_paise if beds else 0),
                )
                for label in new_labels
            )
        else:
            # prefer freeing beds at the "end" of the label sequence (D removed before A)
            vacants = [b for b in beds if b.id not in active_stay_bed_ids][::-1]
            to_remove = len(beds) - beds_count
            if to_remove > len(vacants):
                raise HTTPException(
                    status.HTTP_409_CONFLICT,
                    f"Only {len(vacants)} vacant bed(s) removable; {to_remove} removals requested (occupied beds are protected)",
                )
            for b in vacants[:to_remove]:
                db.delete(b)

    db.flush()
    room.sharing_type = len(db.execute(select(Bed).where(Bed.room_id == room.id)).scalars().all()) or 1
    db.commit()
    db.refresh(room)
    return room


# ---------- floors ----------

@router.get("/properties/{property_id}/floors", response_model=list[FloorOut])
def list_floors(property_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    _own_property(db, auth.org_id, property_id)
    floors = db.execute(select(Floor).where(Floor.property_id == property_id)).scalars().all()
    return sorted(floors, key=lambda f: _floor_sort_key(f.name))


@router.post("/properties/{property_id}/floors", response_model=FloorOut, status_code=201)
def create_floor(
    property_id: uuid.UUID, body: FloorIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    _own_property(db, auth.org_id, property_id)
    f = Floor(organization_id=auth.org_id, property_id=property_id, name=body.name)
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.patch("/floors/{floor_id}", response_model=FloorOut)
def rename_floor(
    floor_id: uuid.UUID, body: FloorIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    f = _own_floor(db, auth.org_id, floor_id)
    f.name = body.name
    db.commit()
    db.refresh(f)
    return f


@router.delete("/floors/{floor_id}", status_code=204)
def delete_floor(floor_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    f = _own_floor(db, auth.org_id, floor_id)
    active = db.execute(
        select(Stay)
        .join(Bed, Bed.id == Stay.bed_id)
        .join(Room, Room.id == Bed.room_id)
        .where(Room.floor_id == f.id, Stay.active.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Floor has active tenants — vacate the occupied beds before deleting it",
        )
    db.delete(f)
    db.commit()


# ---------- rooms ----------

@router.get("/floors/{floor_id}/rooms", response_model=list[RoomOut])
def list_rooms(floor_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    _own_floor(db, auth.org_id, floor_id)
    return db.execute(
        select(Room).where(Room.floor_id == floor_id).order_by(Room.number)
    ).scalars().all()


@router.post("/floors/{floor_id}/rooms", response_model=RoomOut, status_code=201)
def create_room(
    floor_id: uuid.UUID, body: RoomIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    _own_floor(db, auth.org_id, floor_id)
    r = Room(organization_id=auth.org_id, floor_id=floor_id, number=body.number, sharing_type=body.sharing_type)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


@router.get("/rooms/{room_id}", response_model=RoomDetailOut)
def get_room(
    room_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    row = db.execute(
        select(Room, Floor.name, Floor.property_id)
        .join(Floor, Floor.id == Room.floor_id)
        .where(Room.id == room_id, Room.organization_id == auth.org_id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Room not found")
    room, floor_name, property_id = row
    _visible_property(db, auth, property_id)
    bed_rows = db.execute(
        select(Bed, Stay, Tenant)
        .outerjoin(Stay, (Stay.bed_id == Bed.id) & Stay.active.is_(True))
        .outerjoin(Tenant, Tenant.id == Stay.tenant_id)
        .where(Bed.room_id == room.id)
        .order_by(Bed.label)
    ).all()
    beds = [
        RoomBedDetail(
            id=bed.id,
            label=bed.label,
            rent_paise=bed.rent_paise,
            deposit_paise=bed.deposit_paise,
            status=bed.status,
            tenant=(
                RoomTenantDetail(
                    tenant_id=tenant.id,
                    tenant_name=tenant.full_name,
                    move_in_date=stay.start_date,
                )
                if stay is not None and tenant is not None
                else None
            ),
        )
        for bed, stay, tenant in bed_rows
    ]
    return RoomDetailOut(
        id=room.id,
        property_id=property_id,
        number=room.number,
        floor=floor_name,
        sharing_type=room.sharing_type,
        facilities=room.facilities,
        beds=beds,
    )


@router.delete("/rooms/{room_id}", status_code=204)
def delete_room(room_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    r = _own_room(db, auth.org_id, room_id)
    active = db.execute(
        select(Stay)
        .join(Bed, Bed.id == Stay.bed_id)
        .where(Bed.room_id == r.id, Stay.active.is_(True))
        .limit(1)
    ).scalar_one_or_none()
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Room has active tenants — vacate the occupied beds before deleting it",
        )
    db.delete(r)
    db.commit()


# ---------- beds ----------

@router.get("/rooms/{room_id}/beds", response_model=list[BedGrid])
def list_beds(room_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    """Bed list with occupancy derived from active stays (like the grid)."""
    _own_room(db, auth.org_id, room_id)
    beds = db.execute(
        select(Bed).where(Bed.room_id == room_id).order_by(Bed.label)
    ).scalars().all()
    stay_src = (
        select(Stay, Tenant.full_name)
        .join(Tenant, Tenant.id == Stay.tenant_id)
        .where(Stay.active.is_(True), Stay.bed_id.in_([b.id for b in beds] or [uuid.uuid4()]))
    )
    stay_by_bed: dict[uuid.UUID, Stay] = {}
    name_by_stay_bed: dict[uuid.UUID, str | None] = {}
    for stay, name in db.execute(stay_src).all():
        stay_by_bed[stay.bed_id] = stay
        name_by_stay_bed[stay.bed_id] = name
    out: list[BedGrid] = []
    for b in beds:
        stay = stay_by_bed.get(b.id)
        out.append(
            BedGrid(
                id=b.id,
                label=b.label,
                rent_paise=b.rent_paise,
                deposit_paise=b.deposit_paise,
                status=(
                    BedStatus.maintenance if b.status == BedStatus.maintenance
                    else BedStatus.occupied if stay
                    else BedStatus.vacant
                ),
                tenant_id=stay.tenant_id if stay else None,
                stay_id=stay.id if stay else None,
                tenant_name=name_by_stay_bed.get(b.id),
            )
        )
    return out


@router.post("/rooms/{room_id}/beds", response_model=BedOut, status_code=201)
def create_bed(
    room_id: uuid.UUID, body: BedIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    _own_room(db, auth.org_id, room_id)
    exists = db.execute(select(Bed).where(Bed.room_id == room_id, Bed.label == body.label)).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Bed '{body.label}' already exists in this room")
    b = Bed(organization_id=auth.org_id, room_id=room_id, **body.model_dump())
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@router.post("/rooms/{room_id}/beds/bulk", response_model=list[BedOut], status_code=201)
def create_beds_bulk(
    room_id: uuid.UUID, body: BulkBedsIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    """Create multiple beds for a room at once, e.g. labels A,B,C same rent."""
    _own_room(db, auth.org_id, room_id)
    existing = {
        lbl for (lbl,) in db.execute(select(Bed.label).where(Bed.room_id == room_id)).all()
    }
    dupes = [l for l in body.labels if l in existing]
    if dupes:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Labels already exist: {', '.join(dupes)}")
    beds = [
        Bed(
            organization_id=auth.org_id,
            room_id=room_id,
            label=label,
            rent_paise=body.rent_paise,
            deposit_paise=body.deposit_paise,
        )
        for label in body.labels
    ]
    db.add_all(beds)
    db.commit()
    for b in beds:
        db.refresh(b)
    return sorted(beds, key=lambda b: b.label)


@router.patch("/beds/{bed_id}", response_model=BedOut)
def update_bed(
    bed_id: uuid.UUID, body: BedIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    b = _own_bed(db, auth.org_id, bed_id)
    for k, v in body.model_dump().items():
        setattr(b, k, v)
    db.commit()
    db.refresh(b)
    return b


@router.delete("/beds/{bed_id}", status_code=204)
def delete_bed(bed_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    b = _own_bed(db, auth.org_id, bed_id)
    active = db.execute(
        select(Stay).where(Stay.bed_id == b.id, Stay.active.is_(True)).limit(1)
    ).scalar_one_or_none()
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Bed is occupied — end the tenant's stay (vacate) before deleting it",
        )
    db.delete(b)
    db.commit()


# ---------- occupancy grid (key screen) ----------

@router.get("/occupancy-grid", response_model=GridOut)
def occupancy_grid(auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    """Visual occupancy data: properties -> floors -> rooms -> beds, with the
    active stay's tenant attached to each occupied bed."""
    active_stays = db.execute(
        select(Stay).where(Stay.organization_id == auth.org_id, Stay.active.is_(True))
    ).scalars().all()
    tenant_ids = {s.tenant_id for s in active_stays}
    tenants = {
        t.id: t
        for t in db.execute(select(Tenant).where(Tenant.id.in_(tenant_ids))).scalars().all()
    } if tenant_ids else {}
    stay_by_bed = {s.bed_id: s for s in active_stays}

    properties = db.execute(
        select(Property).where(Property.organization_id == auth.org_id).order_by(Property.created_at)
    ).scalars().all()

    out: list[PropertyGrid] = []
    total_beds = occupied = maintenance = 0

    for p in properties:
        floors = db.execute(
            select(Floor).where(Floor.property_id == p.id)
        ).scalars().all()
        floors = sorted(floors, key=lambda f: _floor_sort_key(f.name))
        floor_grids: list[FloorGrid] = []

        for f in floors:
            rooms = db.execute(
                select(Room).where(Room.floor_id == f.id).order_by(Room.number)
            ).scalars().all()
            room_grids: list[RoomGrid] = []

            for r in rooms:
                beds = db.execute(
                    select(Bed).where(Bed.room_id == r.id).order_by(Bed.label)
                ).scalars().all()
                bed_grids: list[BedGrid] = []

                for b in beds:
                    total_beds += 1
                    stay = stay_by_bed.get(b.id)
                    if b.status == BedStatus.maintenance:
                        maintenance += 1
                    elif stay:
                        occupied += 1
                    effective_status = (
                        BedStatus.maintenance if b.status == BedStatus.maintenance
                        else BedStatus.occupied if stay
                        else BedStatus.vacant
                    )
                    bed_grids.append(
                        BedGrid(
                            id=b.id,
                            label=b.label,
                            rent_paise=b.rent_paise,
                            deposit_paise=b.deposit_paise,
                            status=effective_status,
                            tenant_name=tenants[stay.tenant_id].full_name if stay else None,
                            tenant_id=stay.tenant_id if stay else None,
                            stay_id=stay.id if stay else None,
                        )
                    )
                room_grids.append(RoomGrid(id=r.id, number=r.number, sharing_type=r.sharing_type, facilities=r.facilities, beds=bed_grids))
            floor_grids.append(FloorGrid(id=f.id, name=f.name, rooms=room_grids))

        out.append(
            PropertyGrid(
                id=p.id,
                property_id=p.id,
                name=p.name,
                address=p.address,
                city=p.city,
                locality=p.locality,
                floors=floor_grids,
            )
        )

    return GridOut(
        properties=out,
        totals={
            "beds": total_beds,
            "occupied": occupied,
            "vacant": total_beds - occupied - maintenance,
            "maintenance": maintenance,
            "occupancy_pct": round(occupied / total_beds * 100) if total_beds else 0,
        },
    )
