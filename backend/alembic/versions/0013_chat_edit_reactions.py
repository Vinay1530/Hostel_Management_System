"""Chat message edits, reactions and read receipts.

Revision ID: 0013_chat_edit_reactions
Down revision: 0012_phone_change_requests
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_chat_edit_reactions"
down_revision = "0012_phone_change_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "conversation_participants",
        sa.Column("last_delivered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "message_reactions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("message_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["message_id"], ["messages.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "message_id", "user_id", name="uq_message_reactions_message_user"
        ),
    )
    op.create_index(
        "ix_message_reactions_message_id", "message_reactions", ["message_id"]
    )
    op.create_index(
        "ix_message_reactions_user_id", "message_reactions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_message_reactions_user_id", table_name="message_reactions")
    op.drop_index("ix_message_reactions_message_id", table_name="message_reactions")
    op.drop_table("message_reactions")
    op.drop_column("conversation_participants", "last_delivered_at")
    op.drop_column("messages", "edited_at")
