"""search indexes and additional PG location/rules details

Revision ID: 0006_search_and_pg_details
Down revision: 0005_complaints_and_chat
"""

from alembic import op
import sqlalchemy as sa


revision = "0006_search_and_pg_details"
down_revision = "0005_complaints_and_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("properties", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("properties", sa.Column("locality", sa.String(length=150), nullable=True))
    op.add_column("properties", sa.Column("gate_timing", sa.String(length=200), nullable=True))
    op.add_column("properties", sa.Column("food_rules", sa.Text(), nullable=True))
    op.add_column("properties", sa.Column("visitor_rules", sa.Text(), nullable=True))

    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.create_index(
            "ix_tenants_full_name_trgm",
            "tenants",
            ["full_name"],
            postgresql_using="gin",
            postgresql_ops={"full_name": "gin_trgm_ops"},
        )
        op.create_index(
            "ix_properties_name_trgm",
            "properties",
            ["name"],
            postgresql_using="gin",
            postgresql_ops={"name": "gin_trgm_ops"},
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.drop_index("ix_properties_name_trgm", table_name="properties")
        op.drop_index("ix_tenants_full_name_trgm", table_name="tenants")
    op.drop_column("properties", "visitor_rules")
    op.drop_column("properties", "food_rules")
    op.drop_column("properties", "gate_timing")
    op.drop_column("properties", "locality")
    op.drop_column("properties", "city")
