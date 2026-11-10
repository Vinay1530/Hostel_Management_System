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


def _open_direct_with_tenant(api, owner_headers, ids, tenant_phone):
    contacts = api.get(
        f"/conversations?property_id={ids['property']['id']}", headers=owner_headers
    ).json()["contacts"]
    contact = next(contact for contact in contacts if contact["phone"] == tenant_phone)
    direct = api.post(
        "/conversations/direct",
        headers=owner_headers,
        json={
            "other_user_id": contact["user_id"],
            "property_id": ids["property"]["id"],
        },
    )
    assert direct.status_code == 200, direct.text
    return direct.json()


def test_chat_delivery_ticks_reactions_and_edits(api):
    owner_headers, ids, tenant_one, _ = _make_property_with_two_tenants(api)
    tenant_headers = _tenant_headers(api, tenant_one["phone"])
    direct = _open_direct_with_tenant(api, owner_headers, ids, tenant_one["phone"])

    posted = api.post(
        f"/conversations/{direct['id']}/messages",
        headers=owner_headers,
        json={"body": "Your rent receipt is ready."},
    )
    assert posted.status_code == 201, posted.text
    message = posted.json()
    assert message["delivery_status"] == "sent"
    assert message["reactions"] == []
    assert message["edited_at"] is None

    # Opening the thread marks the message delivered + read.
    tenant_view = api.get(
        f"/conversations/{direct['id']}/messages", headers=tenant_headers
    )
    assert tenant_view.status_code == 200, tenant_view.text
    assert tenant_view.json()["messages"][-1]["delivery_status"] == "read"
    owner_view = api.get(
        f"/conversations/{direct['id']}/messages", headers=owner_headers
    ).json()
    assert owner_view["messages"][-1]["delivery_status"] == "read"

    # Reactions: each participant gets one, upsert replaces their emoji.
    owner_reaction = api.put(
        f"/conversations/{direct['id']}/messages/{message['id']}/reaction",
        headers=owner_headers,
        json={"emoji": "👍"},
    )
    assert owner_reaction.status_code == 200, owner_reaction.text
    assert [r["emoji"] for r in owner_reaction.json()["reactions"]] == ["👍"]

    tenant_reaction = api.put(
        f"/conversations/{direct['id']}/messages/{message['id']}/reaction",
        headers=tenant_headers,
        json={"emoji": "❤️"},
    )
    assert tenant_reaction.status_code == 200, tenant_reaction.text
    assert len(tenant_reaction.json()["reactions"]) == 2

    changed = api.put(
        f"/conversations/{direct['id']}/messages/{message['id']}/reaction",
        headers=owner_headers,
        json={"emoji": "😂"},
    )
    assert changed.status_code == 200, changed.text
    emojis = sorted(r["emoji"] for r in changed.json()["reactions"])
    assert emojis == sorted(["😂", "❤️"])

    removed = api.delete(
        f"/conversations/{direct['id']}/messages/{message['id']}/reaction",
        headers=owner_headers,
    )
    assert removed.status_code == 200, removed.text
    assert [r["emoji"] for r in removed.json()["reactions"]] == ["❤️"]

    # Own messages can be edited inside the window and carry edited_at.
    edited = api.patch(
        f"/conversations/{direct['id']}/messages/{message['id']}",
        headers=owner_headers,
        json={"body": "Your rent receipt is ready to download."},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["body"] == "Your rent receipt is ready to download."
    assert edited.json()["edited_at"] is not None

    # Nobody can edit someone else's message.
    denied = api.patch(
        f"/conversations/{direct['id']}/messages/{message['id']}",
        headers=tenant_headers,
        json={"body": "Not mine to edit"},
    )
    assert denied.status_code == 403


def test_chat_edit_closes_after_one_hour(api, monkeypatch):
    from datetime import datetime, timedelta, timezone

    from app.api import collaboration as chat_api

    owner_headers, ids, tenant_one, _ = _make_property_with_two_tenants(api)
    direct = _open_direct_with_tenant(api, owner_headers, ids, tenant_one["phone"])
    posted = api.post(
        f"/conversations/{direct['id']}/messages",
        headers=owner_headers,
        json={"body": "Dinner at 8?"},
    )
    assert posted.status_code == 201, posted.text

    class FutureDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime.now(tz or timezone.utc) + timedelta(hours=2)

    monkeypatch.setattr(chat_api, "datetime", FutureDatetime)
    late_edit = api.patch(
        f"/conversations/{direct['id']}/messages/{posted.json()['id']}",
        headers=owner_headers,
        json={"body": "Too late now"},
    )
    assert late_edit.status_code == 403
    assert "1 hour" in late_edit.json()["detail"]


def test_payment_reminder_is_mirrored_into_tenant_chat(api):
    owner_headers, _, tenant_one, _ = _make_property_with_two_tenants(api)
    invoices = api.post(
        "/invoices/generate", headers=owner_headers, json={"month": "2026-10"}
    ).json()
    assert invoices, "expected a rent invoice for the active stay"
    invoice = invoices[0]

    reminder = api.post(
        "/payment-reminders",
        headers=owner_headers,
        json={
            "invoice_id": invoice["id"],
            "reminder_type": "due",
            "reminder_date": "2026-10-01",
            "channel": "in_app",
        },
    )
    assert reminder.status_code == 201, reminder.text

    tenant_headers = _tenant_headers(api, tenant_one["phone"])
    conversations = api.get("/conversations", headers=tenant_headers).json()["conversations"]
    bodies = []
    for conversation in conversations:
        page = api.get(
            f"/conversations/{conversation['id']}/messages", headers=tenant_headers
        )
        assert page.status_code == 200, page.text
        bodies.extend(message["body"] for message in page.json()["messages"])

    mirrored = [body for body in bodies if body.startswith("🔔 Rent reminder")]
    assert len(mirrored) == 1
    assert "October 2026" in mirrored[0]
