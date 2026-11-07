from tests.conftest import auth_header, request_and_login


def _world(api):
    data = request_and_login(api, "9870000001", org_name="Phone PGs")
    h = auth_header(data["access_token"])
    prop = api.post(
        "/properties",
        headers=h,
        json={
            "name": "Phone PG",
            "address": None,
            "advance_or_arrears": "arrears",
            "due_day": 10,
            "pro_rate_first_month": True,
            "notice_period_days": 15,
        },
    ).json()
    floor = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    room = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "101", "sharing_type": 1}).json()
    bed = api.post(
        f"/rooms/{room['id']}/beds",
        headers=h,
        json={"label": "A", "rent_paise": 500000, "deposit_paise": 0},
    ).json()
    return h, {"property": prop, "floor": floor, "room": room, "bed": bed}


def _tenant(api, h, ids, phone, name="Tenant"):
    tenant = api.post("/tenants", headers=h, json={"full_name": name, "phone": phone}).json()
    api.post(
        "/stays",
        headers=h,
        json={
            "tenant_id": tenant["id"],
            "bed_id": ids["bed"]["id"],
            "start_date": "2025-03-01",
            "agreed_rent_paise": 500000,
        },
    )
    login = request_and_login(api, phone)
    return auth_header(login["access_token"]), login


def test_tenant_phone_change_request_requires_approval(api):
    h, ids = _world(api)
    t_h, _ = _tenant(api, h, ids, "9870000002", "Meena")

    r = api.post("/my/phone-change-requests", headers=t_h, json={"new_phone": "9870000003"})
    assert r.status_code == 201, r.text
    req = r.json()
    assert req["kind"] == "phone_change"
    assert req["status"] == "open"
    assert req["requested_phone"] == "9870000003"
    assert req["tenant_phone"] == "9870000002"

    # Only one open request at a time.
    r = api.post("/my/phone-change-requests", headers=t_h, json={"new_phone": "9870000004"})
    assert r.status_code == 409, r.text

    r = api.get("/requests", headers=h, params={"kind": "phone_change"})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert [row["id"] for row in rows] == [req["id"]]
    assert rows[0]["requested_phone"] == "9870000003"
    assert rows[0]["tenant_phone"] == "9870000002"

    # The number is not live until a manager approves it.
    mine = api.get("/my/phone-change-requests", headers=t_h).json()
    assert mine[0]["requested_phone"] == "9870000003"

    r = api.patch(f"/requests/{req['id']}", headers=h, json={"status": "approved"})
    assert r.status_code == 200, r.text
    decided = r.json()
    assert decided["status"] == "completed"
    assert decided["tenant_phone"] == "9870000003"

    # New number logs into the same tenant profile.
    login = request_and_login(api, "9870000003")
    new_h = auth_header(login["access_token"])
    profile = api.get("/my/profile", headers=new_h)
    assert profile.status_code == 200, profile.text
    assert profile.json()["phone"] == "9870000003"
    assert profile.json()["full_name"] == "Meena"

    # The tenant can no longer update the same request.
    r = api.patch(f"/requests/{req['id']}", headers=h, json={"status": "rejected"})
    assert r.status_code == 409, r.text


def test_tenant_phone_change_rejection(api):
    h, ids = _world(api)
    t_h, _ = _tenant(api, h, ids, "9870000005", "Vikram")

    req = api.post(
        "/my/phone-change-requests", headers=t_h, json={"new_phone": "9870000006"}
    ).json()

    r = api.patch(f"/requests/{req['id']}", headers=h, json={"status": "rejected"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert r.json()["tenant_phone"] == "9870000005"

    profile = api.get("/my/profile", headers=t_h).json()
    assert profile["phone"] == "9870000005"


def test_tenant_phone_change_rejects_taken_number(api):
    h, ids = _world(api)
    t_h, _ = _tenant(api, h, ids, "9870000007", "Asha")
    _tenant(api, h, ids, "9870000008", "Bala")

    r = api.post("/my/phone-change-requests", headers=t_h, json={"new_phone": "9870000008"})
    assert r.status_code == 409, r.text


def test_staff_can_change_own_phone_with_otp(api):
    h, _ = _world(api)

    r = api.post("/my/phone/otp/request", headers=h, json={"new_phone": "9870000011"})
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    assert code

    r = api.post(
        "/my/phone/otp/verify",
        headers=h,
        json={"new_phone": "9870000011", "code": code},
    )
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "9870000011"

    login = request_and_login(api, "9870000011")
    new_h = auth_header(login["access_token"])
    assert any(o["name"] == "Phone PGs" for o in login["organizations"])
    profile = api.get("/my/profile", headers=new_h)
    assert profile.status_code == 200, profile.text
    assert profile.json()["phone"] == "9870000011"


def test_staff_phone_change_rejects_registered_number(api):
    h, _ = _world(api)
    request_and_login(api, "9870000012", org_name="Other PGs")

    r = api.post("/my/phone/otp/request", headers=h, json={"new_phone": "9870000012"})
    assert r.status_code == 409, r.text
