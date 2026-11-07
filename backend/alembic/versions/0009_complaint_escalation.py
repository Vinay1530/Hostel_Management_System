"""Complaint escalation: track when a complaint was last escalated to staff."""

revision = "0009_complaint_escalation"
down_revision = "0008_new_features"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("complaints", sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("complaints", "escalated_at")
