"""Initial schema: orgs, users, properties, rooms, beds, tenants, stays, invoices, payments, charges

Revision ID: 0001_initial
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("contact_phone", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone", name="uq_users_phone"),
    )
    op.create_table(
        "memberships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.Enum("owner", "manager", "tenant", name="role_enum", native_enum=False), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "organization_id", name="uq_membership"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "otp_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("code", sa.String(6), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_otp_tokens_phone", "otp_tokens", ["phone"])

    op.create_table(
        "properties",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("advance_or_arrears", sa.Enum("advance", "arrears", name="billing_cycle_enum", native_enum=False), nullable=False),
        sa.Column("due_day", sa.Integer(), nullable=False),
        sa.Column("pro_rate_first_month", sa.Boolean(), nullable=False),
        sa.Column("notice_period_days", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_properties_organization_id", "properties", ["organization_id"])

    op.create_table(
        "floors",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_floors_organization_id", "floors", ["organization_id"])
    op.create_index("ix_floors_property_id", "floors", ["property_id"])

    op.create_table(
        "rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("floor_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.String(20), nullable=False),
        sa.Column("sharing_type", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rooms_organization_id", "rooms", ["organization_id"])
    op.create_index("ix_rooms_floor_id", "rooms", ["floor_id"])

    op.create_table(
        "beds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("room_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(10), nullable=False),
        sa.Column("rent_paise", sa.Integer(), nullable=False),
        sa.Column("deposit_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.Enum("vacant", "maintenance", name="bed_status_enum", native_enum=False), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("room_id", "label", name="uq_bed_room_label"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_beds_organization_id", "beds", ["organization_id"])
    op.create_index("ix_beds_room_id", "beds", ["room_id"])

    op.create_table(
        "tenants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("full_name", sa.String(200), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("email", sa.String(200), nullable=True),
        sa.Column("emergency_contact_name", sa.String(200), nullable=True),
        sa.Column("emergency_contact_phone", sa.String(20), nullable=True),
        sa.Column("id_number", sa.String(100), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenants_organization_id", "tenants", ["organization_id"])

    op.create_table(
        "tenant_documents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("doc_type", sa.Enum("kyc_id", "agreement", "other", name="doc_type_enum", native_enum=False), nullable=False),
        sa.Column("file_path", sa.String(500), nullable=False),
        sa.Column("original_name", sa.String(300), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_documents_organization_id", "tenant_documents", ["organization_id"])
    op.create_index("ix_tenant_documents_tenant_id", "tenant_documents", ["tenant_id"])

    op.create_table(
        "stays",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("bed_id", sa.Uuid(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("agreed_rent_paise", sa.Integer(), nullable=False),
        sa.Column("deposit_paise", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stays_organization_id", "stays", ["organization_id"])
    op.create_index("ix_stays_tenant_id", "stays", ["tenant_id"])
    op.create_index("ix_stays_bed_id", "stays", ["bed_id"])
    op.create_index("ix_stays_bed_active", "stays", ["bed_id", "active"])
    op.create_index("ix_stays_active", "stays", ["active"])

    op.create_table(
        "rent_invoices",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("stay_id", sa.Uuid(), nullable=False),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.Enum("pending", "partial", "paid", "void", name="invoice_status_enum", native_enum=False), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("stay_id", "period_month", name="uq_invoice_stay_month"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rent_invoices_organization_id", "rent_invoices", ["organization_id"])
    op.create_index("ix_rent_invoices_stay_id", "rent_invoices", ["stay_id"])
    op.create_index("ix_rent_invoices_status", "rent_invoices", ["status"])

    op.create_table(
        "payments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("invoice_id", sa.Uuid(), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("mode", sa.Enum("cash", "upi_manual", name="payment_mode_enum", native_enum=False), nullable=False),
        sa.Column("reference", sa.String(200), nullable=True),
        sa.Column("received_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["rent_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["received_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payments_organization_id", "payments", ["organization_id"])
    op.create_index("ix_payments_invoice_id", "payments", ["invoice_id"])

    op.create_table(
        "charges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("stay_id", sa.Uuid(), nullable=False),
        sa.Column("charge_type", sa.Enum("electricity", "food", "late_fee", "other", name="charge_type_enum", native_enum=False), nullable=False),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("charge_month", sa.String(7), nullable=False),
        sa.Column("applied_invoice_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["applied_invoice_id"], ["rent_invoices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_charges_organization_id", "charges", ["organization_id"])
    op.create_index("ix_charges_stay_id", "charges", ["stay_id"])


def downgrade() -> None:
    op.drop_table("charges")
    op.drop_table("payments")
    op.drop_table("rent_invoices")
    op.drop_table("stays")
    op.drop_table("tenant_documents")
    op.drop_table("tenants")
    op.drop_table("beds")
    op.drop_table("rooms")
    op.drop_table("floors")
    op.drop_table("properties")
    op.drop_table("otp_tokens")
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("organizations")
    for name in (
        "payment_mode_enum", "invoice_status_enum", "charge_type_enum",
        "bed_status_enum", "billing_cycle_enum", "doc_type_enum", "role_enum",
    ):
        op.execute(f'DROP TYPE IF EXISTS "{name}"')
