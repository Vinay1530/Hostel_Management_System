from celery import Celery
from celery.schedules import crontab

from app.core.config import get_settings

celery = Celery("pgms", broker=get_settings().redis_url, backend=get_settings().redis_url)
celery.conf.beat_schedule = {
    # Monthly rent generation: 1st of every month, 00:30 IST
    "generate-rent-invoices": {
        "task": "app.workers.tasks.generate_rent_invoices",
        # Runs for all orgs; per-org stragglers can retry via the API endpoint
        "schedule": crontab(minute=30, hour=0, day_of_month=1, month_of_year="*"),
    },
}


@celery.task(name="app.workers.tasks.generate_rent_invoices")
def generate_rent_invoices(org_ids: list[str] | None = None, month: str | None = None):
    """Generate rent invoices for a given month. Idempotent per (stay, month).

    Pass month='YYYY-MM' to backfill; defaults to the current month.
   month arg is the *billing* month (arrears mode) or upcoming month (advance mode).
    """
    from datetime import date

    from app.core.db import SessionLocal
    from app.models.models import Organization
    from app.services.billing import generate_invoices

    if month is None:
        today = date.today()
        month = f"{today.year}-{today.month:02d}"

    results = []
    db = SessionLocal()
    try:
        if org_ids:
            orgs = db.query(Organization).filter(Organization.id.in_(org_ids)).all()
        else:
            orgs = db.query(Organization).all()
        for org in orgs:
            created = generate_invoices(db, org.id, month)
            results.append({"org": str(org.id), "month": month, "invoices_created": len(created)})
    finally:
        db.close()
    return results
