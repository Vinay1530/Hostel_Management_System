import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import UUID as PGUuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.enums import BedStatus, BillingCycle, ChargeType, DocType, InvoiceStatus, PaymentMode, Role

# Portable UUID type: PG native uuid, sqlite falls back to CHAR(36)
PortableUuid = PGUuid().with_variant(Uuid, "sqlite")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200))
    contact_phone: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str | None] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(200))
    password_hash: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    memberships: Mapped[list["Membership"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("user_id", "organization_id", name="uq_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, name="role_enum", native_enum=False), nullable=False)

    user: Mapped[User] = relationship(back_populates="memberships")


class OtpToken(Base):
    __tablename__ = "otp_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    phone: Mapped[str] = mapped_column(String(20), index=True)
    code: Mapped[str] = mapped_column(String(6))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(Text)
    advance_or_arrears: Mapped[BillingCycle] = mapped_column(
        Enum(BillingCycle, name="billing_cycle_enum", native_enum=False), default=BillingCycle.advance
    )
    due_day: Mapped[int] = mapped_column(Integer, default=5)
    pro_rate_first_month: Mapped[bool] = mapped_column(Boolean, default=True)
    notice_period_days: Mapped[int] = mapped_column(Integer, default=30)
    facilities: Mapped[str | None] = mapped_column(Text)  # comma-separated: wifi,laundry,mess,water...
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Floor(Base):
    __tablename__ = "floors"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    property_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100))


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    floor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("floors.id", ondelete="CASCADE"), nullable=False, index=True)
    number: Mapped[str] = mapped_column(String(20))
    sharing_type: Mapped[int] = mapped_column(Integer, default=1)  # kept in sync: = number of beds
    facilities: Mapped[str | None] = mapped_column(Text)  # comma-separated: wifi,mess,laundry...


class Bed(Base):
    __tablename__ = "beds"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    room_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rooms.id", ondelete="CASCADE"), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(10))  # A / B / C ...
    rent_paise: Mapped[int] = mapped_column(Integer, default=0)
    deposit_paise: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[BedStatus] = mapped_column(
        Enum(BedStatus, name="bed_status_enum", native_enum=False), default=BedStatus.vacant
    )

    __table_args__ = (UniqueConstraint("room_id", "label", name="uq_bed_room_label"),)


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(200))
    emergency_contact_name: Mapped[str | None] = mapped_column(String(200))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(20))
    id_number: Mapped[str | None] = mapped_column(String(100))  # Aadhaar / other ID reference
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    stays: Mapped[list["Stay"]] = relationship(back_populates="tenant")
    documents: Mapped[list["TenantDocument"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class TenantDocument(Base):
    __tablename__ = "tenant_documents"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type: Mapped[DocType] = mapped_column(Enum(DocType, name="doc_type_enum", native_enum=False), default=DocType.kyc_id)
    file_path: Mapped[str] = mapped_column(String(500))
    original_name: Mapped[str] = mapped_column(String(300))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship(back_populates="documents")


class Stay(Base):
    __tablename__ = "stays"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    bed_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("beds.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    agreed_rent_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    deposit_paise: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)

    tenant: Mapped["Tenant"] = relationship(back_populates="stays")
    bed: Mapped["Bed"] = relationship()

    __table_args__ = (
        Index("ix_stays_bed_active", "bed_id", "active"),
    )


class RentInvoice(Base):
    __tablename__ = "rent_invoices"
    __table_args__ = (
        UniqueConstraint("stay_id", "period_month", name="uq_invoice_stay_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    stay_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), nullable=False, index=True)
    period_month: Mapped[str] = mapped_column(String(7))  # "YYYY-MM"
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[InvoiceStatus] = mapped_column(
        Enum(InvoiceStatus, name="invoice_status_enum", native_enum=False), default=InvoiceStatus.pending, index=True
    )

    stay: Mapped["Stay"] = relationship()
    payments: Mapped[list["Payment"]] = relationship(back_populates="invoice")


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rent_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    mode: Mapped[PaymentMode] = mapped_column(
        Enum(PaymentMode, name="payment_mode_enum", native_enum=False), default=PaymentMode.cash
    )
    reference: Mapped[str | None] = mapped_column(String(200))
    received_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    invoice: Mapped["RentInvoice"] = relationship(back_populates="payments")


class Charge(Base):
    __tablename__ = "charges"

    id: Mapped[uuid.UUID] = mapped_column(PortableUuid, primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    stay_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stays.id", ondelete="CASCADE"), nullable=False, index=True)
    charge_type: Mapped[ChargeType] = mapped_column(
        Enum(ChargeType, name="charge_type_enum", native_enum=False), default=ChargeType.other
    )
    amount_paise: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    charge_month: Mapped[str] = mapped_column(String(7))  # month this charge applies to
    applied_invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rent_invoices.id", ondelete="SET NULL"), default=None
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
