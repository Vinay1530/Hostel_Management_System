"""Requested phone number for tenant phone-change requests.

Revision ID: 0012_phone_change_requests
Down revision: 0011_org_announcements
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_phone_change_requests"
down_revision = "0011_org_announcements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "change_requests",
        sa.Column("requested_phone", sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("change_requests", "requested_phone")
