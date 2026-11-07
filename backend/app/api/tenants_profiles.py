import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.models import CustomTenantField, Tenant
from app.schemas.schemas import CustomTenantFieldIn, CustomTenantFieldOut

router = APIRouter(tags=["custom-tenant-fields"])


@router.post("/custom-tenant-fields", response_model=CustomTenantFieldOut, status_code=201)
def create_custom_tenant_field(
    body: CustomTenantFieldIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, body.tenant_id if hasattr(body, 'tenant_id') else None)
    # tenant_id is handled separately in the body model
    tenant_id = getattr(body, 'tenant_id', None)
    if tenant_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "tenant_id is required")

    tenant = db.get(Tenant, tenant_id)
    if tenant is None or tenant.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    field = CustomTenantField(
        organization_id=auth.org_id,
        tenant_id=tenant_id,
        field_name=body.field_name,
        field_value=body.field_value,
        field_type=body.field_type,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/custom-tenant-fields/{tenant_id}", response_model=list[CustomTenantFieldOut])
def list_custom_tenant_fields(
    tenant_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    tenant = db.get(Tenant, tenant_id)
    if tenant is None or tenant.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")

    fields = db.execute(
        select(CustomTenantField).where(CustomTenantField.tenant_id == tenant_id)
    ).scalars().all()
    return fields


@router.patch("/custom-tenant-fields/{field_id}", response_model=CustomTenantFieldOut)
def update_custom_tenant_field(
    field_id: uuid.UUID,
    body: CustomTenantFieldOut,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    field = db.execute(
        select(CustomTenantField)
        .where(CustomTenantField.id == field_id, CustomTenantField.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if field is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Custom field not found")

    field.field_name = body.field_name
    field.field_value = body.field_value
    field.field_type = body.field_type
    field.updated_at = func.now()

    db.commit()
    db.refresh(field)
    return field


@router.delete("/custom-tenant-fields/{field_id}", status_code=204)
def delete_custom_tenant_field(
    field_id: uuid.UUID,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    field = db.execute(
        select(CustomTenantField)
        .where(CustomTenantField.id == field_id, CustomTenantField.organization_id == auth.org_id)
    ).scalar_one_or_none()

    if field is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Custom field not found")

    db.delete(field)
    db.commit()