import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_org
from app.models.enums import Role
from app.models.models import TenantFeedback, Tenant
from app.schemas.schemas import (
    TenantFeedbackIn,
    TenantFeedbackOut,
)

router = APIRouter(tags=["feedback"])


def _tenant_for_auth(db: Session, auth: AuthContext) -> Tenant | None:
    return db.execute(
        select(Tenant).where(
            Tenant.phone == auth.user.phone,
            Tenant.organization_id == auth.org_id,
        )
    ).scalar_one_or_none()


@router.post("/feedback", response_model=TenantFeedbackOut, status_code=201)
def create_feedback(
    body: TenantFeedbackIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    if auth.role != Role.tenant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant access required")

    tenant = _tenant_for_auth(db, auth)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    existing = db.execute(
        select(TenantFeedback)
        .where(TenantFeedback.tenant_id == tenant.id)
    ).scalar_one_or_none()

    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Feedback already exists for this tenant")

    feedback = TenantFeedback(
        organization_id=auth.org_id,
        tenant_id=tenant.id,
        property_id=body.property_id,
        rating=body.rating,
        category=body.category,
        comment=body.comment,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


@router.get("/feedback", response_model=list[TenantFeedbackOut])
def list_feedback(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    stmt = select(TenantFeedback).where(TenantFeedback.organization_id == auth.org_id)

    if auth.role == Role.tenant:
        tenant = _tenant_for_auth(db, auth)
        if tenant is None:
            return []
        stmt = stmt.where(TenantFeedback.tenant_id == tenant.id)

    if property_id is not None:
        stmt = stmt.where(TenantFeedback.property_id == property_id)

    stmt = stmt.order_by(TenantFeedback.created_at.desc())

    feedback = db.execute(stmt).scalars().all()
    return feedback


@router.get("/feedback/{feedback_id}", response_model=TenantFeedbackOut)
def get_feedback(
    feedback_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    feedback = db.execute(
        select(TenantFeedback)
        .where(TenantFeedback.id == feedback_id, TenantFeedback.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if feedback is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")

    if auth.role == Role.tenant:
        tenant = _tenant_for_auth(db, auth)
        if tenant is None or feedback.tenant_id != tenant.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Feedback access required")

    return feedback


@router.patch("/feedback/{feedback_id}", response_model=TenantFeedbackOut)
def update_feedback(
    feedback_id: uuid.UUID,
    body: TenantFeedbackOut,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    feedback = db.execute(
        select(TenantFeedback)
        .where(TenantFeedback.id == feedback_id, TenantFeedback.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if feedback is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")

    if auth.role == Role.tenant:
        tenant = _tenant_for_auth(db, auth)
        if tenant is None or feedback.tenant_id != tenant.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Feedback access required")

    feedback.property_id = body.property_id
    feedback.rating = body.rating
    feedback.category = body.category
    feedback.comment = body.comment
    feedback.updated_at = func.now()

    db.commit()
    db.refresh(feedback)
    return feedback


@router.delete("/feedback/{feedback_id}", status_code=204)
def delete_feedback(
    feedback_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    feedback = db.execute(
        select(TenantFeedback)
        .where(TenantFeedback.id == feedback_id, TenantFeedback.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if feedback is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")

    if auth.role == Role.tenant:
        tenant = _tenant_for_auth(db, auth)
        if tenant is None or feedback.tenant_id != tenant.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Feedback access required")

    db.delete(feedback)
    db.commit()