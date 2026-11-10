import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal, get_db
from app.core.security import AuthContext, decode_access_token, require_org, require_staff
from app.models.enums import (
    ComplaintCategory,
    ComplaintPriority,
    ComplaintStatus,
    ConversationType,
    Role,
)
from app.models.models import (
    Bed,
    ChatMessage,
    Complaint,
    ComplaintAttachment,
    ComplaintComment,
    ComplaintStatusHistory,
    Conversation,
    ConversationParticipant,
    ChangeRequest,
    Floor,
    InAppNotification,
    Membership,
    MessageReaction,
    Property,
    Room,
    Stay,
    Tenant,
    User,
)
from app.schemas.schemas import (
    ComplaintAttachmentOut,
    ComplaintCommentIn,
    ComplaintCommentOut,
    ComplaintOut,
    ComplaintStatusIn,
    ComplaintStatusHistoryOut,
    ConversationContactOut,
    ConversationOut,
    ConversationsOut,
    DirectConversationIn,
    MessageEditIn,
    MessageIn,
    MessageOut,
    MessagePage,
    MessageReactionIn,
    MessageReactionOut,
    NotificationOut,
)
from app.services.collaboration import (
    current_tenant_property,
    ensure_property_conversations,
    get_or_create_direct_conversation as ensure_direct_conversation,
    property_for_staff,
    require_conversation_participant,
)
from app.services.notify import notify_staff

router = APIRouter(tags=["complaints", "chat"])
logger = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTOS = 3
PHOTO_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
PHOTO_SIGNATURES = {
    "image/jpeg": lambda data: data.startswith(b"\xff\xd8\xff"),
    "image/png": lambda data: data.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/webp": lambda data: len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP",
}


def _complaint_for_user(
    db: Session, complaint_id: uuid.UUID, auth: AuthContext
) -> Complaint:
    complaint = db.get(Complaint, complaint_id)
    if complaint is None or complaint.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    if auth.role == Role.tenant:
        tenant = db.execute(
            select(Tenant).where(
                Tenant.organization_id == auth.org_id,
                Tenant.phone == auth.user.phone,
            )
        ).scalar_one_or_none()
        if tenant is None or tenant.id != complaint.tenant_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    elif auth.role not in (Role.owner, Role.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Complaint access required")
    return complaint


def _complaint_out(db: Session, complaint: Complaint) -> ComplaintOut:
    prop = db.get(Property, complaint.property_id)
    tenant = db.get(Tenant, complaint.tenant_id)
    attachments = db.execute(
        select(ComplaintAttachment)
        .where(ComplaintAttachment.complaint_id == complaint.id)
        .order_by(ComplaintAttachment.created_at)
    ).scalars().all()
    comments = db.execute(
        select(ComplaintComment, User.name)
        .join(User, User.id == ComplaintComment.author_id)
        .where(ComplaintComment.complaint_id == complaint.id)
        .order_by(ComplaintComment.created_at, ComplaintComment.id)
    ).all()
    status_history = db.execute(
        select(ComplaintStatusHistory)
        .where(ComplaintStatusHistory.complaint_id == complaint.id)
        .order_by(ComplaintStatusHistory.created_at, ComplaintStatusHistory.id)
    ).scalars().all()
    return ComplaintOut(
        id=complaint.id,
        property_id=complaint.property_id,
        property_name=prop.name if prop else "",
        tenant_id=complaint.tenant_id,
        tenant_name=tenant.full_name if tenant else "",
        category=complaint.category,
        title=complaint.title,
        description=complaint.description,
        priority=complaint.priority,
        status=complaint.status,
        created_at=complaint.created_at,
        updated_at=complaint.updated_at,
        attachments=[
            ComplaintAttachmentOut.model_validate(attachment)
            for attachment in attachments
        ],
        comments=[
            ComplaintCommentOut(
                id=comment.id,
                author_id=comment.author_id,
                author_name=author_name,
                body=comment.body,
                created_at=comment.created_at,
            )
            for comment, author_name in comments
        ],
        status_history=[
            ComplaintStatusHistoryOut.model_validate(item)
            for item in status_history
        ],
    )


@router.post("/complaints", response_model=ComplaintOut, status_code=201)
async def create_complaint(
    category: ComplaintCategory = Form(),
    title: str = Form(min_length=1, max_length=200),
    description: str = Form(min_length=1, max_length=5000),
    priority: ComplaintPriority = Form(ComplaintPriority.medium),
    files: Annotated[list[UploadFile] | None, File()] = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    if auth.role != Role.tenant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant access required")
    tenant, prop = current_tenant_property(db, auth.org_id, auth.user)
    title = title.strip()
    description = description.strip()
    if not title or not description:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Title and description are required")
    uploads = files or []
    if len(uploads) > MAX_PHOTOS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A maximum of 3 photos is allowed")

    photo_data: list[tuple[UploadFile, bytes]] = []
    for upload in uploads:
        content_type = (upload.content_type or "").lower()
        if content_type not in PHOTO_TYPES:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                "Photos must be JPEG, PNG, or WebP images",
            )
        data = await upload.read(MAX_PHOTO_BYTES + 1)
        if len(data) > MAX_PHOTO_BYTES:
            raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Each photo must be 5 MB or smaller")
        if not data:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Photo files cannot be empty")
        if not PHOTO_SIGNATURES[content_type](data):
            raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Photo content does not match its file type")
        photo_data.append((upload, data))

    complaint = Complaint(
        organization_id=auth.org_id,
        property_id=prop.id,
        tenant_id=tenant.id,
        category=category,
        title=title,
        description=description,
        priority=priority,
        status=ComplaintStatus.open,
    )
    db.add(complaint)
    db.flush()
    db.add(
        ComplaintStatusHistory(
            complaint_id=complaint.id,
            changed_by_user_id=auth.user.id,
            status=ComplaintStatus.open,
        )
    )
    directory = get_settings().upload_dir / str(auth.org_id) / str(prop.id) / "complaints"
    directory.mkdir(parents=True, exist_ok=True)
    for upload, data in photo_data:
        extension = PHOTO_TYPES[upload.content_type.lower()]
        stored = directory / f"{uuid.uuid4()}{extension}"
        stored.write_bytes(data)
        db.add(
            ComplaintAttachment(
                complaint_id=complaint.id,
                file_path=str(stored),
                original_name=(upload.filename or "photo")[:300],
                content_type=upload.content_type.lower(),
            )
        )
    db.commit()
    db.refresh(complaint)
    notify_staff(
        db,
        auth.org_id,
        f"New {priority.value} priority report",
        f"{tenant.full_name}: {title}",
        complaint_id=complaint.id,
    )
    db.commit()
    return _complaint_out(db, complaint)


@router.get("/complaints", response_model=list[ComplaintOut])
def list_complaints(
    status_filter: ComplaintStatus | None = Query(None, alias="status"),
    category: ComplaintCategory | None = None,
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    stmt = select(Complaint).where(Complaint.organization_id == auth.org_id)
    if auth.role == Role.tenant:
        tenant = db.execute(
            select(Tenant).where(
                Tenant.organization_id == auth.org_id,
                Tenant.phone == auth.user.phone,
            )
        ).scalar_one_or_none()
        if tenant is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant profile not found")
        stmt = stmt.where(Complaint.tenant_id == tenant.id)
    elif auth.role in (Role.owner, Role.manager):
        if property_id is not None:
            property_for_staff(db, auth.org_id, property_id)
            stmt = stmt.where(Complaint.property_id == property_id)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Complaint access required")
    if status_filter is not None:
        stmt = stmt.where(Complaint.status == status_filter)
    if category is not None:
        stmt = stmt.where(Complaint.category == category)
    rows = db.execute(stmt.order_by(Complaint.updated_at.desc(), Complaint.id)).scalars().all()
    return [_complaint_out(db, complaint) for complaint in rows]


@router.get("/complaints/{complaint_id}", response_model=ComplaintOut)
def get_complaint(
    complaint_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    return _complaint_out(db, _complaint_for_user(db, complaint_id, auth))


@router.get("/complaints/{complaint_id}/attachments/{attachment_id}")
def get_complaint_attachment(
    complaint_id: uuid.UUID,
    attachment_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    _complaint_for_user(db, complaint_id, auth)
    attachment = db.execute(
        select(ComplaintAttachment).where(
            ComplaintAttachment.id == attachment_id,
            ComplaintAttachment.complaint_id == complaint_id,
        )
    ).scalar_one_or_none()
    if attachment is None or not Path(attachment.file_path).is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return FileResponse(
        attachment.file_path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
    )


@router.patch("/complaints/{complaint_id}/status", response_model=ComplaintOut)
def update_complaint_status(
    complaint_id: uuid.UUID,
    body: ComplaintStatusIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    complaint = db.get(Complaint, complaint_id)
    if complaint is None or complaint.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Complaint not found")
    allowed = {
        ComplaintStatus.open: ComplaintStatus.in_progress,
        ComplaintStatus.in_progress: ComplaintStatus.resolved,
        ComplaintStatus.resolved: ComplaintStatus.closed,
    }
    if allowed.get(complaint.status) != body.status:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Status must advance open → in_progress → resolved → closed")
    complaint.status = body.status
    db.add(
        ComplaintStatusHistory(
            complaint_id=complaint.id,
            changed_by_user_id=auth.user.id,
            status=body.status,
        )
    )
    recipient = db.execute(
        select(User).join(Tenant, Tenant.phone == User.phone).where(Tenant.id == complaint.tenant_id)
    ).scalar_one_or_none()
    if recipient is not None:
        db.add(
            InAppNotification(
                user_id=recipient.id,
                complaint_id=complaint.id,
                title="Complaint status updated",
                body=f'"{complaint.title}" is now {body.status.value.replace("_", " ")}.',
            )
        )
    db.commit()
    db.refresh(complaint)
    return _complaint_out(db, complaint)


@router.post("/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def add_complaint_comment(
    complaint_id: uuid.UUID,
    body: ComplaintCommentIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    complaint = _complaint_for_user(db, complaint_id, auth)
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Comment cannot be empty")
    db.add(ComplaintComment(complaint_id=complaint.id, author_id=auth.user.id, body=text))
    complaint.updated_at = func.now()
    db.commit()
    db.refresh(complaint)
    return _complaint_out(db, complaint)


@router.get("/my/notifications", response_model=list[NotificationOut])
def list_notifications(
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    if auth.role != Role.tenant:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant access required")
    return db.execute(
        select(InAppNotification)
        .outerjoin(Complaint, Complaint.id == InAppNotification.complaint_id)
        .outerjoin(ChangeRequest, ChangeRequest.id == InAppNotification.request_id)
        .where(
            InAppNotification.user_id == auth.user.id,
            or_(
                Complaint.organization_id == auth.org_id,
                ChangeRequest.organization_id == auth.org_id,
                and_(
                    InAppNotification.complaint_id.is_(None),
                    InAppNotification.request_id.is_(None),
                ),
            ),
        )
        .order_by(InAppNotification.created_at.desc())
        .limit(50)
    ).scalars().all()


@router.patch("/my/notifications/{notification_id}/read", response_model=NotificationOut)
def mark_notification_read(
    notification_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    notification = db.execute(
        select(InAppNotification)
        .outerjoin(Complaint, Complaint.id == InAppNotification.complaint_id)
        .outerjoin(ChangeRequest, ChangeRequest.id == InAppNotification.request_id)
        .where(
            InAppNotification.id == notification_id,
            InAppNotification.user_id == auth.user.id,
            or_(
                Complaint.organization_id == auth.org_id,
                ChangeRequest.organization_id == auth.org_id,
                and_(
                    InAppNotification.complaint_id.is_(None),
                    InAppNotification.request_id.is_(None),
                ),
            ),
        )
    ).scalar_one_or_none()
    if notification is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if notification.read_at is None:
        notification.read_at = func.now()
        db.commit()
        db.refresh(notification)
    return notification


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _delivery_status(db: Session, message: ChatMessage) -> str:
    """sent = nobody received it yet, delivered = every recipient got it,
    read = every recipient opened the thread after it was sent."""
    recipients = db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == message.conversation_id,
            ConversationParticipant.user_id != message.sender_id,
        )
    ).scalars().all()
    if not recipients:
        return "sent"

    created = _as_utc(message.created_at)
    delivered = all(
        (stamp := _as_utc(participant.last_delivered_at)) is not None and stamp >= created
        for participant in recipients
    )
    read = all(
        (stamp := _as_utc(participant.last_read_at)) is not None and stamp >= created
        for participant in recipients
    )
    if read:
        return "read"
    if delivered:
        return "delivered"
    return "sent"


_DELIVERY_RANK = {"sent": 0, "delivered": 1, "read": 2}


def _receipt_status(db: Session, message: ChatMessage) -> str:
    """Receipt state is a high-water mark.

    Compute what the participant stamps say right now, then keep the highest
    value ever stored on the message. That way editing, editing reactions or a
    participant joining later can never push the ticks backwards.
    """
    stored = message.delivery_status or "sent"
    computed = _delivery_status(db, message)
    if _DELIVERY_RANK[computed] > _DELIVERY_RANK[stored]:
        message.delivery_status = computed
        # Persist immediately: callers may only read (GET) and never commit.
        db.commit()
        return computed
    return stored


def _message_reactions(db: Session, message: ChatMessage) -> list[MessageReactionOut]:
    rows = db.execute(
        select(MessageReaction)
        .where(MessageReaction.message_id == message.id)
        .order_by(MessageReaction.created_at)
    ).scalars().all()
    result: list[MessageReactionOut] = []
    for row in rows:
        user = db.get(User, row.user_id)
        result.append(
            MessageReactionOut(
                emoji=row.emoji,
                user_id=row.user_id,
                user_name=(user.name or user.phone) if user else "Former user",
            )
        )
    return result


def _message_out(db: Session, message: ChatMessage) -> MessageOut:
    sender = db.get(User, message.sender_id)
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        sender_name=(sender.name or sender.phone) if sender else "Former user",
        body=message.body,
        created_at=message.created_at,
        edited_at=message.edited_at,
        delivery_status=_receipt_status(db, message),
        reactions=_message_reactions(db, message),
    )


class ChatConnections:
    def __init__(self) -> None:
        self._clients: dict[uuid.UUID, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, conversation_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept(subprotocol="bearer")
        async with self._lock:
            self._clients.setdefault(conversation_id, set()).add(websocket)

    async def disconnect(self, conversation_id: uuid.UUID, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._clients.get(conversation_id)
            if clients is not None:
                clients.discard(websocket)
                if not clients:
                    self._clients.pop(conversation_id, None)

    async def broadcast(self, conversation_id: uuid.UUID, payload: dict) -> None:
        async with self._lock:
            clients = tuple(self._clients.get(conversation_id, ()))
        stale: list[WebSocket] = []
        for websocket in clients:
            try:
                await websocket.send_json(payload)
            except (WebSocketDisconnect, RuntimeError):
                stale.append(websocket)
        for websocket in stale:
            await self.disconnect(conversation_id, websocket)


chat_connections = ChatConnections()


def _can_post(conversation: Conversation, auth: AuthContext) -> bool:
    return (
        conversation.type != ConversationType.announcement
        or auth.role in (Role.owner, Role.manager)
    )


@router.get("/conversations", response_model=ConversationsOut)
def list_conversations(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    if auth.role == Role.tenant:
        _, tenant_property = current_tenant_property(db, auth.org_id, auth.user)
        if property_id is not None and property_id != tenant_property.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
        properties = [tenant_property]
    elif auth.role in (Role.owner, Role.manager):
        stmt = select(Property).where(Property.organization_id == auth.org_id)
        if property_id is not None:
            properties = [property_for_staff(db, auth.org_id, property_id)]
        else:
            properties = db.execute(stmt.order_by(Property.name)).scalars().all()
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chat access required")

    for prop in properties:
        ensure_property_conversations(db, prop)
    db.commit()

    conversation_rows = db.execute(
        select(Conversation)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .where(
            ConversationParticipant.user_id == auth.user.id,
            or_(
                Conversation.property_id.in_([prop.id for prop in properties]),
                and_(
                    Conversation.property_id.is_(None),
                    Conversation.type == ConversationType.announcement,
                ),
            ),
            # Hide legacy per-property announcement chats (pre org-wide ones).
            or_(
                Conversation.type != ConversationType.announcement,
                Conversation.property_id.is_(None),
            ),
        )
    ).scalars().all()

    if auth.role != Role.tenant:
        # Staff only see direct chats once at least one message exists
        # (admin-initiated contact; they can still open a tenant profile to start one).
        empty_direct_ids = {
            row[0]
            for row in db.execute(
                select(Conversation.id)
                .outerjoin(ChatMessage, ChatMessage.conversation_id == Conversation.id)
                .where(
                    Conversation.property_id.in_([prop.id for prop in properties]),
                    Conversation.type == ConversationType.direct,
                )
                .group_by(Conversation.id)
                .having(func.count(ChatMessage.id) == 0)
            ).all()
        }
        if empty_direct_ids:
            conversation_rows = [
                conversation for conversation in conversation_rows
                if conversation.id not in empty_direct_ids
            ]

    result: list[ConversationOut] = []
    for conversation in conversation_rows:
        participant = db.get(ConversationParticipant, (conversation.id, auth.user.id))
        latest = db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conversation.id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        unread_stmt = select(func.count(ChatMessage.id)).where(
            ChatMessage.conversation_id == conversation.id,
            ChatMessage.sender_id != auth.user.id,
        )
        if participant.last_read_at is not None:
            unread_stmt = unread_stmt.where(ChatMessage.created_at > participant.last_read_at)
        unread_count = db.execute(unread_stmt).scalar_one()
        other_user_id = None
        if conversation.type == ConversationType.direct:
            other_user_id = db.execute(
                select(ConversationParticipant.user_id).where(
                    ConversationParticipant.conversation_id == conversation.id,
                    ConversationParticipant.user_id != auth.user.id,
                )
            ).scalar_one_or_none()
        other_user = db.get(User, other_user_id) if other_user_id else None
        prop = db.get(Property, conversation.property_id) if conversation.property_id else None
        if conversation.type == ConversationType.announcement:
            channel_title = "Announcements"
        elif conversation.type == ConversationType.group:
            channel_title = f"{prop.name} chat" if prop else "Chat"
        else:
            channel_title = other_user.name or other_user.phone if other_user else "Personal chat"
        result.append(
            ConversationOut(
                id=conversation.id,
                property_id=conversation.property_id,
                property_name=prop.name if prop else "",
                type=conversation.type,
                title=channel_title,
                other_user_id=other_user_id,
                last_message=latest.body if latest else None,
                last_message_at=latest.created_at if latest else None,
                unread_count=unread_count,
            )
        )
    result.sort(
        key=lambda item: (
            0 if item.type == ConversationType.announcement else 1 if item.type == ConversationType.group else 2,
            item.property_name.casefold(),
            item.title.casefold(),
        )
    )

    contacts: list[ConversationContactOut] = []
    for prop in properties:
        staff_rows = db.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.organization_id == auth.org_id,
                Membership.role.in_((Role.owner, Role.manager)),
                User.id != auth.user.id,
            )
        ).all()
        for user, role in staff_rows:
            contacts.append(
                ConversationContactOut(
                    user_id=user.id,
                    name=user.name or user.phone,
                    role=role,
                    phone=user.phone,
                    room_number=None,
                    property_id=prop.id,
                    property_name=prop.name,
                )
            )
        if auth.role != Role.tenant:
            tenant_rows = db.execute(
                select(User, Tenant.full_name, User.phone, Room.number)
                .join(Tenant, Tenant.phone == User.phone)
                .join(Stay, Stay.tenant_id == Tenant.id)
                .join(Bed, Bed.id == Stay.bed_id)
                .join(Room, Room.id == Bed.room_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(
                    Tenant.organization_id == auth.org_id,
                    Floor.property_id == prop.id,
                    Stay.active.is_(True),
                    User.id != auth.user.id,
                )
            ).all()
            for user, full_name, phone, room_number in tenant_rows:
                contacts.append(
                    ConversationContactOut(
                        user_id=user.id,
                        name=full_name,
                        role=Role.tenant,
                        phone=phone,
                        room_number=room_number,
                        property_id=prop.id,
                        property_name=prop.name,
                    )
                )
    return ConversationsOut(conversations=result, contacts=contacts, me_id=auth.user.id)


@router.post("/conversations/direct", response_model=ConversationOut)
def open_direct_conversation(
    body: DirectConversationIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    if body.other_user_id == auth.user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot start a conversation with yourself")
    if auth.role == Role.tenant:
        _, prop = current_tenant_property(db, auth.org_id, auth.user)
        if body.property_id is not None and body.property_id != prop.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Property not found")
    elif auth.role in (Role.owner, Role.manager):
        if body.property_id is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "property_id is required for staff")
        prop = property_for_staff(db, auth.org_id, body.property_id)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Chat access required")

    target = db.get(User, body.other_user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    is_staff = db.execute(
        select(Membership.id).where(
            Membership.user_id == target.id,
            Membership.organization_id == auth.org_id,
            Membership.role.in_((Role.owner, Role.manager)),
        )
    ).scalar_one_or_none() is not None
    target_property_ids = set(
        db.execute(
            select(Floor.property_id)
            .join(Room, Room.floor_id == Floor.id)
            .join(Bed, Bed.room_id == Room.id)
            .join(Stay, Stay.bed_id == Bed.id)
            .join(Tenant, Tenant.id == Stay.tenant_id)
            .where(
                Tenant.organization_id == auth.org_id,
                Tenant.phone == target.phone,
                Stay.active.is_(True),
            )
        ).scalars()
    )
    if prop.id not in target_property_ids and not is_staff:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User is not a member of this property")
    if is_staff:
        ensure_property_conversations(db, prop)
    conversation = ensure_direct_conversation(
        db, auth.org_id, prop, auth.user.id, target.id
    )
    db.commit()
    db.refresh(conversation)
    latest = db.execute(
        select(ChatMessage)
        .where(ChatMessage.conversation_id == conversation.id)
        .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
        .limit(1)
    ).scalar_one_or_none()
    participant = db.get(ConversationParticipant, (conversation.id, auth.user.id))
    unread_stmt = select(func.count(ChatMessage.id)).where(
        ChatMessage.conversation_id == conversation.id,
        ChatMessage.sender_id != auth.user.id,
    )
    if participant.last_read_at is not None:
        unread_stmt = unread_stmt.where(ChatMessage.created_at > participant.last_read_at)
    return ConversationOut(
        id=conversation.id,
        property_id=prop.id,
        property_name=prop.name,
        type=ConversationType.direct,
        title=target.name or target.phone,
        other_user_id=target.id,
        last_message=latest.body if latest else None,
        last_message_at=latest.created_at if latest else None,
        unread_count=db.execute(unread_stmt).scalar_one(),
    )


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
def list_messages(
    conversation_id: uuid.UUID,
    cursor: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    conversation = require_conversation_participant(db, conversation_id, auth.user.id)
    if conversation.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    stmt = select(ChatMessage).where(ChatMessage.conversation_id == conversation.id)
    if cursor is not None:
        cursor_message = db.get(ChatMessage, cursor)
        if cursor_message is None or cursor_message.conversation_id != conversation.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid message cursor")
        stmt = stmt.where(
            or_(
                ChatMessage.created_at < cursor_message.created_at,
                and_(
                    ChatMessage.created_at == cursor_message.created_at,
                    ChatMessage.id < cursor_message.id,
                ),
            )
        )
    rows = db.execute(
        stmt.order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc()).limit(31)
    ).scalars().all()
    page = rows[:30]
    participant = db.get(ConversationParticipant, (conversation.id, auth.user.id))
    participant.last_delivered_at = func.now()
    participant.last_read_at = func.now()
    db.commit()
    return MessagePage(
        messages=[_message_out(db, message) for message in reversed(page)],
        next_cursor=page[-1].id if len(rows) > 30 and page else None,
    )


async def _save_message(
    db: Session, conversation: Conversation, auth: AuthContext, body: MessageIn
) -> MessageOut:
    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message cannot be empty")
    if not _can_post(conversation, auth):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only staff can post announcements")
    message = ChatMessage(
        conversation_id=conversation.id,
        sender_id=auth.user.id,
        body=text,
    )
    participant = db.get(ConversationParticipant, (conversation.id, auth.user.id))
    participant.last_delivered_at = func.now()
    participant.last_read_at = func.now()
    db.add(message)
    db.commit()
    db.refresh(message)
    return _message_out(db, message)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
async def create_message(
    conversation_id: uuid.UUID,
    body: MessageIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    conversation = require_conversation_participant(db, conversation_id, auth.user.id)
    if conversation.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    message = await _save_message(db, conversation, auth, body)
    await chat_connections.broadcast(
        conversation.id, {"type": "message", "message": message.model_dump(mode="json")}
    )
    return message


@router.patch(
    "/conversations/{conversation_id}/messages/{message_id}", response_model=MessageOut
)
async def edit_message(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: MessageEditIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    conversation = require_conversation_participant(db, conversation_id, auth.user.id)
    if conversation.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    message = db.get(ChatMessage, message_id)
    if message is None or message.conversation_id != conversation.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    if message.sender_id != auth.user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only edit your own messages")

    created = _as_utc(message.created_at)
    if created is not None and datetime.now(timezone.utc) - created > timedelta(hours=1):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Messages can only be edited within 1 hour of sending",
        )

    text = body.body.strip()
    if not text:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message cannot be empty")
    message.body = text
    message.edited_at = func.now()
    db.commit()
    db.refresh(message)

    out = _message_out(db, message)
    logger.debug(
        "edited message %s delivery_status=%s created_at=%s",
        message.id,
        out.delivery_status,
        message.created_at,
    )
    await chat_connections.broadcast(
        conversation.id, {"type": "message_updated", "message": out.model_dump(mode="json")}
    )
    return out


@router.put(
    "/conversations/{conversation_id}/messages/{message_id}/reaction",
    response_model=MessageOut,
)
async def set_message_reaction(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    body: MessageReactionIn,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    conversation = require_conversation_participant(db, conversation_id, auth.user.id)
    if conversation.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    message = db.get(ChatMessage, message_id)
    if message is None or message.conversation_id != conversation.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

    emoji = body.emoji.strip()
    if not emoji:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Reaction cannot be empty")
    reaction = db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message.id,
            MessageReaction.user_id == auth.user.id,
        )
    ).scalar_one_or_none()
    if reaction is None:
        db.add(
            MessageReaction(
                message_id=message.id,
                user_id=auth.user.id,
                emoji=emoji,
            )
        )
    else:
        reaction.emoji = emoji
    db.commit()

    out = _message_out(db, message)
    await chat_connections.broadcast(
        conversation.id, {"type": "message_updated", "message": out.model_dump(mode="json")}
    )
    return out


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}/reaction",
    response_model=MessageOut,
)
async def remove_message_reaction(
    conversation_id: uuid.UUID,
    message_id: uuid.UUID,
    auth: AuthContext = Depends(require_org),
    db: Session = Depends(get_db),
):
    conversation = require_conversation_participant(db, conversation_id, auth.user.id)
    if conversation.organization_id != auth.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    message = db.get(ChatMessage, message_id)
    if message is None or message.conversation_id != conversation.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

    reaction = db.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message.id,
            MessageReaction.user_id == auth.user.id,
        )
    ).scalar_one_or_none()
    if reaction is not None:
        db.delete(reaction)
        db.commit()

    out = _message_out(db, message)
    await chat_connections.broadcast(
        conversation.id, {"type": "message_updated", "message": out.model_dump(mode="json")}
    )
    return out


@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    offered = [
        item.strip()
        for item in websocket.headers.get("sec-websocket-protocol", "").split(",")
        if item.strip()
    ]
    if len(offered) != 2 or offered[0] != "bearer":
        await websocket.close(code=4401)
        return
    try:
        claims = decode_access_token(offered[1])
        user_id = uuid.UUID(claims["sub"])
        organization_id = uuid.UUID(claims["org"]) if claims.get("org") else None
        role = Role(claims["role"]) if claims.get("role") else None
    except (HTTPException, KeyError, ValueError):
        await websocket.close(code=4401)
        return
    try:
        conversation_id = uuid.UUID(websocket.query_params.get("conversation_id", ""))
    except ValueError:
        await websocket.close(code=4400)
        return

    db: Session = SessionLocal()
    try:
        conversation = db.get(Conversation, conversation_id)
        user = db.get(User, user_id)
        participant = db.get(ConversationParticipant, (conversation_id, user_id))
        if (
            conversation is None
            or user is None
            or participant is None
            or conversation.organization_id != organization_id
        ):
            await websocket.close(code=4403)
            return
        await chat_connections.connect(conversation_id, websocket)
        participant.last_delivered_at = func.now()
        participant.last_read_at = func.now()
        db.commit()
        while True:
            try:
                raw = await websocket.receive_json()
                if isinstance(raw, dict) and raw.get("type") == "read":
                    participant.last_delivered_at = func.now()
                    participant.last_read_at = func.now()
                    db.commit()
                    await chat_connections.broadcast(
                        conversation_id,
                        {
                            "type": "read",
                            "user_id": str(user_id),
                            "read_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
                    continue
                body = MessageIn.model_validate(raw)
            except (ValueError, ValidationError):
                await websocket.send_json({"error": "Message must contain a body up to 2000 characters"})
                continue
            auth = AuthContext(user=user, org_id=organization_id, role=role)
            if not _can_post(conversation, auth):
                await websocket.send_json({"error": "Only staff can post announcements"})
                continue
            message = ChatMessage(
                conversation_id=conversation.id,
                sender_id=user.id,
                body=body.body.strip(),
            )
            if not message.body:
                await websocket.send_json({"error": "Message cannot be empty"})
                continue
            participant.last_delivered_at = func.now()
            participant.last_read_at = func.now()
            db.add(message)
            db.commit()
            db.refresh(message)
            out = _message_out(db, message)
            await chat_connections.broadcast(
                conversation.id, {"type": "message", "message": out.model_dump(mode="json")}
            )
    except WebSocketDisconnect:
        pass
    finally:
        await chat_connections.disconnect(conversation_id, websocket)
        db.close()
