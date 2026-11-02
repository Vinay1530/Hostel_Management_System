import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, ensure_login_user, get_auth_context, require_staff
from app.models.enums import RequestKind, RequestStatus, Role
from app.models.models import Bed, ChangeRequest, Floor, Property, Room, Stay, Tenant
from app.services.collaboration import sync_tenant_participation
from app.schemas.schemas import ChangeRequestIn, RequestDecisionIn, RequestOut
from app.services.notify import notify_staff, notify_user

router = APIRouter(tags=["requests"])


def _422(msg: str):
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, msg)


def _current_tenant(db: Session, org_id: uuid.UUID, auth: AuthContext) -> Tenant:
    tenant = db.execute(
        select(Tenant).where(Tenant.phone == auth.user.phone, Tenant.organization_id == org_id)
    ).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No tenant profile linked to your phone in this organization")
    return tenant


def _validate_targets(
    db: Session,
    org_id: uuid.UUID,
    building_id: uuid.UUID | None,
    floor_id: uuid.UUID | None,
    room_id: uuid.UUID | None,
    bed_id: uuid.UUID | None,
) -> None:
    """Every non-null id must exist, belong to the org, and nest under its parent level."""
    bed = db.get(Bed, bed_id) if bed_id else None
    if bed_id and not bed:
        _422("Bed not found")
    room = db.get(Room, room_id) if room_id else None
    if room_id and not room:
        _422("Room not found")
    floor = db.get(Floor, floor_id) if floor_id else None
    if floor_id and not floor:
        _422("Floor not found")
    prop = db.get(Property, building_id) if building_id else None
    if building_id and (not prop or prop.organization_id != org_id):
        _422("Building not found in this PG")

    if bed and room and bed.room_id != room.id:
        _422("Bed doesn't belong to the selected room")
    if room and floor and room.floor_id != floor.id:
        _422("Room doesn't belong to the selected floor")
    if floor and prop and floor.property_id != prop.id:
        _422("Floor doesn't belong to the selected building")


def _resolved(db: Session, req: ChangeRequest) -> dict:
    tenant_name = None
    if req.tenant_id:
        t = db.get(Tenant, req.tenant_id)
        tenant_name = t.full_name if t else None

    bed = db.get(Bed, req.bed_id) if req.bed_id else None
    room = db.get(Room, req.room_id or (bed.room_id if bed else None)) if (req.room_id or bed) else None
    floor = db.get(Floor, req.floor_id or (room.floor_id if room else None)) if (req.floor_id or room) else None
    prop = db.get(Property, req.building_id or (floor.property_id if floor else None)) if (req.building_id or floor) else None

    return {
        "tenant_name": tenant_name,
        "building_name": prop.name if prop else None,
        "floor_name": floor.name if floor else None,
        "room_number": room.number if room else None,
        "bed_label": bed.label if bed else None,
    }


def _out(db: Session, req: ChangeRequest) -> RequestOut:
    out = RequestOut.model_validate(req)
    for key, value in _resolved(db, req).items():
        setattr(out, key, value)
    return out


# ---------- tenant side ----------

@router.post("/my/change-requests", response_model=RequestOut, status_code=201)
def create_change_request(
    body: ChangeRequestIn,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Tenant requests a bed/room/floor/building change. All-null ids = 'anywhere in my PG'."""
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)
    _validate_targets(db, auth.org_id, body.building_id, body.floor_id, body.room_id, body.bed_id)

    req = ChangeRequest(
        organization_id=auth.org_id,
        kind=RequestKind.change,
        tenant_id=tenant.id,
        building_id=body.building_id,
        floor_id=body.floor_id,
        room_id=body.room_id,
        bed_id=body.bed_id,
        note=body.note,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    notify_staff(
        db,
        auth.org_id,
        "New change request",
        f"{tenant.full_name} requested a bed/room change — see Requests.",
        request_id=req.id,
    )
    db.commit()
    return _out(db, req)


@router.get("/my/change-requests", response_model=list[RequestOut])
def my_change_requests(auth: AuthContext = Depends(get_auth_context), db: Session = Depends(get_db)):
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)
    reqs = db.execute(
        select(ChangeRequest)
        .where(ChangeRequest.tenant_id == tenant.id, ChangeRequest.kind == RequestKind.change)
        .order_by(ChangeRequest.created_at.desc())
    ).scalars().all()
    return [_out(db, r) for r in reqs]


@router.post("/my/change-requests/{request_id}/confirm-move", response_model=RequestOut)
def tenant_confirm_move(
    request_id: uuid.UUID,
    auth: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
):
    """Tenant confirms they have moved to the approved bed/room.
    Notifies manager to update the system records."""
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization")
    tenant = _current_tenant(db, auth.org_id, auth)
    req = db.get(ChangeRequest, request_id)
    if not req or req.organization_id != auth.org_id or req.tenant_id != tenant.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status != RequestStatus.approved:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only approved requests can be confirmed")

    req.status = RequestStatus.moved
    db.commit()

    labels = _resolved(db, req)
    dest = " · ".join(filter(None, [labels.get("building_name"), labels.get("floor_name"), f"Room {labels.get('room_number')}" if labels.get("room_number") else None, f"Bed {labels.get('bed_label')}" if labels.get("bed_label") else None])) or "new spot"

    notify_staff(
        db,
        auth.org_id,
        "Tenant confirmed move",
        f"{tenant.full_name} confirmed moving to {dest}. Click to update records.",
        request_id=req.id,
    )
    db.commit()
    return _out(db, req)


# ---------- staff side ----------

@router.get("/requests", response_model=list[RequestOut])
def list_requests(
    kind: RequestKind | None = None,
    request_status: RequestStatus | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(ChangeRequest).where(ChangeRequest.organization_id == auth.org_id)
    if kind:
        stmt = stmt.where(ChangeRequest.kind == kind)
    if request_status:
        stmt = stmt.where(ChangeRequest.status == request_status)
    reqs = db.execute(stmt.order_by(ChangeRequest.created_at.desc())).scalars().all()
    return [_out(db, r) for r in reqs]


@router.patch("/requests/{request_id}", response_model=RequestOut)
def decide_request(
    request_id: uuid.UUID,
    body: RequestDecisionIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    req = db.get(ChangeRequest, request_id)
    if not req or req.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status != RequestStatus.open:
        raise HTTPException(status.HTTP_409_CONFLICT, "Request already decided")

    req.status = RequestStatus(body.status)
    req.decided_by_user_id = auth.user.id
    req.decided_at = datetime.now(timezone.utc)
    db.commit()

    if req.tenant_id:
        tenant = db.get(Tenant, req.tenant_id)
        if tenant:
            user = ensure_login_user(db, tenant.phone, None, auth.org_id, Role.tenant)
            bed = db.get(Bed, req.bed_id) if req.bed_id else None
            room = db.get(Room, bed.room_id) if bed else None
            suffix = f" for Room {room.number}" if room else ""
            notify_user(
                db,
                user.id,
                f"Request {req.status.value}",
                f"Your {'booking' if req.kind == RequestKind.booking else 'change'} request was {req.status.value}{suffix}.",
                request_id=req.id,
            )
            db.commit()
    return _out(db, req)


@router.post("/requests/{request_id}/apply-move", response_model=RequestOut)
def staff_apply_move(
    request_id: uuid.UUID,
    bed_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Staff executes the room/bed transfer in the database.
    Updates the active stay and occupancy grid records."""
    req = db.get(ChangeRequest, request_id)
    if not req or req.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status not in (RequestStatus.approved, RequestStatus.moved):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Request in status {req.status} cannot be applied")
    if not req.tenant_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Request does not have an associated tenant")

    target_bed_id = bed_id or req.bed_id
    if not target_bed_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Target bed is required to complete transfer")

    target_bed = db.get(Bed, target_bed_id)
    if not target_bed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target bed not found")

    tenant = db.get(Tenant, req.tenant_id)
    current_stay = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if not current_stay:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant has no active stay to transfer")

    # Guard: check if target bed is already occupied by someone else
    occupant = db.execute(
        select(Stay).where(Stay.bed_id == target_bed.id, Stay.active.is_(True), Stay.id != current_stay.id)
    ).scalar_one_or_none()
    if occupant:
        raise HTTPException(status.HTTP_409_CONFLICT, "Target bed is currently occupied")

    # Update stay to new bed
    current_stay.bed_id = target_bed.id
    current_stay.agreed_rent_paise = target_bed.rent_paise
    req.status = RequestStatus.completed
    req.bed_id = target_bed.id
    db.commit()

    # Sync tenant participation
    prop = db.execute(
        select(Property)
        .join(Floor, Floor.property_id == Property.id)
        .join(Room, Room.floor_id == Floor.id)
        .join(Bed, Bed.room_id == Room.id)
        .where(Bed.id == target_bed.id, Property.organization_id == auth.org_id)
    ).scalar_one_or_none()
    if prop:
        sync_tenant_participation(db, prop, tenant, joined=True)
        db.commit()

    user = ensure_login_user(db, tenant.phone, None, auth.org_id, Role.tenant)
    notify_user(
        db,
        user.id,
        "Move completed",
        "Your room/bed transfer has been updated in the system.",
        request_id=req.id,
    )
    db.commit()
    return _out(db, req)
