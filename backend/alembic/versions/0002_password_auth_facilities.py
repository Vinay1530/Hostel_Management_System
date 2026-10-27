"""Password auth (users.password_hash, users.email) + properties.facilities

Revision ID: 0002_password_auth
Down revision: 0001_initial
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_password_auth"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(300), nullable=True))
    op.add_column("properties", sa.Column("facilities", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("properties", "facilities")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")
