"""complaints, notifications, and property chat

Revision ID: 0005_complaints_and_chat
Down revision: 0004_payment_modes
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "0005_complaints_and_chat"
down_revision = "0004_payment_modes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "complaints",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("tenant_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=11), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(length=6), nullable=False),
        sa.Column("status", sa.String(length=11), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_complaints_organization_id", "complaints", ["organization_id"])
    op.create_index("ix_complaints_property_id", "complaints", ["property_id"])
    op.create_index("ix_complaints_tenant_id", "complaints", ["tenant_id"])

    op.create_table(
        "complaint_attachments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("complaint_id", sa.Uuid(), nullable=False),
        sa.Column("file_path", sa.String(length=500), nullable=False),
        sa.Column("original_name", sa.String(length=300), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["complaint_id"], ["complaints.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_complaint_attachments_complaint_id", "complaint_attachments", ["complaint_id"])

    op.create_table(
        "complaint_comments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("complaint_id", sa.Uuid(), nullable=False),
        sa.Column("author_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["complaint_id"], ["complaints.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_complaint_comments_complaint_id", "complaint_comments", ["complaint_id"])
    op.create_index("ix_complaint_comments_author_id", "complaint_comments", ["author_id"])

    op.create_table(
        "complaint_status_history",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("complaint_id", sa.Uuid(), nullable=False),
        sa.Column("changed_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=11), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["complaint_id"], ["complaints.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["changed_by_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_complaint_status_history_complaint_id", "complaint_status_history", ["complaint_id"])
    op.create_index("ix_complaint_status_history_changed_by_user_id", "complaint_status_history", ["changed_by_user_id"])

    op.create_table(
        "in_app_notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("complaint_id", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["complaint_id"], ["complaints.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_in_app_notifications_user_id", "in_app_notifications", ["user_id"])
    op.create_index("ix_in_app_notifications_complaint_id", "in_app_notifications", ["complaint_id"])

    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(length=12), nullable=False),
        sa.Column("direct_user_low_id", sa.Uuid(), nullable=True),
        sa.Column("direct_user_high_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["direct_user_high_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["direct_user_low_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "property_id",
            "direct_user_low_id",
            "direct_user_high_id",
            name="uq_conversation_direct_pair",
        ),
    )
    op.create_index("ix_conversations_organization_id", "conversations", ["organization_id"])
    op.create_index("ix_conversations_property_id", "conversations", ["property_id"])
    op.create_index(
        "uq_conversation_property_channel",
        "conversations",
        ["property_id", "type"],
        unique=True,
        postgresql_where=sa.text("type IN ('announcement', 'group')"),
        sqlite_where=sa.text("type IN ('announcement', 'group')"),
    )

    op.create_table(
        "conversation_participants",
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("conversation_id", "user_id"),
    )
    op.create_index("ix_conversation_participants_user_id", "conversation_participants", ["user_id"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("body", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])
    op.create_index("ix_messages_sender_id", "messages", ["sender_id"])
    op.create_index(
        "ix_messages_conversation_created_id",
        "messages",
        ["conversation_id", "created_at", "id"],
    )

    _seed_existing_property_conversations()


def _seed_existing_property_conversations() -> None:
    bind = op.get_bind()
    properties = sa.table(
        "properties",
        sa.column("id", sa.Uuid()),
        sa.column("organization_id", sa.Uuid()),
    )
    memberships = sa.table(
        "memberships",
        sa.column("user_id", sa.Uuid()),
        sa.column("organization_id", sa.Uuid()),
        sa.column("role", sa.String()),
    )
    tenants = sa.table("tenants", sa.column("id", sa.Uuid()), sa.column("phone", sa.String()))
    stays = sa.table(
        "stays",
        sa.column("tenant_id", sa.Uuid()),
        sa.column("bed_id", sa.Uuid()),
        sa.column("active", sa.Boolean()),
    )
    beds = sa.table("beds", sa.column("id", sa.Uuid()), sa.column("room_id", sa.Uuid()))
    rooms = sa.table("rooms", sa.column("id", sa.Uuid()), sa.column("floor_id", sa.Uuid()))
    floors = sa.table("floors", sa.column("id", sa.Uuid()), sa.column("property_id", sa.Uuid()))
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("phone", sa.String()))
    conversations = sa.table(
        "conversations",
        sa.column("id", sa.Uuid()),
        sa.column("organization_id", sa.Uuid()),
        sa.column("property_id", sa.Uuid()),
        sa.column("type", sa.String()),
    )
    participants = sa.table(
        "conversation_participants",
        sa.column("conversation_id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
    )

    for prop in bind.execute(sa.select(properties.c.id, properties.c.organization_id)):
        conversation_ids = {}
        for channel in ("group", "announcement"):
            conversation_id = uuid.uuid4()
            bind.execute(
                conversations.insert().values(
                    id=conversation_id,
                    organization_id=prop.organization_id,
                    property_id=prop.id,
                    type=channel,
                )
            )
            conversation_ids[channel] = conversation_id

        user_ids = set(
            bind.execute(
                sa.select(memberships.c.user_id).where(
                    memberships.c.organization_id == prop.organization_id,
                    memberships.c.role.in_(("owner", "manager")),
                )
            ).scalars()
        )
        active_tenant_phones = (
            sa.select(tenants.c.phone)
            .select_from(
                tenants.join(stays, stays.c.tenant_id == tenants.c.id)
                .join(beds, beds.c.id == stays.c.bed_id)
                .join(rooms, rooms.c.id == beds.c.room_id)
                .join(floors, floors.c.id == rooms.c.floor_id)
            )
            .where(floors.c.property_id == prop.id, stays.c.active.is_(True))
        )
        tenant_user_ids = bind.execute(
            sa.select(users.c.id).where(users.c.phone.in_(active_tenant_phones))
        ).scalars()
        user_ids.update(tenant_user_ids)

        for conversation_id in conversation_ids.values():
            if not user_ids:
                continue
            bind.execute(
                participants.insert(),
                [{"conversation_id": conversation_id, "user_id": user_id} for user_id in user_ids],
            )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_created_id", table_name="messages")
    op.drop_index("ix_messages_sender_id", table_name="messages")
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.drop_index("ix_conversation_participants_user_id", table_name="conversation_participants")
    op.drop_table("conversation_participants")
    op.drop_index("uq_conversation_property_channel", table_name="conversations")
    op.drop_index("ix_conversations_property_id", table_name="conversations")
    op.drop_index("ix_conversations_organization_id", table_name="conversations")
    op.drop_table("conversations")
    op.drop_index("ix_in_app_notifications_complaint_id", table_name="in_app_notifications")
    op.drop_index("ix_in_app_notifications_user_id", table_name="in_app_notifications")
    op.drop_table("in_app_notifications")
    op.drop_index("ix_complaint_status_history_changed_by_user_id", table_name="complaint_status_history")
    op.drop_index("ix_complaint_status_history_complaint_id", table_name="complaint_status_history")
    op.drop_table("complaint_status_history")
    op.drop_index("ix_complaint_comments_author_id", table_name="complaint_comments")
    op.drop_index("ix_complaint_comments_complaint_id", table_name="complaint_comments")
    op.drop_table("complaint_comments")
    op.drop_index("ix_complaint_attachments_complaint_id", table_name="complaint_attachments")
    op.drop_table("complaint_attachments")
    op.drop_index("ix_complaints_tenant_id", table_name="complaints")
    op.drop_index("ix_complaints_property_id", table_name="complaints")
    op.drop_index("ix_complaints_organization_id", table_name="complaints")
    op.drop_table("complaints")
