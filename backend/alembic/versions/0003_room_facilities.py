"""rooms.facilities for per-room amenities

Revision ID: 0003_room_facilities
Down revision: 0002_password_auth
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_room_facilities"
down_revision = "0002_password_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rooms", sa.Column("facilities", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("rooms", "facilities")
