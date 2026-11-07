import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.models import InvoiceTemplate
from app.schemas.schemas import InvoiceTemplateIn, InvoiceTemplateOut

router = APIRouter(tags=["invoice-templates"])


@router.post("/invoice-templates", response_model=InvoiceTemplateOut, status_code=201)
def create_invoice_template(
    body: InvoiceTemplateIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    if body.is_default:
        # Unset any existing default template
        db.execute(
            select(InvoiceTemplate).where(
                InvoiceTemplate.organization_id == auth.org_id,
                InvoiceTemplate.is_default.is_(True),
            )
        )
        # This is a SQLAlchemy core update, use ORM instead
        existing_defaults = db.execute(
            select(InvoiceTemplate).where(
                InvoiceTemplate.organization_id == auth.org_id,
                InvoiceTemplate.is_default.is_(True),
            )
        ).scalars().all()
        for t in existing_defaults:
            t.is_default = False
            db.add(t)

    template = InvoiceTemplate(
        organization_id=auth.org_id,
        name=body.name,
        template_data=body.template_data,
        is_default=body.is_default,
        created_by_user_id=auth.user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/invoice-templates", response_model=list[InvoiceTemplateOut])
def list_invoice_templates(
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    templates = db.execute(
        select(InvoiceTemplate)
        .where(InvoiceTemplate.organization_id == auth.org_id)
        .order_by(InvoiceTemplate.created_at.desc())
    ).scalars().all()
    return templates


@router.get("/invoice-templates/{template_id}", response_model=InvoiceTemplateOut)
def get_invoice_template(
    template_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    template = db.execute(
        select(InvoiceTemplate)
        .where(InvoiceTemplate.id == template_id, InvoiceTemplate.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice template not found")

    return template


@router.patch("/invoice-templates/{template_id}", response_model=InvoiceTemplateOut)
def update_invoice_template(
    template_id: uuid.UUID,
    body: InvoiceTemplateOut,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    template = db.execute(
        select(InvoiceTemplate)
        .where(InvoiceTemplate.id == template_id, InvoiceTemplate.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice template not found")

    if body.is_default:
        existing_defaults = db.execute(
            select(InvoiceTemplate).where(
                InvoiceTemplate.organization_id == auth.org_id,
                InvoiceTemplate.id != template_id,
                InvoiceTemplate.is_default.is_(True),
            )
        ).scalars().all()
        for t in existing_defaults:
            t.is_default = False
            db.add(t)

    template.name = body.name
    template.template_data = body.template_data
    template.is_default = body.is_default
    template.updated_at = func.now()

    db.commit()
    db.refresh(template)
    return template


@router.delete("/invoice-templates/{template_id}", status_code=204)
def delete_invoice_template(
    template_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    template = db.execute(
        select(InvoiceTemplate)
        .where(InvoiceTemplate.id == template_id, InvoiceTemplate.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if template is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice template not found")

    db.delete(template)
    db.commit()