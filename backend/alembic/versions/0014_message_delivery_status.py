"""Store chat message delivery status as a monotonic high-water mark.

Revision ID: 0014_message_delivery_status
Down revision: 0013_chat_edit_reactions
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_message_delivery_status"
down_revision = "0013_chat_edit_reactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "messages",
        sa.Column(
            "delivery_status",
            sa.String(length=12),
            nullable=False,
            server_default="sent",
        ),
    )
    # Backfill from the participant read/delivered stamps. A message counts as
    # read/delivered only when every recipient has reached that state.
    op.execute(
        """
        UPDATE messages m
        SET delivery_status = 'read'
        WHERE EXISTS (
                SELECT 1 FROM conversation_participants cp
                WHERE cp.conversation_id = m.conversation_id
                  AND cp.user_id <> m.sender_id
            )
          AND NOT EXISTS (
                SELECT 1 FROM conversation_participants cp
                WHERE cp.conversation_id = m.conversation_id
                  AND cp.user_id <> m.sender_id
                  AND (cp.last_read_at IS NULL OR cp.last_read_at < m.created_at)
            )
        """
    )
    op.execute(
        """
        UPDATE messages m
        SET delivery_status = 'delivered'
        WHERE m.delivery_status = 'sent'
          AND EXISTS (
                SELECT 1 FROM conversation_participants cp
                WHERE cp.conversation_id = m.conversation_id
                  AND cp.user_id <> m.sender_id
            )
          AND NOT EXISTS (
                SELECT 1 FROM conversation_participants cp
                WHERE cp.conversation_id = m.conversation_id
                  AND cp.user_id <> m.sender_id
                  AND (
                        cp.last_delivered_at IS NULL
                        OR cp.last_delivered_at < m.created_at
                  )
            )
        """
    )


def downgrade() -> None:
    op.drop_column("messages", "delivery_status")
