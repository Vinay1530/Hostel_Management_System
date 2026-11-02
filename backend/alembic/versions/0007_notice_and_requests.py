"""notice period on stays + change/booking requests

Revision ID: 0007_notice_and_requests
Down revision: 0006_search_and_pg_details
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_notice_and_requests"
down_revision = "0006_search_and_pg_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("stays", sa.Column("notice_start_date", sa.Date(), nullable=True))
    op.add_column("stays", sa.Column("notice_end_date", sa.Date(), nullable=True))

    op.create_table(
        "change_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="change"),
        sa.Column("tenant_id", sa.Uuid(), nullable=True),
        sa.Column("guest_name", sa.String(length=200), nullable=True),
        sa.Column("guest_phone", sa.String(length=20), nullable=True),
        sa.Column("building_id", sa.Uuid(), nullable=True),
        sa.Column("floor_id", sa.Uuid(), nullable=True),
        sa.Column("room_id", sa.Uuid(), nullable=True),
        sa.Column("bed_id", sa.Uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="open"),
        sa.Column("decided_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["building_id"], ["properties.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["floor_id"], ["floors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["room_id"], ["rooms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["bed_id"], ["beds.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_change_requests_organization_id", "change_requests", ["organization_id"])
    op.create_index("ix_change_requests_kind", "change_requests", ["kind"])
    op.create_index("ix_change_requests_tenant_id", "change_requests", ["tenant_id"])
    op.create_index("ix_change_requests_building_id", "change_requests", ["building_id"])
    op.create_index("ix_change_requests_status", "change_requests", ["status"])

    op.add_column(
        "in_app_notifications",
        sa.Column("request_id", sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        "fk_in_app_notifications_request",
        "in_app_notifications",
        "change_requests",
        ["request_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_in_app_notifications_request", "in_app_notifications", type_="foreignkey")
    op.drop_column("in_app_notifications", "request_id")
    op.drop_index("ix_change_requests_status", table_name="change_requests")
    op.drop_index("ix_change_requests_building_id", table_name="change_requests")
    op.drop_index("ix_change_requests_tenant_id", table_name="change_requests")
    op.drop_index("ix_change_requests_kind", table_name="change_requests")
    op.drop_index("ix_change_requests_organization_id", table_name="change_requests")
    op.drop_table("change_requests")
    op.drop_column("stays", "notice_end_date")
    op.drop_column("stays", "notice_start_date")
