import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.enums import RequestKind
from app.models.models import Bed, ChangeRequest, Floor, Organization, Property, Room, Stay
from app.schemas.schemas import (
    GuestBookingIn,
    PublicBed,
    PublicBuilding,
    PublicFloor,
    PublicPgDetail,
    PublicPgSummary,
    PublicRoom,
)
from app.services.notify import notify_staff

router = APIRouter(tags=["public"])

FLOOR_ORDER = {"Ground": -1}


def _floor_key(name: str) -> int:
    if name == "Ground":
        return -1
    for label in ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]:
        if name == label:
            return ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"].index(label)
    return 1000


def _occupancy(db: Session, building_ids: list[uuid.UUID]):
    """Returns (beds, occupied_ids, floors_of) for the given buildings."""
    beds = db.execute(
        select(Bed)
        .join(Room, Bed.room_id == Room.id)
        .join(Floor, Room.floor_id == Floor.id)
        .where(Floor.property_id.in_(building_ids))
        .order_by(Bed.label)
    ).scalars().all()
    occupied = set(
        db.execute(select(Stay.bed_id).where(Stay.active.is_(True))).scalars().all()
    )
    return beds, occupied


@router.get("/public/pgs", response_model=list[PublicPgSummary])
def public_pgs(db: Session = Depends(get_db)):
    """Guest directory: every PG (organization) registered in the app, with aggregate stats."""
    orgs = db.execute(select(Organization).order_by(Organization.created_at)).scalars().all()
    occupied = set(
        db.execute(select(Stay.bed_id).where(Stay.active.is_(True))).scalars().all()
    )
    out: list[PublicPgSummary] = []
    for org in orgs:
        building_ids = [
            r[0] for r in db.execute(
                select(Property.id).where(Property.organization_id == org.id)
            ).all()
        ]
        beds = db.execute(
            select(Bed)
            .join(Room, Bed.room_id == Room.id)
            .join(Floor, Room.floor_id == Floor.id)
            .where(Floor.property_id.in_(building_ids))
        ).scalars().all() if building_ids else []
        vacancies = [b for b in beds if b.id not in occupied]
        city_row = db.execute(
            select(Property.city, Property.locality)
            .where(Property.id.in_(building_ids), Property.city.isnot(None))
            .limit(1)
        ).first() if building_ids else None
        out.append(
            PublicPgSummary(
                id=org.id,
                name=org.name,
                buildings_count=len(building_ids),
                beds_count=len(beds),
                vacant_count=len(vacancies),
                rent_min_paise=min((b.rent_paise for b in vacancies), default=None),
                rent_max_paise=max((b.rent_paise for b in vacancies), default=None),
                city=city_row[0] if city_row else None,
            )
        )
    return out


@router.get("/public/pgs/{org_id}", response_model=PublicPgDetail)
def public_pg_detail(org_id: uuid.UUID, db: Session = Depends(get_db)):
    """Guest deep view: every building with its floors/rooms and vacant beds for booking."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "PG not found")

    buildings = db.execute(
        select(Property).where(Property.organization_id == org.id).order_by(Property.created_at)
    ).scalars().all()
    building_ids = [b.id for b in buildings]

    floors = db.execute(
        select(Floor).where(Floor.property_id.in_(building_ids))
    ).scalars().all() if building_ids else []
    rooms = db.execute(
        select(Room).join(Floor, Room.floor_id == Floor.id).where(Floor.property_id.in_(building_ids)).order_by(Room.number)
    ).scalars().all() if building_ids else []
    beds, occupied = _occupancy(db, building_ids) if building_ids else ([], set())

    rooms_by_floor: dict[uuid.UUID, list[Room]] = {}
    for r in rooms:
        rooms_by_floor.setdefault(r.floor_id, []).append(r)
    beds_by_room: dict[uuid.UUID, list[Bed]] = {}
    for b in beds:
        beds_by_room.setdefault(b.room_id, []).append(b)

    public_buildings: list[PublicBuilding] = []
    for prop in buildings:
        prop_floors = sorted([f for f in floors if f.property_id == prop.id], key=lambda f: _floor_key(f.name))
        rent_pool: list[int] = []
        public_floors: list[PublicFloor] = []
        for floor in prop_floors:
            floor_rooms = rooms_by_floor.get(floor.id, [])
            public_rooms: list[PublicRoom] = []
            vacant_beds = 0
            for room in floor_rooms:
                vb = [b for b in beds_by_room.get(room.id, []) if b.id not in occupied]
                rent_pool += [b.rent_paise for b in vb]
                vacant_beds += len(vb)
                public_rooms.append(
                    PublicRoom(
                        id=room.id,
                        number=room.number,
                        vacant_beds=[
                            PublicBed(id=b.id, label=b.label, rent_paise=b.rent_paise, deposit_paise=b.deposit_paise)
                            for b in vb
                        ],
                        vacant_count=len(vb),
                    )
                )
            public_floors.append(
                PublicFloor(
                    id=floor.id,
                    name=floor.name,
                    total_rooms=len(floor_rooms),
                    total_beds=sum(len(beds_by_room.get(r.id, [])) for r in floor_rooms),
                    vacant_count=vacant_beds,
                    rooms=public_rooms,
                )
            )
        all_floor_rooms = rooms_by_floor and [r for f in prop_floors for r in rooms_by_floor.get(f.id, [])]
        public_buildings.append(
            PublicBuilding(
                id=prop.id,
                name=prop.name,
                address=prop.address,
                city=prop.city,
                locality=prop.locality,
                facilities=prop.facilities,
                floors_count=len(prop_floors),
                rooms_count=len(all_floor_rooms or []),
                beds_count=sum(f.total_beds for f in public_floors),
                vacant_count=sum(f.vacant_count for f in public_floors),
                rent_min_paise=min(rent_pool, default=None),
                rent_max_paise=max(rent_pool, default=None),
                floors=public_floors,
            )
        )

    return PublicPgDetail(id=org.id, name=org.name, contact_phone=org.contact_phone, buildings=public_buildings)


@router.post("/public/booking-requests", status_code=201)
def public_booking_request(
    body: GuestBookingIn,
    db: Session = Depends(get_db),
):
    """Guest requests a bed: anywhere in the PG, a building, a floor, a room or one specific bed."""
    org = db.get(Organization, body.org_id)
    if not org:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "PG not found")

    # resolve deepest level to its building to check org membership
    bed = db.get(Bed, body.bed_id) if body.bed_id else None
    room = db.get(Room, body.room_id or (bed.room_id if bed else None)) if (body.room_id or bed) else None
    floor = db.get(Floor, body.floor_id or (room.floor_id if room else None)) if (body.floor_id or room) else None
    prop = db.get(Property, body.building_id or (floor.property_id if floor else None)) if (body.building_id or floor) else None
    if prop and prop.organization_id != body.org_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Selection doesn't belong to this PG")

    if bed and room and bed.room_id != room.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Bed doesn't belong to the selected room")
    if room and floor and room.floor_id != floor.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Room doesn't belong to the selected floor")
    if floor and prop and floor.property_id != prop.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Floor doesn't belong to the selected building")

    req = ChangeRequest(
        organization_id=body.org_id,
        kind=RequestKind.booking,
        guest_name=body.guest_name,
        guest_phone=body.guest_phone,
        building_id=prop.id if prop else None,
        floor_id=floor.id if floor else None,
        room_id=room.id if room else None,
        bed_id=bed.id if bed else None,
        note=body.note,
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    pref = prop.name if prop else "anywhere in the PG"
    notify_staff(
        db,
        body.org_id,
        "New bed booking request",
        f"{body.guest_name} ({body.guest_phone}) requested a bed — {pref}. Check Requests.",
        request_id=req.id,
    )
    db.commit()
    return {"id": req.id, "status": req.status.value}
