import asyncio
import contextlib
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.api import auth, billing, collaboration, feedback, my, notifications, properties, public, requests, search, security_deposit, tenants, tenants_profiles, analytics, invoice_templates, payment_reminders, occupancy

settings = get_settings()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    """In-process automation loop: monthly invoicing, late fees, complaint escalation."""
    import logging

    logger = logging.getLogger("hms.automation")
    stop = asyncio.Event()
    loop_task = None

    async def automation_loop():
        from app.services.automation import run_daily_automation

        while not stop.is_set():
            try:
                with SessionLocal() as db:
                    now = datetime.now()
                    month = f"{now.year}-{now.month:02d}"
                    report = run_daily_automation(
                        db,
                        month=month,
                        late_fee_paise=settings.late_fee_charge_paise,
                        escalation_hours=settings.complaint_escalation_hours,
                    )
                    logger.info("Automation report: %s", report)
            except Exception:
                logger.exception("Automation pass failed")
            try:
                await asyncio.wait_for(stop.wait(), timeout=settings.automation_interval_seconds)
            except asyncio.TimeoutError:
                continue

    loop_task = asyncio.create_task(automation_loop())
    try:
        yield
    finally:
        stop.set()
        if loop_task:
            with contextlib.suppress(asyncio.CancelledError):
                await asyncio.wait_for(loop_task, timeout=5)


app = FastAPI(
    title="PG Management SaaS API",
    version="0.1.0",
    description="Operator software for PG hostels: properties, tenants, rent, payments.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,  # bearer-token auth (no cookies); '*' origins + credentials is invalid
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(my.router)
app.include_router(properties.router)
app.include_router(search.router)
app.include_router(tenants.router)
app.include_router(billing.router)
app.include_router(collaboration.router)
app.include_router(requests.router)
app.include_router(notifications.router)
app.include_router(public.router)
app.include_router(feedback.router)
app.include_router(security_deposit.router)
app.include_router(tenants_profiles.router)
app.include_router(analytics.router)
app.include_router(invoice_templates.router)
app.include_router(payment_reminders.router)
app.include_router(occupancy.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "version": app.version}
