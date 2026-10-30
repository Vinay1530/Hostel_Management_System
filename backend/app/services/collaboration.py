import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import ConversationType, Role
from app.models.models import (
    Bed,
    Conversation,
    ConversationParticipant,
    Floor,
    Membership,
    Property,
    Room,
    Stay,
    Tenant,
    User,
)


def current_tenant_property(db: Session, org_id: uuid.UUID, user: User) -> tuple[Tenant, Property]:
    tenant = db.execute(
        select(Tenant).where(Tenant.organization_id == org_id, Tenant.phone == user.phone)
    ).scalar_one_or_none()
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant profile not found")
    active_property = db.execute(
        select(Property)
        .join(Floor, Floor.property_id == Property.id)
        .join(Room, Room.floor_id == Floor.id)
        .join(Bed, Bed.room_id == Room.id)
        .join(Stay, Stay.bed_id == Bed.id)
        .where(
            Stay.tenant_id == tenant.id,
            Stay.active.is_(True),
            Property.organization_id == org_id,
        )
    ).scalar_one_or_none()
    if active_property is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An active stay is required for this action")
    return tenant, active_property


def ensure_property_conversations(db: Session, prop: Property) -> tuple[Conversation, Conversation]:
    channels: dict[ConversationType, Conversation] = {}
    for channel_type in (ConversationType.announcement, ConversationType.group):
        conversation = db.execute(
            select(Conversation).where(
                Conversation.property_id == prop.id,
                Conversation.type == channel_type,
            )
        ).scalar_one_or_none()
        if conversation is None:
            conversation = Conversation(
                organization_id=prop.organization_id,
                property_id=prop.id,
                type=channel_type,
            )
            db.add(conversation)
            db.flush()
        channels[channel_type] = conversation

    participant_ids = set(
        db.execute(
            select(Membership.user_id).where(
                Membership.organization_id == prop.organization_id,
                Membership.role.in_((Role.owner, Role.manager)),
            )
        ).scalars()
    )
    tenant_phones = (
        select(Tenant.phone)
        .join(Stay, Stay.tenant_id == Tenant.id)
        .join(Bed, Bed.id == Stay.bed_id)
        .join(Room, Room.id == Bed.room_id)
        .join(Floor, Floor.id == Room.floor_id)
        .where(Floor.property_id == prop.id, Stay.active.is_(True))
    )
    participant_ids.update(
        db.execute(select(User.id).where(User.phone.in_(tenant_phones))).scalars()
    )
    for conversation in channels.values():
        existing_ids = set(
            db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation.id
                )
            ).scalars()
        )
        db.add_all(
            ConversationParticipant(conversation_id=conversation.id, user_id=user_id)
            for user_id in participant_ids - existing_ids
        )
    db.flush()
    return channels[ConversationType.group], channels[ConversationType.announcement]


def sync_tenant_participation(
    db: Session,
    prop: Property,
    tenant: Tenant,
    *,
    joined: bool,
) -> None:
    group, announcements = ensure_property_conversations(db, prop)
    user = db.execute(select(User).where(User.phone == tenant.phone)).scalar_one_or_none()
    if user is None:
        return
    conversation_ids = [group.id, announcements.id]
    if not joined:
        conversation_ids.extend(
            db.execute(
                select(Conversation.id)
                .join(
                    ConversationParticipant,
                    ConversationParticipant.conversation_id == Conversation.id,
                )
                .where(
                    Conversation.property_id == prop.id,
                    Conversation.type == ConversationType.direct,
                    ConversationParticipant.user_id == user.id,
                )
            ).scalars()
        )
    for conversation_id in conversation_ids:
        participant = db.get(ConversationParticipant, (conversation_id, user.id))
        if joined and participant is None:
            db.add(ConversationParticipant(conversation_id=conversation_id, user_id=user.id))
        elif not joined and participant is not None:
            db.delete(participant)


def property_for_staff(db: Session, org_id: uuid.UUID, property_id: uuid.UUID) -> Property:
    prop = db.get(Property, property_id)
    if prop is None or prop.organization_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    return prop


def require_conversation_participant(
    db: Session, conversation_id: uuid.UUID, user_id: uuid.UUID
) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    participant = db.get(ConversationParticipant, (conversation.id, user_id))
    if participant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return conversation
