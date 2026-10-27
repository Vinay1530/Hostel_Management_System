from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import (
    create_access_token,
    ensure_membership_role,
    get_auth_context,
    get_or_create_org,
    issue_otp,
    hash_password,
    verify_otp,
    verify_password,
)
from app.models.enums import Role
from app.models.models import Membership, Organization, User
from app.schemas.schemas import AuthOut, OrganizationOut, OtpRequest, OtpVerify, SwitchOrg

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_out(db: Session, user: User, membership: Membership) -> AuthOut:
    token = create_access_token(user, membership.organization_id, membership.role)
    orgs = [
        OrganizationOut(id=m.organization_id, name=db.get(Organization, m.organization_id).name, role=m.role)
        for m in db.execute(select(Membership).where(Membership.user_id == user.id)).scalars().all()
    ]
    return AuthOut(access_token=token, organizations=orgs)


class RegisterIn(BaseModel):
    name: str
    phone: str = Field(pattern=r"^\d{10,15}$")
    email: EmailStr | None = None
    password: str = Field(min_length=6, max_length=100)
    org_name: str = Field(min_length=1, max_length=200)


class LoginIn(BaseModel):
    phone: str = Field(pattern=r"^\d{10,15}$")
    password: str


@router.post("/register", response_model=AuthOut, status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    """PG manager self-registration: creates the user, their organization, owner role."""
    existing = db.execute(select(User).where(User.phone == body.phone)).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "This phone is already registered. Please log in.")
    user = User(phone=body.phone, name=body.name, email=body.email)
    user.password_hash = hash_password(body.password)
    org = get_or_create_org(db, name=body.org_name, phone=body.phone)
    db.add(user)
    db.flush()
    membership = Membership(user_id=user.id, organization_id=org.id, role=Role.owner)
    db.add(membership)
    db.commit()
    return _auth_out(db, user, membership)


@router.post("/login", response_model=AuthOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    """Phone + password login (default password for tenants created by the manager: 'password')."""
    user = db.execute(select(User).where(User.phone == body.phone)).scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong phone number or password")
    membership = db.execute(
        select(Membership).where(Membership.user_id == user.id).order_by(Membership.role)
    ).scalars().first()
    if not membership:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No organization membership yet. Contact your PG manager.")
    return _auth_out(db, user, membership)


@router.post("/otp/request")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    code = issue_otp(db, body.phone)
    # SMS gateway integration comes later (weeks 9-10). Dev mode returns the code.
    return {"phone": body.phone, "otp": code}


@router.post("/otp/verify", response_model=AuthOut)
def verify(body: OtpVerify, db: Session = Depends(get_db)):
    if not verify_otp(db, body.phone, body.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired OTP")

    user = db.execute(select(User).where(User.phone == body.phone)).scalar_one_or_none()
    if not user:
        user = User(phone=body.phone, name=body.name)
        db.add(user)
        db.commit()
    elif body.name:
        user.name = body.name
        db.commit()

    memberships = db.execute(
        select(Membership).where(Membership.user_id == user.id)
    ).scalars().all()

    # First device ever for this user: bootstrap their own organization (owner)
    if not memberships:
        org = get_or_create_org(db, name=body.org_name or "My PG", phone=user.phone)
        membership = Membership(user_id=user.id, organization_id=org.id, role=Role.owner)
        db.add(membership)
        db.commit()
        memberships = [membership]

    first = memberships[0]
    token = create_access_token(user, first.organization_id, first.role)
    orgs = [
        OrganizationOut(
            id=m.organization_id,
            name=db.get(Organization, m.organization_id).name,
            role=m.role,
        )
        for m in memberships
    ]
    return AuthOut(access_token=token, organizations=orgs)


@router.get("/organizations", response_model=list[OrganizationOut])
def my_organizations(auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    memberships = db.execute(
        select(Membership).where(Membership.user_id == auth.user.id)
    ).scalars().all()
    return [
        OrganizationOut(id=m.organization_id, name=db.get(Organization, m.organization_id).name, role=m.role)
        for m in memberships
    ]


@router.post("/organizations/switch", response_model=AuthOut)
def switch_org(body: SwitchOrg, auth=Depends(get_auth_context), db: Session = Depends(get_db)):
    membership = ensure_membership_role(auth, body.organization_id, db)
    token = create_access_token(auth.user, membership.organization_id, membership.role)
    orgs = db.execute(
        select(Membership).where(Membership.user_id == auth.user.id)
    ).scalars().all()
    return AuthOut(
        access_token=token,
        organizations=[
            OrganizationOut(id=m.organization_id, name=db.get(Organization, m.organization_id).name, role=m.role)
            for m in orgs
        ],
    )
