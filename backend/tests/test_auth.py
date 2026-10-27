import os

from tests.conftest import auth_header, request_and_login


def test_health(api):
    r = api.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_otp_verify_wrong_code_rejected(api):
    api.post("/auth/otp/request", json={"phone": "9876543210"})
    r = api.post("/auth/otp/verify", json={"phone": "9876543210", "code": "000000"})
    assert r.status_code == 401


def test_login_creates_user_and_bootstraps_org(api):
    data = request_and_login(api, "9876543210", name="Asha", org_name="Asha PGs")
    assert data["access_token"]
    assert len(data["organizations"]) == 1
    assert data["organizations"][0]["name"] == "Asha PGs"
    assert data["organizations"][0]["role"] == "owner"


def test_otp_is_single_use(api):
    r = api.post("/auth/otp/request", json={"phone": "9876543211"})
    code = r.json()["otp"]
    r1 = api.post("/auth/otp/verify", json={"phone": "9876543211", "code": code})
    assert r1.status_code == 200
    r2 = api.post("/auth/otp/verify", json={"phone": "9876543211", "code": code})
    assert r2.status_code == 401


def test_requires_auth(api):
    r = api.get("/properties")
    assert r.status_code == 401
