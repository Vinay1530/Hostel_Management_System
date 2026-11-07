"""Add feedback, security deposit, payment reminder, invoice template, analytics, custom tenant field, occupancy map tables

Revision ID: 0008_new_features
Down revision: 0007_notice_and_requests
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_new_features"
down_revision = "0007_notice_and_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # tenant_feedbacks table
    op.create_table(
        "tenant_feedbacks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("stay_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("property_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tenant_feedbacks_tenant_id", "tenant_feedbacks", ["tenant_id"])
    op.create_index("ix_tenant_feedbacks_property_id", "tenant_feedbacks", ["property_id"])

    # security_deposits table
    op.create_table(
        "security_deposits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("stay_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("amount_paise", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="held", index=True),
        sa.Column("held_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("refund_date", sa.Date(), nullable=True),
        sa.Column("deductions_paise", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["stay_id"], ["stays.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["held_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_deposits_stay_id", "security_deposits", ["stay_id"])
    op.create_index("ix_security_deposits_status", "security_deposits", ["status"])

    # payment_reminders table
    op.create_table(
        "payment_reminders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("invoice_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("reminder_type", sa.String(length=20), nullable=False),
        sa.Column("reminder_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("channel", sa.String(length=20), nullable=False, server_default="email"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending", index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["rent_invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payment_reminders_invoice_id", "payment_reminders", ["invoice_id"])
    op.create_index("ix_payment_reminders_status", "payment_reminders", ["status"])

    # invoice_templates table
    op.create_table(
        "invoice_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("template_data", sa.Text(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # analytics_data table
    op.create_table(
        "analytics_data",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("metric_type", sa.String(length=50), nullable=False),
        sa.Column("metric_value", sa.Text(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # custom_tenant_fields table
    op.create_table(
        "custom_tenant_fields",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("field_value", sa.Text(), nullable=False),
        sa.Column("field_type", sa.String(length=20), nullable=False, server_default="text"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    # occupancy_maps table
    op.create_table(
        "occupancy_maps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("floor_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("room_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("bed_id", sa.Uuid(), nullable=False, index=True),
        sa.Column("x_position", sa.Integer(), nullable=False),
        sa.Column("y_position", sa.Integer(), nullable=False),
        sa.Column("floor_number", sa.Integer(), nullable=False),
        sa.Column("room_number", sa.String(length=20), nullable=False),
        sa.Column("bed_label", sa.String(length=10), nullable=False),
        sa.Column("is_occupied", sa.Boolean(), nullable=False, server_default="false", index=True),
        sa.Column("tenant_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Add backref relationships via foreign key constraints on existing tables
    # Tenant -> TenantFeedback (via tenant_feedbacks.tenant_id FK already added)
    # Tenant -> CustomTenantField (via custom_tenant_fields.tenant_id FK already added)
    # Stay -> SecurityDeposit (via security_deposits.stay_id FK already added)
    # RentInvoice -> PaymentReminder (via payment_reminders.invoice_id FK already added)


def downgrade() -> None:
    op.drop_table("occupancy_maps")
    op.drop_table("custom_tenant_fields")
    op.drop_table("analytics_data")
    op.drop_table("invoice_templates")
    op.drop_table("payment_reminders")
    op.drop_table("security_deposits")
    op.drop_table("tenant_feedbacks")