import hashlib
import os
import random
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models.enums import Role
from app.models.models import Membership, OtpToken, Organization, User

bearer = HTTPBearer(auto_error=False)

DEFAULT_TENANT_PASSWORD = "password"  # dev default for newly created tenant accounts


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    iterations = 100_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), iterations).hex()
    return f"pbkdf2_hmac_sha256:{iterations}:{salt}:{digest}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or ":" not in stored:
        return False
    _, iterations, salt, digest = stored.split(":", 3)
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), int(iterations)).hex()
    return secrets.compare_digest(candidate, digest)


def ensure_login_user(db: Session, phone: str, password: str | None, org_id: uuid.UUID, role: Role, name: str | None = None, email: str | None = None) -> User:
    """Get-or-create a login account for a phone in an org with default password."""
    user = db.execute(select(User).where(User.phone == phone)).scalar_one_or_none()
    if not user:
        user = User(phone=phone, name=name, email=email)
        user.password_hash = hash_password(password or DEFAULT_TENANT_PASSWORD)
        db.add(user)
        db.flush()
    else:
        if name and not user.name:
            user.name = name
        if email and not user.email:
            user.email = email
    exists = db.execute(
        select(Membership).where(Membership.user_id == user.id, Membership.organization_id == org_id)
    ).scalar_one_or_none()
    if not exists:
        db.add(Membership(user_id=user.id, organization_id=org_id, role=role))
    return user


def _now() -> datetime:
    return datetime.now(timezone.utc)


def generate_otp() -> str:
    return f"{random.randint(100000, 999999)}"


def issue_otp(db: Session, phone: str) -> str:
    code = generate_otp()
    token = OtpToken(
        phone=phone,
        code=code,
        expires_at=_now() + timedelta(minutes=get_settings().otp_ttl_minutes),
    )
    db.add(token)
    db.commit()
    return code


def verify_otp(db: Session, phone: str, code: str) -> bool:
    token = db.execute(
        select(OtpToken)
        .where(OtpToken.phone == phone, OtpToken.consumed.is_(False))
        .order_by(OtpToken.created_at.desc())
    ).scalars().first()
    if not token:
        return False
    # Normalize naive/aware datetimes across sqlite (naive) and PG (aware)
    now = _now() if token.expires_at.tzinfo is not None else _now().replace(tzinfo=None)
    if token.expires_at < now or token.code != code:
        return False
    token.consumed = True
    db.commit()
    return True


def create_access_token(user: User, organization_id: uuid.UUID | None, role: str | None) -> str:
    settings = get_settings()
    payload = {
        "sub": str(user.id),
        "phone": user.phone,
        "name": user.name,
        "org": str(organization_id) if organization_id else None,
        "role": role,
        "iat": int(_now().timestamp()),
        "exp": int((_now() + timedelta(minutes=settings.jwt_ttl_minutes)).timestamp()),
    }
    return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    settings = get_settings()
    try:
        return pyjwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return user


class AuthContext:
    """Authenticated user plus their active organization (and role in it)."""

    def __init__(self, user: User, org_id: uuid.UUID | None, role: Role | None):
        self.user = user
        self.org_id = org_id
        self.role = role


def get_auth_context(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> AuthContext:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, uuid.UUID(payload["sub"]))
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    org_id = uuid.UUID(payload["org"]) if payload.get("org") else None
    role = Role(payload["role"]) if payload.get("role") else None
    return AuthContext(user=user, org_id=org_id, role=role)


def require_org(auth: AuthContext = Depends(get_auth_context)) -> AuthContext:
    if not auth.org_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active organization. Log in again selecting an org.")
    return auth


def require_staff(auth: AuthContext = Depends(require_org)) -> AuthContext:
    if auth.role not in (Role.owner, Role.manager):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner or manager access required")
    return auth


def require_owner(auth: AuthContext = Depends(require_org)) -> AuthContext:
    if auth.role != Role.owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return auth


def ensure_membership_role(auth: AuthContext, organization_id: uuid.UUID, db: Session) -> Membership:
    """For org switching: validate the user actually belongs to the org."""
    membership = db.execute(
        select(Membership).where(Membership.user_id == auth.user.id, Membership.organization_id == organization_id)
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member of this organization")
    return membership


def get_or_create_org(db: Session, name: str = "My PG", phone: str | None = None) -> Organization:
    org = Organization(name=name, contact_phone=phone)
    db.add(org)
    db.commit()
    return org
