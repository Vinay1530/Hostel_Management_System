import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import (
    BedStatus,
    BillingCycle,
    ChargeType,
    DocType,
    InvoiceStatus,
    PaymentMode,
    Role,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth ----------

class OtpRequest(BaseModel):
    phone: str = Field(pattern=r"^\d{10,15}$")


class OtpVerify(BaseModel):
    phone: str = Field(pattern=r"^\d{10,15}$")
    code: str = Field(pattern=r"^\d{6}$")
    name: str | None = None
    org_name: str | None = None


class SwitchOrg(BaseModel):
    organization_id: uuid.UUID


class OrganizationOut(ORMModel):
    id: uuid.UUID
    name: str
    role: Role | None = None


class AuthOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    organizations: list[OrganizationOut]


# ---------- properties / floors ----------

class PropertyIn(BaseModel):
    name: str
    address: str | None = None
    advance_or_arrears: BillingCycle = BillingCycle.advance
    due_day: int = Field(5, ge=1, le=28)
    pro_rate_first_month: bool = True
    notice_period_days: int = Field(30, ge=0, le=180)
    facilities: str | None = None


class PropertyUpdate(BaseModel):
    """Partial update: all fields optional."""
    name: str | None = None
    address: str | None = None
    advance_or_arrears: BillingCycle | None = None
    due_day: int | None = Field(None, ge=1, le=28)
    pro_rate_first_month: bool | None = None
    notice_period_days: int | None = Field(None, ge=0, le=180)
    facilities: str | None = None


class PropertyOut(ORMModel):
    id: uuid.UUID
    name: str
    address: str | None
    advance_or_arrears: BillingCycle
    due_day: int
    pro_rate_first_month: bool
    notice_period_days: int
    facilities: str | None
    created_at: datetime


class FloorIn(BaseModel):
    name: str


class FloorOut(ORMModel):
    id: uuid.UUID
    name: str


# ---------- rooms / beds ----------

class RoomIn(BaseModel):
    number: str
    sharing_type: int = Field(1, ge=1, le=8)
    facilities: str | None = None


class RoomUpdate(BaseModel):
    """Partial room update: facilities, bed count (vacant beds adjust), sharing syncs."""
    number: str | None = None
    facilities: str | None = None
    beds_count: int | None = Field(None, ge=0, le=16)
    bed_rent_paise: int | None = Field(None, ge=0)
    bed_deposit_paise: int | None = Field(None, ge=0)


class RoomOut(ORMModel):
    id: uuid.UUID
    number: str
    sharing_type: int
    facilities: str | None


class BedIn(BaseModel):
    label: str = Field(max_length=10)
    rent_paise: int = Field(0, ge=0)
    deposit_paise: int = Field(0, ge=0)
    status: BedStatus = BedStatus.vacant


class BedOut(ORMModel):
    id: uuid.UUID
    label: str
    rent_paise: int
    deposit_paise: int
    status: BedStatus


class BulkBedsIn(BaseModel):
    labels: list[str] = Field(min_length=1, max_length=50)  # e.g. ["A", "B"]
    rent_paise: int = Field(0, ge=0)
    deposit_paise: int = Field(0, ge=0)


# ---------- PG layout wizard ----------

class LayoutIn(BaseModel):
    """Bulk PG creation: floors + auto-numbered rooms + beds in one call.

    Room numbers: Ground -> 001, 002, ... ; 1st -> 101, ...; 2nd -> 201, ...
    """
    name: str = Field(min_length=1, max_length=200)
    address: str | None = None
    facilities: str | None = None  # property-level: wifi,laundry,parking,mess...
    no_of_floors: int = Field(1, ge=1, le=10)
    rooms_per_floor: int = Field(1, ge=1, le=50)
    beds_per_room: int = Field(1, ge=1, le=8)
    rent_paise: int = Field(0, ge=0)
    deposit_paise: int = Field(0, ge=0)


class LayoutRoomSummary(BaseModel):
    id: uuid.UUID
    number: str
    facilities: str | None
    beds: int


class LayoutFloorSummary(BaseModel):
    id: uuid.UUID
    name: str
    rooms: list[LayoutRoomSummary]


class LayoutOut(BaseModel):
    property_id: uuid.UUID | None = None
    property_name: str
    floors: list[LayoutFloorSummary]
    totals: dict[str, int]


# ---------- occupancy grid ----------

class BedGrid(BedOut):
    tenant_name: str | None = None
    tenant_id: uuid.UUID | None = None
    stay_id: uuid.UUID | None = None


class RoomGrid(RoomOut):
    beds: list[BedGrid]


class FloorGrid(FloorOut):
    rooms: list[RoomGrid]


class PropertyGrid(FloorOut):
    property_id: uuid.UUID
    floors: list[FloorGrid]


class GridOut(BaseModel):
    properties: list[PropertyGrid]
    totals: dict[str, int]


# ---------- tenants ----------

class TenantIn(BaseModel):
    full_name: str
    phone: str = Field(pattern=r"^\d{10,15}$")
    email: EmailStr | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    id_number: str | None = None
    notes: str | None = None


class TenantOut(TenantIn):
    id: uuid.UUID
    created_at: datetime


class StayIn(BaseModel):
    tenant_id: uuid.UUID
    bed_id: uuid.UUID
    start_date: date
    agreed_rent_paise: int = Field(ge=0)
    deposit_paise: int = 0


class StayOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    bed_id: uuid.UUID
    start_date: date | None
    end_date: date | None
    agreed_rent_paise: int
    deposit_paise: int
    active: bool


class TenantWithStays(TenantOut):
    stays: list[StayOut] = []


class DocumentOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    doc_type: DocType
    original_name: str
    uploaded_at: datetime


# ---------- csv import ----------

class ImportPreviewRow(BaseModel):
    row_number: int
    data: dict[str, str]


class ImportPreview(BaseModel):
    valid_rows: list[ImportPreviewRow]
    errors: list[dict]


class ImportResult(BaseModel):
    tenants_created: int
    stays_created: int
    errors: list[dict]


# ---------- billing ----------

class ChargeIn(BaseModel):
    stay_id: uuid.UUID
    charge_type: ChargeType = ChargeType.other
    amount_paise: int = Field(gt=0)
    description: str | None = None
    charge_month: str = Field(pattern=r"^\d{4}-\d{2}$")


class ChargeOut(ORMModel):
    id: uuid.UUID
    stay_id: uuid.UUID
    charge_type: ChargeType
    amount_paise: int
    description: str | None
    charge_month: str
    applied_invoice_id: uuid.UUID | None
    created_at: datetime


class GenerateInvoicesIn(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    property_id: uuid.UUID | None = None  # scope the run to one PG


class InvoiceOut(ORMModel):
    id: uuid.UUID
    stay_id: uuid.UUID
    period_month: str
    period_start: date
    period_end: date
    amount_paise: int
    due_date: date
    status: InvoiceStatus


class PaymentIn(BaseModel):
    invoice_id: uuid.UUID
    amount_paise: int = Field(gt=0)
    mode: PaymentMode = PaymentMode.cash
    reference: str | None = None


class PaymentOut(ORMModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    amount_paise: int
    mode: PaymentMode
    reference: str | None
    paid_at: datetime


class InvoiceWithPayments(InvoiceOut):
    payments: list[PaymentOut]
    paid_paise: int
    balance_paise: int


class DueRow(BaseModel):
    invoice_id: uuid.UUID
    tenant_id: uuid.UUID
    tenant_name: str
    tenant_phone: str
    property_id: uuid.UUID | None = None
    property_name: str
    room_number: str
    bed_label: str
    period_month: str
    amount_paise: int
    paid_paise: int
    balance_paise: int
    due_date: date
    status: InvoiceStatus


class DuesSummary(BaseModel):
    total_invoices: int
    pending: int
    partial: int
    paid: int
    billed_paise: int
    collected_paise: int
    outstanding_paise: int


class DuesOut(BaseModel):
    summary: DuesSummary
    rows: list[DueRow]
