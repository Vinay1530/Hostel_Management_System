import io

from tests.conftest import auth_header, request_and_login
from tests.test_properties import make_world

CSV_SAMPLE = (
    "full_name,phone,property_name,floor_name,room_number,bed_label,start_date,agreed_rent_paise,deposit_paise,emergency_contact_name,emergency_contact_phone,id_number\n"
    "Ravi Kumar,9111111111,Sunshine PG,Ground,101,A,2026-10-01,700000,1500000,Sita,9222222222,AD1234\n"
    "Meena Iyer,9122222222,Sunshine PG,Ground,101,B,2026-10-15,700000,1500000,,,,\n"
    "Bad Row,,,,,,not-a-date,,,,\n"  # invalid date -> rejected
    "Ghost Tenant,9133333333,Nowhere PG,Ground,101,A,2026-10-01,700000,0,,,,"  # unknown bed -> rejected
)


def create_tenant(api, h, name="Ravi Kumar", phone="9111111111"):
    r = api.post("/tenants", headers=h, json={"full_name": name, "phone": phone})
    assert r.status_code == 201, r.text
    return r.json()


def assign_stay(api, h, tenant_id, bed_id, start="2026-10-01", rent=700000):
    r = api.post("/stays", headers=h, json={"tenant_id": tenant_id, "bed_id": bed_id, "start_date": start, "agreed_rent_paise": rent, "deposit_paise": 1500000})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_tenant_and_stay(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)

    tenant = create_tenant(api, h)
    assert tenant["stays"] == []

    stay = assign_stay(api, h, tenant["id"], ids["beds"][0]["id"])
    assert stay["active"] is True

    # bed now shows occupied in grid
    grid = api.get("/occupancy-grid", headers=h).json()
    bed_a = grid["properties"][0]["floors"][0]["rooms"][0]["beds"][0]
    assert bed_a["status"] == "occupied"
    assert bed_a["tenant_name"] == "Ravi Kumar"
    assert grid["totals"]["occupied"] == 1


def test_double_occupancy_blocked(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    t1 = create_tenant(api, h)
    t2 = create_tenant(api, h, name="Meena", phone="9122222222")
    assign_stay(api, h, t1["id"], ids["beds"][0]["id"])

    r = api.post("/stays", headers=h, json={"tenant_id": t2["id"], "bed_id": ids["beds"][0]["id"], "start_date": "2026-10-20", "agreed_rent_paise": 700000})
    assert r.status_code == 409
    assert "already occupied" in r.json()["detail"]


def test_tenant_cannot_take_two_beds(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    t = create_tenant(api, h)
    assign_stay(api, h, t["id"], ids["beds"][0]["id"])
    r = api.post("/stays", headers=h, json={"tenant_id": t["id"], "bed_id": ids["beds"][1]["id"], "start_date": "2026-10-20", "agreed_rent_paise": 700000})
    assert r.status_code == 409


def test_end_stay_frees_bed(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    t = create_tenant(api, h)
    stay = assign_stay(api, h, t["id"], ids["beds"][0]["id"])

    r = api.post(f"/stays/{stay['id']}/end", headers=h)
    assert r.status_code == 200
    assert r.json()["active"] is False

    grid = api.get("/occupancy-grid", headers=h).json()
    assert grid["totals"]["occupied"] == 0
    assert grid["totals"]["vacant"] == 3

    # re-assignable now
    assign_stay(api, h, t["id"], ids["beds"][0]["id"], start="2026-11-01")


def test_duplicate_phone_rejected(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    create_tenant(api, h, phone="9090909090")
    r = api.post("/tenants", headers=h, json={"full_name": "Other", "phone": "9090909090"})
    assert r.status_code == 409


def test_document_upload_and_download(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    t = create_tenant(api, h)

    content = b"fake kyc pdf bytes"
    r = api.post(
        f"/tenants/{t['id']}/documents",
        headers=h,
        files={"file": ("aadhaar.pdf", io.BytesIO(content), "application/pdf")},
        data={"doc_type": "kyc_id"},
    )
    assert r.status_code == 201, r.text
    doc = r.json()
    assert doc["original_name"] == "aadhaar.pdf"

    r = api.get(f"/documents/{doc['id']}/download", headers=h)
    assert r.status_code == 200
    assert r.content == content

    # cross-org cannot download
    data_b = request_and_login(api, "9000000001", org_name="Other PGs")
    r = api.get(f"/documents/{doc['id']}/download", headers=auth_header(data_b["access_token"]))
    assert r.status_code == 404


def test_import_preview_and_execute(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)

    r = api.post("/tenants/import/preview", headers=h, files={"file": ("tenants.csv", io.BytesIO(CSV_SAMPLE.encode()), "text/csv")})
    assert r.status_code == 200, r.text
    preview = r.json()
    assert len(preview["valid_rows"]) == 2
    errors = {e["error"] for e in preview["errors"]}
    assert any("phone is required" in e for e in errors)  # Bad Row (also non-ISO date)
    assert any("Bed not found" in e for e in errors)  # unknown bed

    # execute: only 2 valid rows imported
    r = api.post("/tenants/import", headers=h, files={"file": ("tenants.csv", io.BytesIO(CSV_SAMPLE.encode()), "text/csv")})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["tenants_created"] == 2
    assert result["stays_created"] == 2
    assert len(result["errors"]) == 2

    tenants = api.get("/tenants", headers=h).json()
    assert len(tenants) == 2

    grid = api.get("/occupancy-grid", headers=h).json()
    assert grid["totals"]["occupied"] == 2


def test_import_missing_column_rejected(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    bad = "full_name,phone\nRavi,9111111111\n"
    r = api.post("/tenants/import/preview", headers=h, files={"file": ("t.csv", io.BytesIO(bad.encode()), "text/csv")})
    assert r.status_code == 200
    assert "Missing columns" in r.json()["errors"][0]["error"]
