from tests.conftest import auth_header, request_and_login


def test_manager_register_and_login(api):
    r = api.post("/auth/register", json={
        "name": "Manager Asha", "phone": "9876500001",
        "email": "asha@example.com", "password": "secret123", "org_name": "Asha Residency",
    })
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["access_token"]
    assert data["organizations"][0]["name"] == "Asha Residency"
    assert data["organizations"][0]["role"] == "owner"

    # duplicate registration blocked
    r2 = api.post("/auth/register", json={
        "name": "Other", "phone": "9876500001", "password": "secret123", "org_name": "X",
    })
    assert r2.status_code == 409

    # password login works
    r3 = api.post("/auth/login", json={"phone": "9876500001", "password": "secret123"})
    assert r3.status_code == 200, r3.text
    assert r3.json()["organizations"][0]["name"] == "Asha Residency"

    # wrong password rejected
    r4 = api.post("/auth/login", json={"phone": "9876500001", "password": "wrong"})
    assert r4.status_code == 401


def test_manager_can_add_facilities(api):
    data = request_and_login(api, "9876500002", org_name="F PGs")
    h = auth_header(data["access_token"])
    prop = api.post("/properties", headers=h, json={"name": "Green PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15, "facilities": "wifi,laundry,mess"}).json()
    assert prop["facilities"] == "wifi,laundry,mess"

    # partial patch updates facilities without breaking other fields
    r = api.patch(f"/properties/{prop['id']}", headers=h, json={"facilities": "wifi,mess,power-backup"})
    assert r.status_code == 200
    assert r.json()["facilities"] == "wifi,mess,power-backup"
    assert r.json()["advance_or_arrears"] == "arrears"


def test_tenant_gets_login_with_default_password(api):
    data = request_and_login(api, "9876500003", org_name="T PGs")
    token = data["access_token"]
    org_id = data["organizations"][0]["id"]
    h = auth_header(token)

    prop = api.post("/properties", headers=h, json={"name": "T PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15}).json()
    floor = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    room = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "101", "sharing_type": 2}).json()
    bed = api.post(f"/rooms/{room['id']}/beds", headers=h, json={"label": "A", "rent_paise": 600000, "deposit_paise": 0}).json()

    tenant = api.post("/tenants", headers=h, json={"full_name": "Rustom", "phone": "9876500004"}).json()

    # tenant logs in with default password
    r = api.post("/auth/login", json={"phone": "9876500004", "password": "password"})
    assert r.status_code == 200, r.text
    tdata = r.json()
    assert tdata["organizations"][0]["role"] == "tenant"
    th = auth_header(tdata["access_token"])

    # tenant cannot use staff endpoints
    assert api.get("/properties", headers=th).status_code == 403
    assert api.get("/dues", headers=th).status_code == 403
    # tenant CAN see their own overview in their active org
    assert api.get("/my/overview", headers=th).status_code == 200
    r = api.patch(f"/beds/{bed['id']}", headers=th, json={"label": "Z", "rent_paise": 1, "deposit_paise": 0})
    assert r.status_code == 403


def test_tenant_sees_own_dues_after_stay(api):
    data = request_and_login(api, "9876500005", org_name="D PGs")
    h = auth_header(data["access_token"])

    prop = api.post("/properties", headers=h, json={"name": "D PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15}).json()
    floor = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    room = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "201", "sharing_type": 1}).json()
    bed = api.post(f"/rooms/{room['id']}/beds", headers=h, json={"label": "A", "rent_paise": 500000, "deposit_paise": 0}).json()
    tenant = api.post("/tenants", headers=h, json={"full_name": "Pavan", "phone": "9876500006"}).json()
    stay = api.post("/stays", headers=h, json={"tenant_id": tenant["id"], "bed_id": bed["id"], "start_date": "2026-10-01", "agreed_rent_paise": 500000}).json()
    api.post("/invoices/generate", headers=h, json={"month": "2026-10"})

    r = api.post("/auth/login", json={"phone": "9876500006", "password": "password"})
    th = auth_header(r.json()["access_token"])

    ov = api.get("/my/overview", headers=th)
    assert ov.status_code == 200, ov.text
    body = ov.json()
    assert body["profile"]["full_name"] == "Pavan"
    assert body["profile"]["room_number"] == "201"
    assert body["profile"]["property_name"] == "D PG"
    assert len(body["invoices"]) == 1
    assert body["invoices"][0]["balance_paise"] == 500000
    assert body["invoices"][0]["status"] == "pending"


def test_csv_import_also_creates_logins(api):
    import io

    data = request_and_login(api, "9876500007", org_name="I PGs")
    h = auth_header(data["access_token"])
    prop = api.post("/properties", headers=h, json={"name": "I PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15}).json()
    floor = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    room = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "301", "sharing_type": 2}).json()
    api.post(f"/rooms/{room['id']}/beds", headers=h, json={"label": "A", "rent_paise": 500000, "deposit_paise": 0}).json()
    csv_content = (
        "full_name,phone,property_name,floor_name,room_number,bed_label,start_date,agreed_rent_paise,deposit_paise,emergency_contact_name,emergency_contact_phone,id_number\n"
        "Deepak,9876500008,I PG,Ground,301,A,2026-10-01,500000,0,,,,\n"
    )
    r = api.post("/tenants/import", headers=h, files={"file": ("t.csv", io.BytesIO(csv_content.encode()), "text/csv")})
    assert r.json()["tenants_created"] == 1

    r = api.post("/auth/login", json={"phone": "9876500008", "password": "password"})
    assert r.status_code == 200
