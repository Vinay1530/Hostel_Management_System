from tests.conftest import auth_header, request_and_login


def _setup(api):
    data = request_and_login(api, "9876501010", org_name="Layout PGs")
    h = auth_header(data["access_token"])
    return h


def test_layout_creates_numbered_rooms_and_beds(api):
    h = _setup(api)
    r = api.post("/properties/layout", headers=h, json={
        "name": "Sunshine Residency",
        "facilities": "wifi,mess",
        "no_of_floors": 2,
        "rooms_per_floor": 3,
        "beds_per_room": 3,
        "rent_paise": 700000,
        "deposit_paise": 1500000,
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["property_name"] == "Sunshine Residency"
    assert body["totals"] == {"floors": 2, "rooms": 6, "beds": 18}

    g, f1 = body["floors"]
    assert g["name"] == "Ground"
    assert [rm["number"] for rm in g["rooms"]] == ["001", "002", "003"]
    assert f1["name"] == "1st"
    assert [rm["number"] for rm in f1["rooms"]] == ["101", "102", "103"]
    assert all(rm["beds"] == 3 for rm in g["rooms"] + f1["rooms"])

    # rooms appear on the occupancy grid with rent applied to beds
    grid = api.get("/occupancy-grid", headers=h).json()
    prop = next(p for p in grid["properties"] if p["name"] == "Sunshine Residency")
    beds = prop["floors"][0]["rooms"][0]["beds"]
    assert [b["label"] for b in beds] == ["A", "B", "C"]
    assert all(b["rent_paise"] == 700000 for b in beds)
    assert all(b["status"] == "vacant" for b in beds)


def test_patch_room_updates_facilities_and_rent(api):
    h = _setup(api)
    layout = api.post("/properties/layout", headers=h, json={
        "name": "P2", "no_of_floors": 1, "rooms_per_floor": 2, "beds_per_room": 2,
        "rent_paise": 600000,
    }).json()
    room = layout["floors"][0]["rooms"][0]

    r = api.patch(f"/rooms/{room['id']}", headers=h, json={
        "facilities": "ac,hot-water",
        "bed_rent_paise": 750000,
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["facilities"] == "ac,hot-water"

    beds = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    assert all(b["rent_paise"] == 750000 for b in beds)


def test_patch_room_add_and_remove_vacant_beds(api):
    h = _setup(api)
    layout = api.post("/properties/layout", headers=h, json={
        "name": "P3", "no_of_floors": 1, "rooms_per_floor": 1, "beds_per_room": 2,
        "rent_paise": 500000,
    }).json()
    room = layout["floors"][0]["rooms"][0]

    # add a bed -> label C
    r = api.patch(f"/rooms/{room['id']}", headers=h, json={"beds_count": 3})
    assert r.status_code == 200, r.text
    beds = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    assert [b["label"] for b in beds] == ["A", "B", "C"]

    # remove one -> back to 2 beds (labels shift to the highest-numbered vacant bed first)
    r = api.patch(f"/rooms/{room['id']}", headers=h, json={"beds_count": 2})
    assert r.status_code == 200
    beds = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    assert [b["label"] for b in beds] == ["A", "B"]


def _make_bed_occupied(api, h, room_id, label_index, phone):
    from datetime import date

    beds = api.get(f"/rooms/{room_id}/beds", headers=h).json()
    t = api.post("/tenants", headers=h, json={"full_name": "Occupant", "phone": phone}).json()
    r = api.post("/stays", headers=h, json={
        "tenant_id": t["id"], "bed_id": beds[label_index]["id"],
        "start_date": date.today().isoformat(), "agreed_rent_paise": 700000,
    })
    assert r.status_code == 201, r.text


def test_delete_guards_refuse_assets_with_active_tenants(api):
    h = _setup(api)
    layout = api.post("/properties/layout", headers=h, json={
        "name": "Guard PG", "no_of_floors": 1, "rooms_per_floor": 2, "beds_per_room": 2,
    }).json()
    floor = layout["floors"][0]
    room = floor["rooms"][0]
    _make_bed_occupied(api, h, room["id"], 0, "9444444401")

    # bed, room, floor, property all protected by active stay
    beds = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    assert api.delete(f"/beds/{beds[0]['id']}", headers=h).status_code == 409
    assert api.delete(f"/rooms/{room['id']}", headers=h).status_code == 409
    assert api.delete(f"/floors/{floor['id']}", headers=h).status_code == 409
    assert api.delete(f"/properties/{layout['property_id']}", headers=h).status_code == 409

    # the other room + its vacant bed can be deleted freely
    other = floor["rooms"][1]
    beds = api.get(f"/rooms/{other['id']}/beds", headers=h).json()
    assert api.delete(f"/beds/{beds[0]['id']}", headers=h).status_code == 204, beds[0]
    assert api.delete(f"/rooms/{other['id']}", headers=h).status_code == 204


def test_property_facilities_auto_attach_to_rooms(api):
    h = _setup(api)
    layout = api.post("/properties/layout", headers=h, json={
        "name": "Facil PG", "facilities": "wifi,mess",
        "no_of_floors": 1, "rooms_per_floor": 3, "beds_per_room": 1,
    }).json()
    rooms = layout["floors"][0]["rooms"]
    # every room inherited the PG's facilities
    assert all(rm["facilities"] == "wifi,mess" for rm in rooms)

    # manager overrides one room individually
    api.patch(f"/rooms/{rooms[0]['id']}", headers=h, json={"facilities": "ac,parking"})

    # PG-level edit: inherited rooms follow, customized room keeps its own
    api.patch(f"/properties/{layout['property_id']}", headers=h, json={"facilities": "wifi,laundry,cctv"})
    r0 = api.get(f"/rooms/{rooms[0]['id']}", headers=h).json()
    r1 = api.get(f"/rooms/{rooms[1]['id']}", headers=h).json()
    r2 = api.get(f"/rooms/{rooms[2]['id']}", headers=h).json()
    assert r0["facilities"] == "ac,parking"
    assert r1["facilities"] == "wifi,laundry,cctv"
    assert r2["facilities"] == "wifi,laundry,cctv"

    # manually-created room (no facilities) also inherits the PG-level set
    floor = api.get(f"/properties/{layout['property_id']}/floors", headers=h).json()[0]
    manual = api.post(f"/floors/{floor['id']}/rooms", headers=h, json={"number": "099", "sharing_type": 1}).json()
    api.patch(f"/properties/{layout['property_id']}", headers=h, json={"facilities": "mess"})
    assert api.get(f"/rooms/{manual['id']}", headers=h).json()["facilities"] == "mess"

    # the room that was customized before keeps staying customized through later edits
    assert api.get(f"/rooms/{rooms[0]['id']}", headers=h).json()["facilities"] == "ac,parking"


def test_patch_room_cannot_remove_occupied_bed(api):
    from datetime import date

    h = _setup(api)
    layout = api.post("/properties/layout", headers=h, json={
        "name": "P4", "no_of_floors": 1, "rooms_per_floor": 1, "beds_per_room": 2,
    }).json()
    room = layout["floors"][0]["rooms"][0]
    beds = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    today = date.today().isoformat()

    # occupy both beds
    for i, bed in enumerate(beds):
        t = api.post("/tenants", headers=h, json={"full_name": f"T{i}", "phone": f"900000010{i}"}).json()
        r = api.post("/stays", headers=h, json={
            "tenant_id": t["id"], "bed_id": bed["id"],
            "start_date": today, "agreed_rent_paise": 700000,
        })
        assert r.status_code == 201, r.text

    # 1 bed requested but both are occupied -> 409
    r2 = api.patch(f"/rooms/{room['id']}", headers=h, json={"beds_count": 1})
    assert r2.status_code == 409, r2.text

    # no beds removed
    beds_after = api.get(f"/rooms/{room['id']}/beds", headers=h).json()
    assert len(beds_after) == 2
