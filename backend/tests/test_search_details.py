from tests.conftest import auth_header, request_and_login
from tests.test_properties import make_world


def test_search_and_property_room_details(api):
    token, _, ids = make_world(api)
    headers = auth_header(token)
    tenant = api.post(
        "/tenants",
        headers=headers,
        json={"full_name": "Srikanth Mandla", "phone": "9000000011"},
    ).json()
    stay = api.post(
        "/stays",
        headers=headers,
        json={
            "tenant_id": tenant["id"],
            "bed_id": ids["beds"][0]["id"],
            "start_date": "2025-01-15",
            "agreed_rent_paise": 700000,
            "deposit_paise": 1500000,
        },
    )
    assert stay.status_code == 201, stay.text

    result = api.get("/search?q=sri", headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["tenants"][0]["full_name"] == "Srikanth Mandla"
    assert result.json()["tenants"][0]["phone"] == "9000000011"
    assert result.json()["pgs"][0]["total_beds"] == 3
    assert result.json()["pgs"][0]["occupied_beds"] == 1

    details = api.get(f"/properties/{ids['property']['id']}", headers=headers)
    assert details.status_code == 200, details.text
    assert details.json()["total_rooms"] == 1
    assert details.json()["occupied_beds"] == 1
    assert details.json()["vacant_beds"] == 2

    room_details = api.get(f"/rooms/{ids['room']['id']}", headers=headers)
    assert room_details.status_code == 200, room_details.text
    first_bed = room_details.json()["beds"][0]
    assert first_bed["rent_paise"] == 700000
    assert first_bed["tenant"]["tenant_name"] == "Srikanth Mandla"
    assert first_bed["tenant"]["move_in_date"] == "2025-01-15"


def test_tenant_search_is_limited_to_home_property_and_hides_phone(api):
    data = request_and_login(api, "9876543210", org_name="Search PGs")
    owner_headers = auth_header(data["access_token"])
    first = api.post(
        "/properties",
        headers=owner_headers,
        json={"name": "Sunshine House", "locality": "Andheri", "city": "Mumbai"},
    ).json()
    floor = api.post(f"/properties/{first['id']}/floors", headers=owner_headers, json={"name": "Ground"}).json()
    room = api.post(
        f"/floors/{floor['id']}/rooms",
        headers=owner_headers,
        json={"number": "101", "sharing_type": 1},
    ).json()
    bed = api.post(
        f"/rooms/{room['id']}/beds",
        headers=owner_headers,
        json={"label": "A", "rent_paise": 500000, "deposit_paise": 0},
    ).json()
    other = api.post(
        "/properties",
        headers=owner_headers,
        json={"name": "Sunshine Annex"},
    ).json()
    other_floor = api.post(
        f"/properties/{other['id']}/floors",
        headers=owner_headers,
        json={"name": "Ground"},
    ).json()
    other_room = api.post(
        f"/floors/{other_floor['id']}/rooms",
        headers=owner_headers,
        json={"number": "202", "sharing_type": 1},
    ).json()
    api.post(
        f"/rooms/{other_room['id']}/beds",
        headers=owner_headers,
        json={"label": "A", "rent_paise": 500000, "deposit_paise": 0},
    )
    tenant = api.post(
        "/tenants",
        headers=owner_headers,
        json={"full_name": "Hidden Phone", "phone": "9000000012"},
    ).json()
    api.post(
        "/stays",
        headers=owner_headers,
        json={
            "tenant_id": tenant["id"],
            "bed_id": bed["id"],
            "start_date": "2025-02-01",
            "agreed_rent_paise": 500000,
            "deposit_paise": 0,
        },
    )
    tenant_login = api.post("/auth/login", json={"phone": "9000000012", "password": "password"}).json()
    tenant_headers = auth_header(tenant_login["access_token"])

    result = api.get("/search?q=house", headers=tenant_headers)
    assert result.status_code == 200, result.text
    assert [item["id"] for item in result.json()["pgs"]] == [first["id"]]

    result = api.get("/search?q=hid", headers=tenant_headers)
    assert result.status_code == 200, result.text
    assert len(result.json()["tenants"]) == 1
    assert result.json()["tenants"][0]["phone"] is None
    assert api.get("/search?q=annex", headers=tenant_headers).json()["pgs"] == []

    assert api.get(f"/properties/{other['id']}", headers=tenant_headers).status_code == 404
    assert api.get(f"/rooms/{other_room['id']}", headers=tenant_headers).status_code == 404
    assert api.get(f"/properties/{first['id']}/rooms", headers=tenant_headers).status_code == 200


def test_search_validates_query_and_escapes_wildcards(api):
    data = request_and_login(api, "9876543210", org_name="Search Validation")
    headers = auth_header(data["access_token"])
    api.post("/properties", headers=headers, json={"name": "100% Home"})
    assert api.get("/search?q=%25", headers=headers).status_code == 422
    assert api.get("/search?q=ho%25", headers=headers).json()["pgs"] == []
