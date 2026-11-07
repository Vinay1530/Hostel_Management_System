"""Add avatar_url column to users table."""

revision = "0010_add_avatar_to_user"
down_revision = "0009_complaint_escalation"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
