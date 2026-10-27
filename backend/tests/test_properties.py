from tests.conftest import auth_header, request_and_login


def make_world(api):
    """Login + property/floor/room/beds skeleton. Returns (token, org_id, ids)."""
    data = request_and_login(api, "9876543210", org_name="Test PGs")
    token = data["access_token"]
    org_id = data["organizations"][0]["id"]
    h = auth_header(token)

    r = api.post("/properties", headers=h, json={"name": "Sunshine PG", "address": "Andheri, Mumbai", "advance_or_arrears": "arrears", "due_day": 10, "pro_rate_first_month": True, "notice_period_days": 15})
    assert r.status_code == 201, r.text
    prop = r.json()

    r = api.post(f"/properties/{prop['id']}/floors", headers=h, json={"name": "Ground"})
    assert r.status_code == 201, r.text
    floor = r.json()

    r = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "101", "sharing_type": 3})
    assert r.status_code == 201, r.text
    room = r.json()

    r = api.post(f"/rooms/{room['id']}/beds/bulk", headers=h, json={"labels": ["A", "B", "C"], "rent_paise": 700000, "deposit_paise": 1500000})
    assert r.status_code == 201, r.text
    beds = r.json()

    return token, org_id, {"property": prop, "floor": floor, "room": room, "beds": beds}


def test_property_crud(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)

    r = api.get("/properties", headers=h)
    assert r.status_code == 200
    props = r.json()
    assert len(props) == 1 and props[0]["name"] == "Sunshine PG"
    assert props[0]["advance_or_arrears"] == "arrears"

    r = api.patch(f"/properties/{ids['property']['id']}", headers=h, json={"name": "Sunshine PG", "address": None, "advance_or_arrears": "advance", "due_day": 5, "pro_rate_first_month": False, "notice_period_days": 30})
    assert r.status_code == 200
    assert r.json()["advance_or_arrears"] == "advance"

    r = api.delete(f"/properties/{ids['property']['id']}", headers=h)
    assert r.status_code == 204
    assert api.get("/properties", headers=h).json() == []


def test_bulk_beds_and_duplicate_label(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    room_id = ids["room"]["id"]

    r = api.post(f"/rooms/{room_id}/beds/bulk", headers=h, json={"labels": ["A"], "rent_paise": 1, "deposit_paise": 0})
    assert r.status_code == 409
    assert "already exist" in r.json()["detail"]

    r = api.post(f"/rooms/{room_id}/beds", headers=h, json={"label": "D", "rent_paise": 800000, "deposit_paise": 0, "status": "vacant"})
    assert r.status_code == 201

    r = api.post(f"/rooms/{room_id}/beds", headers=h, json={"label": "D", "rent_paise": 800000, "deposit_paise": 0})
    assert r.status_code == 409


def test_occupancy_grid_and_totals(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)

    r = api.get("/occupancy-grid", headers=h)
    assert r.status_code == 200, r.text
    grid = r.json()
    assert grid["totals"]["beds"] == 3
    assert grid["totals"]["occupied"] == 0
    assert grid["totals"]["vacant"] == 3
    assert grid["totals"]["occupancy_pct"] == 0
    assert grid["properties"][0]["floors"][0]["rooms"][0]["beds"][0]["label"] == "A"


def test_bed_maintenance_status(api):
    token, org_id, ids = make_world(api)
    h = auth_header(token)
    bed = ids["beds"][0]

    r = api.patch(f"/beds/{bed['id']}", headers=h, json={"label": "A", "rent_paise": bed["rent_paise"], "deposit_paise": bed["deposit_paise"], "status": "maintenance"})
    assert r.status_code == 200
    grid = api.get("/occupancy-grid", headers=h).json()
    assert grid["totals"]["maintenance"] == 1
    assert grid["totals"]["vacant"] == 2


def test_cross_org_isolation(api):
    token_a, org_a, ids_a = make_world(api)
    data_b = request_and_login(api, "9000000001", name="B Owner", org_name="B PGs")
    h_b = auth_header(data_b["access_token"])

    # B cannot see A's property…
    r = api.get(f"/rooms/{ids_a['room']['id']}", headers=h_b)
    assert r.status_code == 404
    # …or patch A's bed
    bed_a = ids_a["beds"][0]
    r = api.patch(f"/beds/{bed_a['id']}", headers=h_b, json={"label": "Z", "rent_paise": 1, "deposit_paise": 0, "status": "vacant"})
    assert r.status_code == 404
    # B's grid only shows B's org (empty)
    grid = api.get("/occupancy-grid", headers=h_b).json()
    assert grid["totals"]["beds"] == 0
