"""support card and bank transfer payments

Revision ID: 0004_payment_modes
Down revision: 0003_room_facilities
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_payment_modes"
down_revision = "0003_room_facilities"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.alter_column(
            "mode",
            existing_type=sa.String(length=10),
            type_=sa.String(length=20),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch_op:
        batch_op.alter_column(
            "mode",
            existing_type=sa.String(length=20),
            type_=sa.String(length=10),
            existing_nullable=False,
        )
