import os
import tempfile
from pathlib import Path

# Test environment must be set before app modules import settings
os.environ.setdefault("OTP_DEV_MODE", "true")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("UPLOAD_DIR", str(Path(tempfile.gettempdir()) / "pgms_test_uploads"))

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import Base, engine
from app.main import app


def fresh_engine(url: str):
    eng = create_engine(url, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture()
def api(tmp_path, monkeypatch):
    """TestClient bound to a fresh file DB and isolated upload dir."""
    from app.core.db import get_db

    url = f"sqlite+pysqlite:///{tmp_path / 'test.db'}"
    eng = fresh_engine(url)
    TestSession = sessionmaker(bind=eng, autoflush=False, expire_on_commit=False)

    def override_db():
        s = TestSession()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def request_and_login(client: TestClient, phone: str, name: str = "Owner", org_name: str | None = None):
    r = client.post("/auth/otp/request", json={"phone": phone})
    assert r.status_code == 200, r.text
    code = r.json()["otp"]
    r = client.post("/auth/otp/verify", json={"phone": phone, "code": code, "name": name, "org_name": org_name})
    assert r.status_code == 200, r.text
    return r.json()


def auth_header(token: str):
    return {"Authorization": f"Bearer {token}"}
