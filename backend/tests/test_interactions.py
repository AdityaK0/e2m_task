from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.interactions.models import Interaction
from app.modules.users.models import Role

from .conftest import (
    auth_headers,
    customer_payload,
    interaction_payload,
    login,
)


def _setup(client, make_user, *, role=Role.MANAGER, email="csm@example.com"):
    user = make_user(email, role=role)
    token, _ = login(client, user.email, user.password)
    customer = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Interaction Customer"),
        headers=auth_headers(token),
    )
    assert customer.status_code == 201, customer.text
    return user, token, customer.json()["id"]


def test_create_list_filter_and_get_interaction(client, make_user):
    user, token, customer_id = _setup(client, make_user)
    now = datetime.now(timezone.utc)

    meeting = client.post(
        "/api/v1/interactions",
        json=interaction_payload(
            customer_id,
            title="Discovery call",
            type="call",
            occurred_at=(now - timedelta(days=10)).isoformat(),
            notes="They asked about SSO and pricing.",
            participants=["  Alice  ", "", "Bob"],
        ),
        headers=auth_headers(token),
    )
    assert meeting.status_code == 201, meeting.text
    meeting_body = meeting.json()
    assert meeting_body["type"] == "call"
    assert meeting_body["participants"] == ["Alice", "Bob"]
    assert meeting_body["notes_version"] == 1
    assert meeting_body["owner_id"] == user.id
    assert meeting_body["customer"]["id"] == customer_id

    review = client.post(
        "/api/v1/interactions",
        json=interaction_payload(
            customer_id,
            title="Quarterly review",
            type="meeting",
            occurred_at=now.isoformat(),
            notes="Strong adoption and an expansion opportunity.",
        ),
        headers=auth_headers(token),
    )
    assert review.status_code == 201

    email = client.post(
        "/api/v1/interactions",
        json=interaction_payload(
            customer_id,
            title="Follow-up email",
            type="email",
            occurred_at=(now - timedelta(days=2)).isoformat(),
            notes="Sent the proposal.",
        ),
        headers=auth_headers(token),
    )
    assert email.status_code == 201

    listing = client.get("/api/v1/interactions", headers=auth_headers(token)).json()
    assert listing["total"] == 3
    assert [item["title"] for item in listing["items"]] == [
        "Quarterly review",
        "Follow-up email",
        "Discovery call",
    ]

    calls = client.get(
        "/api/v1/interactions?type=call", headers=auth_headers(token)
    ).json()
    assert [item["title"] for item in calls["items"]] == ["Discovery call"]

    searched = client.get(
        "/api/v1/interactions?search=proposal", headers=auth_headers(token)
    ).json()
    assert [item["title"] for item in searched["items"]] == ["Follow-up email"]

    since = client.get(
        "/api/v1/interactions",
        params={"date_from": (now - timedelta(days=3)).isoformat()},
        headers=auth_headers(token),
    ).json()
    assert {item["title"] for item in since["items"]} == {
        "Quarterly review",
        "Follow-up email",
    }

    before = client.get(
        "/api/v1/interactions",
        params={"date_to": (now - timedelta(days=5)).isoformat()},
        headers=auth_headers(token),
    ).json()
    assert {item["title"] for item in before["items"]} == {"Discovery call"}

    detail = client.get(
        f"/api/v1/interactions/{review.json()['id']}", headers=auth_headers(token)
    )
    assert detail.status_code == 200
    assert detail.json()["insight_status"] is None

    invalid_filter = client.get(
        "/api/v1/interactions?type=carrier-pigeon", headers=auth_headers(token)
    )
    assert invalid_filter.status_code == 422


def test_create_interaction_validation_and_permissions(client, make_user):
    _, csm_token, customer_id = _setup(client, make_user)
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    viewer_token, _ = login(client, viewer.email, viewer.password)

    missing_customer = client.post(
        "/api/v1/interactions",
        json=interaction_payload(99999),
        headers=auth_headers(csm_token),
    )
    assert missing_customer.status_code == 404
    assert missing_customer.json()["error_code"] == "CUSTOMER_NOT_FOUND"

    blank_title = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id, title="   "),
        headers=auth_headers(csm_token),
    )
    assert blank_title.status_code == 422

    forbidden = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(viewer_token),
    )
    assert forbidden.status_code == 404

    created = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(csm_token),
    ).json()
    viewer_delete = client.delete(
        f"/api/v1/interactions/{created['id']}", headers=auth_headers(viewer_token)
    )
    assert viewer_delete.status_code == 403


def test_update_notes_versioning_and_validation(client, make_user, db):
    _, token, customer_id = _setup(client, make_user)
    created = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(token),
    ).json()
    interaction_id = created["id"]
    assert created["notes_version"] == 1

    title_only = client.patch(
        f"/api/v1/interactions/{interaction_id}",
        json={"title": "Renamed review"},
        headers=auth_headers(token),
    )
    assert title_only.status_code == 200
    assert title_only.json()["notes_version"] == 1

    notes_update = client.patch(
        f"/api/v1/interactions/{interaction_id}",
        json={"notes": "Updated notes with a new deadline."},
        headers=auth_headers(token),
    )
    assert notes_update.status_code == 200
    assert notes_update.json()["notes_version"] == 2

    same_notes = client.patch(
        f"/api/v1/interactions/{interaction_id}",
        json={"notes": "Updated notes with a new deadline."},
        headers=auth_headers(token),
    )
    assert same_notes.status_code == 200
    assert same_notes.json()["notes_version"] == 2

    missing_customer = client.patch(
        f"/api/v1/interactions/{interaction_id}",
        json={"customer_id": 99999},
        headers=auth_headers(token),
    )
    assert missing_customer.status_code == 404

    missing_interaction = client.patch(
        "/api/v1/interactions/99999",
        json={"title": "Nope"},
        headers=auth_headers(token),
    )
    assert missing_interaction.status_code == 404
    assert missing_interaction.json()["error_code"] == "INTERACTION_NOT_FOUND"

    row = db.get(Interaction, interaction_id)
    assert row.notes_version == 2


def test_editing_notes_marks_insight_stale(client, make_user, db):
    _, token, customer_id = _setup(client, make_user)
    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(token),
    ).json()

    generated = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert generated.status_code == 200, generated.text
    assert generated.json()["status"] == "completed"

    updated = client.patch(
        f"/api/v1/interactions/{interaction['id']}",
        json={"notes": "The customer now wants 100 more seats, not 50."},
        headers=auth_headers(token),
    )
    assert updated.status_code == 200
    assert updated.json()["notes_version"] == 2

    insight = client.get(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert insight.status_code == 200
    assert insight.json()["status"] == "stale"
    assert insight.json()["is_stale"] is True

    row = db.scalar(
        select(MeetingInsight).where(MeetingInsight.interaction_id == interaction["id"])
    )
    assert row.status == InsightStatus.STALE


def test_soft_delete_interaction(client, make_user, db):
    _, token, customer_id = _setup(client, make_user)
    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(token),
    ).json()

    deleted = client.delete(
        f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(token)
    )
    assert deleted.status_code == 403

    assert (
        client.get(
            f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(token)
        ).status_code
        == 200
    )
    listing = client.get("/api/v1/interactions", headers=auth_headers(token)).json()
    assert len(listing["items"]) == 1

    row = db.get(Interaction, interaction["id"])
    assert row is not None
    assert row.deleted_at is None

    second_delete = client.delete(
        f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(token)
    )
    assert second_delete.status_code == 403


def test_admin_can_delete_interaction(client, make_user):
    _, csm_token, customer_id = _setup(client, make_user)
    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer_id),
        headers=auth_headers(csm_token),
    ).json()

    admin = make_user("admin@example.com", role=Role.ADMIN)
    admin_token, _ = login(client, admin.email, admin.password)
    response = client.delete(
        f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(admin_token)
    )
    assert response.status_code == 204
