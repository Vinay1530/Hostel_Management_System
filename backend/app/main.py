from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.api import auth, billing, my, properties, tenants

settings = get_settings()

app = FastAPI(
    title="PG Management SaaS API",
    version="0.1.0",
    description="Operator software for PG hostels: properties, tenants, rent, payments.",
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
app.include_router(tenants.router)
app.include_router(billing.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "version": app.version}
