from tests.conftest import auth_header, request_and_login


def _world(api):
    """Owner login + building/floor/room/beds skeleton. Returns (headers, ids)."""
    data = request_and_login(api, "9880000001", org_name="Req PGs")
    h = auth_header(data["access_token"])
    prop = api.post(
        "/properties", headers=h,
        json={"name": "Req PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15},
    ).json()
    floor = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    room = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "101", "sharing_type": 2}).json()
    beds = api.post(f"/rooms/{room['id']}/beds/bulk", headers=h, json={"labels": ["A", "B"], "rent_paise": 500000, "deposit_paise": 0}).json()
    return h, {"property": prop, "floor": floor, "room": room, "bed_b": beds[1]}


def _tenant_app(api, phone, name="Ravi Kumar"):
    """Tenant OTP login on the same phone; returns headers and org_id."""
    data = request_and_login(api, phone)
    token = data["access_token"]
    org = next(o for o in data["organizations"])
    return auth_header(token), org["id"]


def test_notice_flow_and_validation(api):
    h, ids = _world(api)
    tenant = api.post("/tenants", headers=h, json={"full_name": "Sunil", "phone": "9880000002"}).json()
    stay = api.post(
        "/stays", headers=h,
        json={"tenant_id": tenant["id"], "bed_id": ids["bed_b"]["id"], "start_date": "2025-03-01", "agreed_rent_paise": 500000},
    ).json()
    assert stay["status_code"] if isinstance(stay, dict) and "status_code" in stay else True

    t_h, org_id = _tenant_app(api, "9880000002")

    r = api.post("/my/notice", headers=t_h, json={})
    assert r.status_code == 200, r.text
    body = r.json()["profile"]
    assert body["notice_start_date"] is not None
    assert body["notice_end_date"] is not None

    r = api.post("/my/notice", headers=t_h, json={})
    assert r.status_code == 409, r.text

    r = api.post("/my/notice/cancel", headers=t_h, json={})
    assert r.status_code == 200, r.text
    assert r.json()["profile"]["notice_start_date"] is None

    r = api.post("/my/notice", headers=t_h, json={"end_date": "2025-01-01"})
    assert r.status_code == 422, r.text


def test_staff_requests_and_decision(api):
    h, ids = _world(api)
    tenant = api.post("/tenants", headers=h, json={"full_name": "Kiran", "phone": "9880000003"}).json()
    api.post(
        "/stays", headers=h,
        json={"tenant_id": tenant["id"], "bed_id": ids["bed_b"]["id"], "start_date": "2025-03-01", "agreed_rent_paise": 500000},
    )
    t_h, org_id = _tenant_app(api, "9880000003")

    other_prop = api.post("/properties", headers=h, json={"name": "Other PG", "address": None, "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15}).json()
    other_floor = api.post(f"/properties/{other_prop['id']}/floors", headers=h, json={"name": "Ground"}).json()
    other_room = api.post(f"/floors/{other_floor['id']}/rooms", headers=h, json={"number": "999", "sharing_type": 1}).json()
    other_bed = api.post(f"/rooms/{other_room['id']}/beds", headers=h, json={"label": "A", "rent_paise": 400000, "deposit_paise": 0}).json()
    bad_bed = api.post(f"/rooms/{ids['room']['id']}/beds", headers=h, json={"label": "C", "rent_paise": 400000, "deposit_paise": 0}).json()

    r = api.post(
        "/my/change-requests", headers=t_h,
        json={"building_id": other_prop["id"], "floor_id": other_floor["id"], "room_id": ids["room"]["id"], "bed_id": None, "note": "mixed"},
    )
    assert r.status_code == 422, r.text

    r = api.post("/my/change-requests", headers=t_h, json={"note": "anywhere is fine"})
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["kind"] == "change"
    assert r.json()["status"] == "open"

    r = api.post(
        "/my/change-requests", headers=t_h,
        json={"building_id": other_prop["id"], "floor_id": other_floor["id"], "room_id": other_room["id"], "bed_id": other_bed["id"], "note": "this one please"},
    )
    assert r.status_code == 201, r.text
    specific_id = r.json()["id"]
    assert r.json()["building_name"] == "Other PG"
    assert r.json()["room_number"] == "999"

    out = api.get("/requests", headers=h).json()
    assert len(out) == 2

    r = api.get("/requests", headers=h, params={"request_status": "open", "kind": "change"})
    assert len(r.json()) == 2

    r = api.patch(f"/requests/{req_id}", headers=h, json={"status": "approved"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    r = api.patch(f"/requests/{req_id}", headers=h, json={"status": "rejected"})
    assert r.status_code == 409, r.text

    mine = api.get("/my/change-requests", headers=t_h).json()
    assert [x["id"] for x in mine] == [req_id, specific_id]

    notes = api.get("/my/notifications", headers=t_h).json()
    assert any(n["request_id"] == req_id for n in notes)


def test_guest_public_and_booking(api):
    h, ids = _world(api)
    org_id = api.get("/my/role", headers=h).json()["org_id"]

    r = api.get("/public/pgs")
    assert r.status_code == 200, r.text
    rows = r.json()
    assert any(row["id"] == org_id and row["buildings_count"] == 1 for row in rows)

    r = api.get(f"/public/pgs/{org_id}")
    assert r.status_code == 200, r.text
    detail = r.json()
    assert detail["name"] == "Req PGs" or any(b["name"] == "Req PG" for b in detail["buildings"])
    b = next(b for b in detail["buildings"] if b["name"] == "Req PG")
    assert b["vacant_count"] == 2
    floor = next(f for f in b["floors"] if f["name"] == "Ground")
    room = next(rm for rm in floor["rooms"] if rm["number"] == "101")
    assert room["vacant_count"] == 2
    vacancy_labels = {vb["label"] for vb in room["vacant_beds"]}
    assert vacancy_labels == {"A", "B"}
    bed_a = next(vb for vb in room["vacant_beds"] if vb["label"] == "A")

    r = api.post(
        "/public/booking-requests",
        json={"org_id": org_id, "guest_name": "Guest Gopal", "guest_phone": "9123456780", "bed_id": bed_a["id"], "note": "window seat please"},
    )
    assert r.status_code == 201, r.text
    booking_id = r.json()["id"]

    r = api.get("/requests", headers=h, params={"kind": "booking"})
    assert [row["id"] for row in r.json()] == [booking_id]
    assert r.json()[0]["tenant_name"] is None
    assert r.json()[0]["bed_label"] == "A"

    staff_notes = api.get("/staff/notifications", headers=h).json()
    assert any(n["title"] == "New bed booking request" for n in staff_notes)
    note_id = next(n["id"] for n in staff_notes if n["title"] == "New bed booking request")

    r = api.patch(f"/staff/notifications/{note_id}/read", headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["read_at"] is not None

    r = api.post("/public/booking-requests", json={"org_id": org_id, "guest_name": "x", "guest_phone": "9123456781", "building_id": ids["property"]["id"], "floor_id": ids["floor"]["id"], "room_id": ids["room"]["id"], "bed_id": None})
    assert r.status_code == 201

    r = api.get(f"/public/pgs/{org_id}")
    b2 = next(b for b in r.json()["buildings"] if b["name"] == "Req PG")
    assert b2["vacant_count"] == 2
