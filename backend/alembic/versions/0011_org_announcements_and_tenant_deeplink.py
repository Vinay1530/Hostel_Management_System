"""Org-wide announcement conversations and tenant deep-link notifications.

Revision ID: 0011_org_announcements
Down revision: 0010_add_avatar_to_user
"""

revision = "0011_org_announcements"
down_revision = "0010_add_avatar_to_user"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Conversation.property_id becomes nullable so an org-wide
    # announcement conversation (property_id IS NULL, type 'announcement') can exist.
    op.alter_column("conversations", "property_id", existing_type=sa.Uuid(), nullable=True)

    # InAppNotification.tenant_id lets staff notifications deep-link to a tenant.
    op.add_column("in_app_notifications", sa.Column("tenant_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_in_app_notifications_tenant_id",
        "in_app_notifications",
        "tenants",
        ["tenant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_in_app_notifications_tenant_id", "in_app_notifications", ["tenant_id"]
    )


def downgrade() -> None:
    # Legacy per-property announcement conversations would violate the restored
    # NOT NULL constraint, so drop them first.
    op.execute(
        "DELETE FROM conversations WHERE property_id IS NULL AND type = 'announcement'"
    )
    op.alter_column("conversations", "property_id", existing_type=sa.Uuid(), nullable=False)

    op.drop_index(
        "ix_in_app_notifications_tenant_id", table_name="in_app_notifications"
    )
    op.drop_constraint(
        "fk_in_app_notifications_tenant_id", "in_app_notifications", type_="foreignkey"
    )
    op.drop_column("in_app_notifications", "tenant_id")
