"""In-app notification fan-out helpers."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import Role
from app.models.models import InAppNotification, Membership


def staff_user_ids(db: Session, org_id: uuid.UUID) -> list[uuid.UUID]:
    rows = db.execute(
        select(Membership.user_id).where(
            Membership.organization_id == org_id,
            Membership.role.in_([Role.owner, Role.manager]),
        )
    ).scalars().all()
    return list(rows)


def notify_staff(
    db: Session,
    org_id: uuid.UUID,
    title: str,
    body: str,
    complaint_id: uuid.UUID | None = None,
    request_id: uuid.UUID | None = None,
) -> None:
    for user_id in staff_user_ids(db, org_id):
        db.add(
            InAppNotification(
                user_id=user_id,
                complaint_id=complaint_id,
                request_id=request_id,
                title=title,
                body=body,
            )
        )


def notify_user(
    db: Session,
    user_id: uuid.UUID,
    title: str,
    body: str,
    complaint_id: uuid.UUID | None = None,
    request_id: uuid.UUID | None = None,
) -> None:
    db.add(
        InAppNotification(
            user_id=user_id,
            complaint_id=complaint_id,
            request_id=request_id,
            title=title,
            body=body,
        )
    )
