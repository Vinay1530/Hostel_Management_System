import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import AuthContext, require_staff
from app.models.enums import InvoiceStatus
from app.models.models import (
    AnalyticsData,
    RentInvoice,
    Payment,
    Stay,
    Bed,
    Room,
    Floor,
    Property,
    Tenant,
)
from app.schemas.schemas import AnalyticsDataIn, AnalyticsDataOut

router = APIRouter(tags=["analytics"])


@router.post("/analytics", response_model=AnalyticsDataOut, status_code=201)
def create_analytics_data(
    body: AnalyticsDataIn,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    data = AnalyticsData(
        organization_id=auth.org_id,
        metric_type=body.metric_type,
        metric_value=body.metric_value,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(data)
    db.commit()
    db.refresh(data)
    return data


@router.get("/analytics", response_model=list[AnalyticsDataOut])
def list_analytics_data(
    metric_type: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(AnalyticsData).where(AnalyticsData.organization_id == auth.org_id)

    if metric_type:
        stmt = stmt.where(AnalyticsData.metric_type == metric_type)
    if start_date:
        stmt = stmt.where(AnalyticsData.start_date >= start_date)
    if end_date:
        stmt = stmt.where(AnalyticsData.end_date <= end_date)

    stmt = stmt.order_by(AnalyticsData.created_at.desc())

    rows = db.execute(stmt).scalars().all()
    return rows


@router.get("/analytics/occupancy-rate")
def occupancy_rate(
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    from app.models.models import Property

    props = db.execute(
        select(Property).where(Property.organization_id == auth.org_id)
    ).scalars().all()

    results = []
    for prop in props:
        total_beds = db.execute(
            select(func.count(Bed.id))
            .join(Room, Room.id == Bed.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .where(Floor.property_id == prop.id)
        ).scalar()

        occupied = db.execute(
            select(func.count(Bed.id))
            .join(Room, Room.id == Bed.room_id)
            .join(Floor, Floor.id == Room.floor_id)
            .join(Stay, Stay.bed_id == Bed.id)
            .where(
                Floor.property_id == prop.id,
                Stay.active.is_(True),
            )
        ).scalar()

        results.append({
            "property_id": prop.id,
            "property_name": prop.name,
            "total_beds": total_beds or 0,
            "occupied_beds": occupied or 0,
            "occupancy_rate": round((occupied or 0) / (total_beds or 1) * 100, 2),
        })

    return results


@router.get("/analytics/income-expenses")
def income_expenses(
    start_date: date | None = None,
    end_date: date | None = None,
    property_id: uuid.UUID | None = None,
    auth: AuthContext = Depends(require_staff),
    db: Session = Depends(get_db),
):
    stmt = select(RentInvoice).where(
        RentInvoice.organization_id == auth.org_id,
        RentInvoice.status != InvoiceStatus.void,
    )

    if start_date:
        stmt = stmt.where(RentInvoice.period_start >= start_date)
    if end_date:
        stmt = stmt.where(RentInvoice.period_end <= end_date)
    if property_id:
        stmt = stmt.where(
            RentInvoice.stay_id.in_(
                select(Stay.id)
                .join(Bed, Bed.id == Stay.bed_id)
                .join(Room, Room.id == Bed.room_id)
                .join(Floor, Floor.id == Room.floor_id)
                .where(Floor.property_id == property_id)
            )
        )

    invoices = db.execute(stmt).unique().scalars().all()

    billed = sum(inv.amount_paise for inv in invoices)
    collected = sum(sum(p.amount_paise for p in inv.payments) for inv in invoices)
    outstanding = billed - collected

    return {
        "billed_paise": billed,
        "collected_paise": collected,
        "outstanding_paise": outstanding,
        "invoice_count": len(invoices),
    }