import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import require_staff
from app.models.enums import Role
from app.models.models import InAppNotification, Membership
from app.schemas.schemas import NotificationOut

router = APIRouter(tags=["notifications"])


@router.get("/staff/notifications", response_model=list[NotificationOut])
def staff_notifications(auth=Depends(require_staff), db: Session = Depends(get_db)):
    """Newest notifications for this owner/manager: payments, requests, reports, notice periods."""
    if auth.role not in (Role.owner, Role.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner or manager access required")
    rows = db.execute(
        select(InAppNotification)
        .where(InAppNotification.user_id == auth.user.id)
        .order_by(InAppNotification.created_at.desc())
        .limit(100)
    ).scalars().all()
    return rows


@router.patch("/staff/notifications/{notification_id}/read", response_model=NotificationOut)
def staff_notification_read(
    notification_id: uuid.UUID,
    auth=Depends(require_staff),
    db: Session = Depends(get_db),
):
    row = db.get(InAppNotification, notification_id)
    if not row or row.user_id != auth.user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if not row.read_at:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
    return row
