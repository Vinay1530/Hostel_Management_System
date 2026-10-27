import csv
import io
import logging
import shutil
import uuid
from datetime import date
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import AuthContext, ensure_login_user, require_staff
from app.models.enums import BedStatus, DocType, Role
from app.models.models import Bed, Floor, Property, Room, Stay, Tenant, TenantDocument
from app.schemas.schemas import (
    DocumentOut,
    ImportPreview,
    ImportPreviewRow,
    ImportResult,
    StayIn,
    StayOut,
    TenantIn,
    TenantOut,
    TenantWithStays,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["tenants"])

CSV_COLUMNS = [
    "full_name", "phone", "property_name", "floor_name", "room_number",
    "bed_label", "start_date", "agreed_rent_paise", "deposit_paise",
    "emergency_contact_name", "emergency_contact_phone", "id_number",
]

IMPORT_TEMPLATE = f"# Required columns: {','.join(CSV_COLUMNS)}\n" + ",".join(CSV_COLUMNS) + "\n"


def _own_tenant(db: Session, org_id: uuid.UUID, tenant_id: uuid.UUID) -> Tenant:
    t = db.get(Tenant, tenant_id)
    if t is None or t.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant not found")
    return t


def _own_bed(db: Session, org_id: uuid.UUID, bed_id: uuid.UUID) -> Bed:
    b = db.get(Bed, bed_id)
    if b is None or b.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Bed not found")
    return b


# ---------- tenants ----------

@router.get("/tenants", response_model=list[TenantWithStays])
def list_tenants(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = (
        select(Tenant)
        .options(joinedload(Tenant.stays))
        .where(Tenant.organization_id == auth.org_id)
        .order_by(Tenant.full_name)
    )
    if property_id:
        stmt = stmt.where(
            Tenant.id.in_(
                select(Stay.tenant_id)
                .join(Bed, Bed.id == Stay.bed_id)
                .join(Room, Room.id == Bed.room_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Floor.property_id == property_id, Stay.active.is_(True))
            )
        )
    tenants = db.execute(stmt).unique().scalars().all()
    return tenants


@router.post("/tenants", response_model=TenantWithStays, status_code=201)
def create_tenant(body: TenantIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    dup = db.execute(
        select(Tenant).where(Tenant.organization_id == auth.org_id, Tenant.phone == body.phone)
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status.HTTP_409_CONFLICT, "A tenant with this phone already exists")
    t = Tenant(organization_id=auth.org_id, **body.model_dump())
    db.add(t)
    # Give the tenant a login: phone + default password 'password' (they can change it later)
    ensure_login_user(
        db,
        phone=body.phone,
        password=None,
        org_id=auth.org_id,
        role=Role.tenant,
        name=body.full_name,
        email=body.email,
    )
    db.commit()
    t.stays = []
    return t


@router.get("/tenants/{tenant_id}", response_model=TenantWithStays)
def get_tenant(tenant_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    t = _own_tenant(db, auth.org_id, tenant_id)
    t.stays = (
        db.execute(select(Stay).where(Stay.tenant_id == t.id).order_by(Stay.start_date.desc()))
        .scalars().all()
    )
    return t


@router.patch("/tenants/{tenant_id}", response_model=TenantOut)
def update_tenant(
    tenant_id: uuid.UUID, body: TenantIn,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    t = _own_tenant(db, auth.org_id, tenant_id)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    db.commit()
    db.refresh(t)
    return t


@router.delete("/tenants/{tenant_id}", status_code=204)
def delete_tenant(tenant_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    t = _own_tenant(db, auth.org_id, tenant_id)
    db.delete(t)
    db.commit()


# ---------- stays (tenant <-> bed) ----------

@router.post("/stays", response_model=StayOut, status_code=201)
def create_stay(body: StayIn, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    tenant = _own_tenant(db, auth.org_id, body.tenant_id)
    bed = _own_bed(db, auth.org_id, body.bed_id)

    overlap = db.execute(
        select(Stay).where(Stay.bed_id == bed.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if overlap:
        raise HTTPException(status.HTTP_409_CONFLICT, "This bed is already occupied")

    active_elsewhere = db.execute(
        select(Stay).where(Stay.tenant_id == tenant.id, Stay.active.is_(True))
    ).scalar_one_or_none()
    if active_elsewhere:
        raise HTTPException(status.HTTP_409_CONFLICT, "Tenant already has an active stay")

    stay = Stay(
        organization_id=auth.org_id,
        tenant_id=tenant.id,
        bed_id=bed.id,
        start_date=body.start_date,
        agreed_rent_paise=body.agreed_rent_paise,
        deposit_paise=body.deposit_paise,
    )
    db.add(stay)
    db.commit()
    db.refresh(stay)
    return stay


@router.post("/stays/{stay_id}/end", response_model=StayOut)
def end_stay(
    stay_id: uuid.UUID, end_date: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db),
):
    """Vacate: ends the stay and frees the bed. End date passed as YYYY-MM-DD or today."""
    stay = db.get(Stay, stay_id)
    if stay is None or stay.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Stay not found")
    if not stay.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Stay already ended")
    if end_date is not None:
        d = date.fromisoformat(str(end_date))
    else:
        d = date.today()
    stay.end_date = d
    stay.active = False
    db.commit()
    db.refresh(stay)
    return stay


# ---------- documents ----------

@router.post("/tenants/{tenant_id}/documents", response_model=DocumentOut, status_code=201)
async def upload_document(
    tenant_id: uuid.UUID,
    file: Annotated[UploadFile, File()],
    doc_type: DocType = Form(DocType.kyc_id),
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """KYC / agreement upload. Stored on local disk (S3 later)."""
    tenant = _own_tenant(db, auth.org_id, tenant_id)
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File larger than 10 MB")

    ext = Path(file.filename or "upload").suffix[:10] or ".bin"
    base = get_settings().upload_dir / str(auth.org_id) / str(tenant.id)
    base.mkdir(parents=True, exist_ok=True)
    stored = base / f"{uuid.uuid4()}{ext}"
    stored.write_bytes(data)

    doc = TenantDocument(
        organization_id=auth.org_id,
        tenant_id=tenant.id,
        doc_type=doc_type,
        file_path=str(stored),
        original_name=file.filename or "upload",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/tenants/{tenant_id}/documents", response_model=list[DocumentOut])
def list_documents(tenant_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    tenant = _own_tenant(db, auth.org_id, tenant_id)
    return (
        db.execute(select(TenantDocument).where(TenantDocument.tenant_id == tenant.id).order_by(TenantDocument.uploaded_at.desc()))
        .scalars().all()
    )


@router.get("/documents/{document_id}/download")
def download_document(document_id: uuid.UUID, auth: AuthContext = Depends(require_staff), db: Session = Depends(get_db)):
    doc = db.get(TenantDocument, document_id)
    if doc is None or doc.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    path = Path(doc.file_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File missing on disk")
    return FileResponse(path, filename=doc.original_name)


# ---------- CSV import (bulk onboarding) ----------

@router.get("/tenants/import/template")
def import_template():
    return {"columns": CSV_COLUMNS, "template": IMPORT_TEMPLATE}


def parse_import_csv(content: str) -> tuple[list[dict[str, str]], list[dict]]:
    """Returns (rows, errors). Rows column-normalized; errors carry row numbers."""
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        return [], [{"row": 1, "error": "Empty CSV"}]
    missing = [c for c in CSV_COLUMNS if c not in reader.fieldnames]
    if missing:
        return [], [{"row": 1, "error": f"Missing columns: {', '.join(missing)}"}]

    rows: list[dict[str, str]] = []
    errors: list[dict] = []
    for i, raw in enumerate(reader, start=2):
        if not raw.get("full_name"):
            errors.append({"row": i, "error": "full_name is required"})
            continue
        if not raw.get("phone"):
            errors.append({"row": i, "error": "phone is required"})
            continue
        row = {k: (raw.get(k) or "").strip() for k in CSV_COLUMNS}
        rows.append(row)
    return rows, errors


def _resolve_location(db: Session, org_id: uuid.UUID, row: dict[str, str]) -> tuple[Bed | None, str | None]:
    """Find bed by property/floor/room/bed label."""
    stmt = (
        select(Bed)
        .join(Room, Bed.room_id == Room.id)
        .join(Floor, Room.floor_id == Floor.id)
        .join(Property, Floor.property_id == Property.id)
        .where(
            Bed.organization_id == org_id,
            Property.name.ilike(row["property_name"]),
            Floor.name.ilike(row["floor_name"]),
            Room.number.ilike(row["room_number"]),
            Bed.label.ilike(row["bed_label"]),
        )
    )
    bed = db.execute(stmt).scalar_one_or_none()
    if bed is None:
        return None, f"Bed not found: {row['property_name']} / {row['floor_name']} / {row['room_number']} / {row['bed_label']}"
    return bed, None


def validate_import(db: Session, org_id: uuid.UUID, rows: list[dict[str, str]]) -> tuple[list[ImportPreviewRow], list[dict]]:
    valid: list[ImportPreviewRow] = []
    errors: list[dict] = []
    seen_beds: set[tuple] = set()
    seen_phones: set[str] = set()

    for i, row in enumerate(rows):
        row_num = i + 2
        try:
            _d = date.fromisoformat(row["start_date"])
        except ValueError:
            errors.append({"row": row_num, "error": f"Invalid start_date '{row['start_date']}' (use YYYY-MM-DD)"})
            continue
        if not row["agreed_rent_paise"].isdigit():
            errors.append({"row": row_num, "error": "agreed_rent_paise must be a whole number (paise)"})
            continue
        if row["deposit_paise"] and not row["deposit_paise"].isdigit():
            errors.append({"row": row_num, "error": "deposit_paise must be a whole number (paise)"})
            continue
        if not row["property_name"] or not row["floor_name"] or not row["room_number"] or not row["bed_label"]:
            errors.append({"row": row_num, "error": "property_name, floor_name, room_number and bed_label are required"})
            continue
        key = (
            row["property_name"].lower(), row["floor_name"].lower(),
            row["room_number"].lower(), row["bed_label"].lower(),
        )
        phone = row["phone"]
        if phone in seen_phones:
            errors.append({"row": row_num, "error": f"Duplicate phone {phone} in file"})
            continue
        seen_phones.add(phone)
        bed, err = _resolve_location(db, org_id, row)
        if err:
            errors.append({"row": row_num, "error": err})
            continue
        occupied = db.execute(select(Stay).where(Stay.bed_id == bed.id, Stay.active.is_(True))).scalar_one_or_none()
        if occupied:
            errors.append({"row": row_num, "error": f"Bed {row['room_number']}/{row['bed_label']} in {row['property_name']} is already occupied"})
            continue
        if key in seen_beds:
            errors.append({"row": row_num, "error": f"Bed {row['bed_label']} assigned twice in file"})
            continue
        seen_beds.add(key)
        valid.append(ImportPreviewRow(row_number=row_num, data=row))
    return valid, errors


@router.post("/tenants/import/preview", response_model=ImportPreview)
async def import_preview(
    file: Annotated[UploadFile, File()],
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Dry-run: validates the CSV and returns per-row errors, no data written."""
    content = (await file.read()).decode("utf-8-sig")
    rows, errors = parse_import_csv(content)
    valid, more_errors = validate_import(db, auth.org_id, rows)
    return ImportPreview(valid_rows=valid, errors=errors + more_errors)


@router.post("/tenants/import", response_model=ImportResult)
async def import_execute(
    file: Annotated[UploadFile, File()],
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    """Executes the import for all valid rows; skips errors with a report."""
    content = (await file.read()).decode("utf-8-sig")
    rows, errors = parse_import_csv(content)
    valid_rows, more_errors = validate_import(db, auth.org_id, rows)
    errors = errors + more_errors

    tenants_created = 0
    stays_created = 0
    for preview in valid_rows:
        row = preview.data
        tenant = db.execute(
            select(Tenant).where(Tenant.organization_id == auth.org_id, Tenant.phone == row["phone"])
        ).scalar_one_or_none()
        if not tenant:
            tenant = Tenant(
                organization_id=auth.org_id,
                full_name=row["full_name"],
                phone=row["phone"],
                emergency_contact_name=row["emergency_contact_name"] or None,
                emergency_contact_phone=row["emergency_contact_phone"] or None,
                id_number=row["id_number"] or None,
            )
            db.add(tenant)
            tenants_created += 1
            # Bulk import also provisions a login (default password 'password')
            ensure_login_user(
                db,
                phone=row["phone"],
                password=None,
                org_id=auth.org_id,
                role=Role.tenant,
                name=row["full_name"],
            )
        else:
            tenant.full_name = tenant.full_name or row["full_name"]
        db.flush()  # ensure tenant.id is available for the stay

        bed, _ = _resolve_location(db, auth.org_id, row)
        stay = Stay(
            organization_id=auth.org_id,
            tenant_id=tenant.id,
            bed_id=bed.id,
            start_date=date.fromisoformat(row["start_date"]),
            agreed_rent_paise=int(row["agreed_rent_paise"]),
            deposit_paise=int(row["deposit_paise"] or 0),
        )
        db.add(stay)
        stays_created += 1

    db.commit()
    return ImportResult(tenants_created=tenants_created, stays_created=stays_created, errors=errors)
