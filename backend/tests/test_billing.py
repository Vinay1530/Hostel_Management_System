from tests.conftest import auth_header, request_and_login
from tests.test_properties import make_world
from tests.test_tenants import assign_stay, create_tenant


def setup_tenant(api, h, start="2026-10-01"):
    token, org_id, ids = make_world(api)
    t = create_tenant(api, h)
    stay = assign_stay(api, h, t["id"], ids["beds"][0]["id"], start=start)
    return ids, t, stay


def test_invoice_generation_full_month(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h)

    r = api.post("/invoices/generate", headers=h, json={"month": "2026-10"})
    assert r.status_code == 200, r.text
    invoices = r.json()
    assert len(invoices) == 1
    inv = invoices[0]
    assert inv["amount_paise"] == 700000  # full month, no charges
    assert inv["period_month"] == "2026-10"
    assert inv["status"] == "pending"
    assert inv["due_date"] == "2026-10-10"  # arrears cycle, due_day=10

    # idempotent: second run adds nothing
    r = api.post("/invoices/generate", headers=h, json={"month": "2026-10"})
    assert r.json() == []


def test_invoice_pro_rate_first_month(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h, start="2026-10-15")

    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    # 2026-10 has 31 days; stay active from 15th => 17 days
    expected = int(700000 * 17 / 31)
    assert invoices[0]["amount_paise"] == expected
    # next month is full rent
    invoices2 = api.post("/invoices/generate", headers=h, json={"month": "2026-11"}).json()
    assert invoices2[0]["amount_paise"] == 700000


def test_advance_cycle_due_date_in_previous_month(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    # switch property config to advance, due_day=5
    r = api.patch(
        f"/properties/{ids['property']['id']}",
        headers=h,
        json={"name": "Sunshine PG", "address": None, "advance_or_arrears": "advance",
              "due_day": 5, "pro_rate_first_month": True, "notice_period_days": 30},
    )
    assert r.status_code == 200

    tenant = create_tenant(api, h)
    assign_stay(api, h, tenant["id"], ids["beds"][0]["id"])
    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-11"}).json()
    # November rent is due 5-Oct in advance mode
    assert invoices[0]["due_date"] == "2026-10-05"


def test_charges_folded_into_invoice(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h)

    r = api.post("/charges", headers=h, json={"stay_id": stay["id"], "charge_type": "electricity",
                                              "amount_paise": 45000, "description": "Oct electricity", "charge_month": "2026-10"})
    assert r.status_code == 201
    r = api.post("/charges", headers=h, json={"stay_id": stay["id"], "charge_type": "late_fee",
                                              "amount_paise": 10000, "charge_month": "2026-10"})
    assert r.status_code == 201
    # charge for another month must not be folded in
    r = api.post("/charges", headers=h, json={"stay_id": stay["id"], "charge_type": "food",
                                              "amount_paise": 200000, "charge_month": "2026-11"})
    assert r.status_code == 201

    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    assert invoices[0]["amount_paise"] == 700000 + 45000 + 10000

    charges = api.get("/charges?applied=true", headers=h).json()
    assert len(charges) == 2
    pending = api.get("/charges?applied=false", headers=h).json()
    assert len(pending) == 1 and pending[0]["charge_month"] == "2026-11"


def test_partial_then_full_payment_flow(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h)
    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    inv = invoices[0]

    r = api.post("/payments", headers=h, json={"invoice_id": inv["id"], "amount_paise": 200000, "mode": "cash"})
    assert r.status_code == 201, r.text
    invs = api.get("/invoices", headers=h).json()
    assert invs[0]["status"] == "partial"
    assert invs[0]["paid_paise"] == 200000
    assert invs[0]["balance_paise"] == 500000

    r = api.post("/payments", headers=h, json={"invoice_id": inv["id"], "amount_paise": 510000, "mode": "cash"})
    assert r.status_code == 400  # overpayment blocked
    assert "Overpayment" in r.json()["detail"]

    r = api.post("/payments", headers=h, json={"invoice_id": inv["id"], "amount_paise": 500000, "mode": "cash", "reference": "CASH-01"})
    assert r.status_code == 201
    invs = api.get("/invoices", headers=h).json()
    assert invs[0]["status"] == "paid"
    assert invs[0]["balance_paise"] == 0

    # fully paid invoice rejects more payments
    r = api.post("/payments", headers=h, json={"invoice_id": inv["id"], "amount_paise": 1000, "mode": "cash"})
    assert r.status_code == 400


def test_dues_dashboard(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h)
    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    inv = invoices[0]
    api.post("/payments", headers=h, json={"invoice_id": inv["id"], "amount_paise": 250000, "mode": "cash"})

    r = api.get("/dues", headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    summary = data["summary"]
    assert summary["total_invoices"] == 1
    assert summary["pending"] == 0
    assert summary["partial"] == 1
    assert summary["billed_paise"] == 700000
    assert summary["collected_paise"] == 250000
    assert summary["outstanding_paise"] == 450000

    row = data["rows"][0]
    assert row["tenant_name"] == "Ravi Kumar"
    assert row["tenant_phone"] == "9111111111"
    assert row["property_name"] == "Sunshine PG"
    assert row["room_number"] == "101"
    assert row["bed_label"] == "A"
    assert row["balance_paise"] == 450000


def test_receipt_pdf(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    _, tenant, stay = setup_tenant(api, h)
    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    r = api.post("/payments", headers=h, json={"invoice_id": invoices[0]["id"], "amount_paise": 700000, "mode": "upi_manual", "reference": "UPI-XYZ"})
    payment_id = r.json()["id"]

    r = api.get(f"/payments/{payment_id}/receipt", headers=h)
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert r.content[:5] == b"%PDF-"


def test_no_cross_org_billing_access(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    tenant = create_tenant(api, h)
    assign_stay(api, h, tenant["id"], ids["beds"][0]["id"])
    invoices = api.post("/invoices/generate", headers=h, json={"month": "2026-10"}).json()
    data_b = request_and_login(api, "9000000001", org_name="B PGs")
    h_b = auth_header(data_b["access_token"])
    r = api.post("/payments", headers=h_b, json={"invoice_id": invoices[0]["id"], "amount_paise": 700000, "mode": "cash"})
    assert r.status_code == 404


def test_property_scoped_dues_tenants_and_generation(api):
    """Dashboard PG selector: dues/tenants/generation can be scoped to one PG."""
    from tests.conftest import auth_header, request_and_login

    data = request_and_login(api, "9876509090", org_name="Scope PGs")
    h = auth_header(data["access_token"])

    def make_pg(name, phone_suffix):
        layout = api.post("/properties/layout", headers=h, json={
            "name": name, "no_of_floors": 1, "rooms_per_floor": 1, "beds_per_room": 1,
            "rent_paise": 500000,
        }).json()
        bed = api.get(f"/rooms/{layout['floors'][0]['rooms'][0]['id']}/beds", headers=h).json()[0]
        t = api.post("/tenants", headers=h, json={"full_name": name + " Ten", "phone": f"9000000{phone_suffix}"}).json()
        api.post("/stays", headers=h, json={
            "tenant_id": t["id"], "bed_id": bed["id"],
            "start_date": "2026-01-01", "agreed_rent_paise": 500000,
        })
        return layout["property_id"]

    pg1 = make_pg("PG One", "301")
    pg2 = make_pg("PG Two", "302")

    api.post("/invoices/generate", headers=h, json={"month": "2026-03", "property_id": pg1})

    d1 = api.get(f"/dues?property_id={pg1}", headers=h).json()
    d2 = api.get(f"/dues?property_id={pg2}", headers=h).json()
    dall = api.get("/dues", headers=h).json()
    assert len(d1["rows"]) == 1 and d1["rows"][0]["property_id"] == pg1
    assert len(d2["rows"]) == 0
    assert len(dall["rows"]) == 1  # pg2 not billed

    t1 = api.get(f"/tenants?property_id={pg1}", headers=h).json()
    t2 = api.get(f"/tenants?property_id={pg2}", headers=h).json()
    assert [x["full_name"] for x in t1] == ["PG One Ten"]
    assert [x["full_name"] for x in t2] == ["PG Two Ten"]

    # scoped generation for PG2 creates only its invoice
    api.post("/invoices/generate", headers=h, json={"month": "2026-03", "property_id": pg2})
    assert len(api.get(f"/dues?property_id={pg2}", headers=h).json()["rows"]) == 1
    assert len(api.get(f"/dues?property_id={pg1}", headers=h).json()["rows"]) == 1
