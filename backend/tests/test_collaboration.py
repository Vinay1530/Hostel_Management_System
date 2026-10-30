from tests.conftest import auth_header
from tests.test_properties import make_world
from tests.test_tenants import assign_stay, create_tenant


def _tenant_headers(api, phone):
    response = api.post("/auth/login", json={"phone": phone, "password": "password"})
    assert response.status_code == 200, response.text
    return auth_header(response.json()["access_token"])


def _make_property_with_two_tenants(api):
    token, _, ids = make_world(api)
    owner_headers = auth_header(token)
    tenant_one = create_tenant(api, owner_headers, "Tenant One", "9111111111")
    tenant_two = create_tenant(api, owner_headers, "Tenant Two", "9222222222")
    assign_stay(api, owner_headers, tenant_one["id"], ids["beds"][0]["id"])
    assign_stay(api, owner_headers, tenant_two["id"], ids["beds"][1]["id"])
    return owner_headers, ids, tenant_one, tenant_two


def _create_complaint(api, tenant_headers, title="Leaking tap"):
    response = api.post(
        "/complaints",
        headers=tenant_headers,
        data={
            "category": "water",
            "title": title,
            "description": "The bathroom tap is leaking.",
            "priority": "high",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_tenant_complaints_are_private_and_status_changes_notify(api):
    owner_headers, _, tenant_one, tenant_two = _make_property_with_two_tenants(api)
    tenant_one_headers = _tenant_headers(api, tenant_one["phone"])
    tenant_two_headers = _tenant_headers(api, tenant_two["phone"])
    complaint = _create_complaint(api, tenant_one_headers)
    assert [entry["status"] for entry in complaint["status_history"]] == ["open"]

    assert [row["id"] for row in api.get("/complaints", headers=tenant_one_headers).json()] == [complaint["id"]]
    assert api.get("/complaints", headers=tenant_two_headers).json() == []
    assert api.get(f"/complaints/{complaint['id']}", headers=tenant_two_headers).status_code == 404

    changed = api.patch(
        f"/complaints/{complaint['id']}/status",
        headers=owner_headers,
        json={"status": "in_progress"},
    )
    assert changed.status_code == 200, changed.text
    assert [entry["status"] for entry in changed.json()["status_history"]] == ["open", "in_progress"]
    notifications = api.get("/my/notifications", headers=tenant_one_headers)
    assert notifications.status_code == 200, notifications.text
    assert notifications.json()[0]["complaint_id"] == complaint["id"]


def test_chat_announcement_is_read_only_for_tenants(api):
    owner_headers, ids, tenant_one, _ = _make_property_with_two_tenants(api)
    tenant_headers = _tenant_headers(api, tenant_one["phone"])
    conversations = api.get(f"/conversations?property_id={ids['property']['id']}", headers=tenant_headers)
    assert conversations.status_code == 200, conversations.text
    announcement = next(c for c in conversations.json()["conversations"] if c["type"] == "announcement")
    response = api.post(
        f"/conversations/{announcement['id']}/messages",
        headers=tenant_headers,
        json={"body": "Please fix the water tank."},
    )
    assert response.status_code == 403

    owner_announcement = api.post(
        f"/conversations/{announcement['id']}/messages",
        headers=owner_headers,
        json={"body": "Water maintenance is scheduled tomorrow."},
    )
    assert owner_announcement.status_code == 201, owner_announcement.text


def test_only_conversation_participants_can_read_messages(api):
    owner_headers, ids, tenant_one, tenant_two = _make_property_with_two_tenants(api)
    tenant_one_headers = _tenant_headers(api, tenant_one["phone"])
    tenant_two_headers = _tenant_headers(api, tenant_two["phone"])
    contacts = api.get(
        f"/conversations?property_id={ids['property']['id']}",
        headers=tenant_one_headers,
    ).json()["contacts"]
    owner_contact = next(contact for contact in contacts if contact["role"] == "owner")
    direct = api.post(
        "/conversations/direct",
        headers=tenant_one_headers,
        json={"other_user_id": owner_contact["user_id"]},
    )
    assert direct.status_code == 200, direct.text

    posted = api.post(
        f"/conversations/{direct.json()['id']}/messages",
        headers=tenant_one_headers,
        json={"body": "Could we discuss my lease?"},
    )
    assert posted.status_code == 201, posted.text
    denied = api.get(
        f"/conversations/{direct.json()['id']}/messages",
        headers=tenant_two_headers,
    )
    assert denied.status_code == 404
