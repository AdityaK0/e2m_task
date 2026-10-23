from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import func, select

from app.modules.insights.models import InsightStatus, MeetingInsight, Sentiment
from app.modules.insights.provider import AIProviderError, AINotConfiguredError
from app.modules.insights.schema import GeneratedInsight
from app.modules.users.models import Role
from app.utils.models import utc_now

from .conftest import (
    auth_headers,
    customer_payload,
    interaction_payload,
    login,
)


def _setup(client, make_user, *, notes="Adoption is strong. Send a proposal by Friday."):
    csm = make_user("csm@example.com", role=Role.MANAGER, name="Dana")
    token, _ = login(client, csm.email, csm.password)
    customer = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Insight Customer"),
        headers=auth_headers(token),
    ).json()
    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer["id"], notes=notes),
        headers=auth_headers(token),
    )
    assert interaction.status_code == 201, interaction.text
    return csm, token, interaction.json()


def test_generate_get_and_idempotency(client, make_user, fake_provider, db):
    csm, token, interaction = _setup(client, make_user)
    url = f"/api/v1/interactions/{interaction['id']}/insights"

    missing = client.get(url, headers=auth_headers(token))
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "INSIGHT_NOT_FOUND"

    generated = client.post(url, headers=auth_headers(token))
    assert generated.status_code == 200, generated.text
    body = generated.json()
    assert body["interaction_id"] == interaction["id"]
    assert body["status"] == "completed"
    assert body["sentiment"] == "Positive"
    assert body["summary"] == "The customer is happy and adoption is strong."
    assert body["action_item_count"] == 1
    assert body["risk_count"] == 1
    assert body["action_items"][0]["description"] == "Send pricing proposal"
    assert body["risks"][0]["severity"] == "medium"
    assert body["provider"] == "fake"
    assert body["model"] == "fake-model"
    assert body["generation_version"] == 1
    assert body["notes_version"] == interaction["notes_version"]
    assert body["is_stale"] is False
    assert body["generated_at"] is not None
    assert fake_provider.calls == 1

    same = client.post(url, headers=auth_headers(token))
    assert same.status_code == 200
    assert same.json()["generation_version"] == 1
    assert fake_provider.calls == 1

    forced = client.post(url, json={"force": True}, headers=auth_headers(token))
    assert forced.status_code == 200
    assert forced.json()["generation_version"] == 2
    assert fake_provider.calls == 2

    fetched = client.get(url, headers=auth_headers(token))
    assert fetched.status_code == 200
    assert fetched.json()["generation_version"] == 2

    row = db.scalar(
        select(MeetingInsight).where(MeetingInsight.interaction_id == interaction["id"])
    )
    assert row is not None
    assert row.status == InsightStatus.COMPLETED
    assert row.sentiment == Sentiment.POSITIVE
    assert row.action_items[0]["description"] == "Send pricing proposal"
    count = db.scalar(
        select(func.count())
        .select_from(MeetingInsight)
        .where(MeetingInsight.interaction_id == interaction["id"])
    )
    assert count == 1


def test_insight_permissions_and_config(client, make_user):
    _, csm_token, interaction = _setup(client, make_user)
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    viewer_token, _ = login(client, viewer.email, viewer.password)

    forbidden = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(viewer_token),
    )
    assert forbidden.status_code == 404
    assert forbidden.json()["error_code"] == "INTERACTION_NOT_FOUND"

    created = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(csm_token),
    )
    assert created.status_code == 200

    readable = client.get(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(viewer_token),
    )
    assert readable.status_code == 404

    config = client.get("/api/v1/insights/config", headers=auth_headers(viewer_token))
    assert config.status_code == 200
    assert config.json() == {"configured": False, "provider": None, "model": None}


def test_insight_requires_notes(client, make_user):
    _, token, interaction = _setup(client, make_user, notes=None)
    response = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert response.status_code == 422
    assert response.json()["error_code"] == "NOTES_REQUIRED"

    missing = client.post(
        "/api/v1/interactions/99999/insights", headers=auth_headers(token)
    )
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "INTERACTION_NOT_FOUND"


def test_provider_failure_marks_failed_and_retry_succeeds(
    client, make_user, fake_provider, db
):
    _, token, interaction = _setup(client, make_user)
    url = f"/api/v1/interactions/{interaction['id']}/insights"

    fake_provider.error = AIProviderError("upstream timeout")
    failed = client.post(url, headers=auth_headers(token))
    assert failed.status_code == 502
    assert failed.json()["error_code"] == "AI_GENERATION_FAILED"

    stored = client.get(url, headers=auth_headers(token))
    assert stored.status_code == 200
    assert stored.json()["status"] == "failed"
    assert stored.json()["error_message"] == "AI generation failed. Please retry."
    assert stored.json()["summary"] is None

    fake_provider.error = None
    retried = client.post(url, headers=auth_headers(token))
    assert retried.status_code == 200
    assert retried.json()["status"] == "completed"
    assert retried.json()["error_message"] is None
    assert retried.json()["generation_version"] == 1
    assert fake_provider.calls == 2

    row = db.scalar(select(MeetingInsight).where(MeetingInsight.interaction_id == interaction["id"]))
    assert row.status == InsightStatus.COMPLETED


def test_not_configured_provider_returns_503(client, make_user, fake_provider):
    _, token, interaction = _setup(client, make_user)
    fake_provider.error = AINotConfiguredError("no key")

    response = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert response.status_code == 503
    assert response.json()["error_code"] == "AI_NOT_CONFIGURED"

    stored = client.get(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert stored.json()["status"] == "failed"


def test_running_insight_conflicts_and_recent_window(client, make_user, db, fake_provider):
    _, token, interaction = _setup(client, make_user)
    url = f"/api/v1/interactions/{interaction['id']}/insights"

    running = MeetingInsight(
        interaction_id=interaction["id"],
        status=InsightStatus.RUNNING,
        notes_version=interaction["notes_version"],
        action_items=[],
        risks=[],
    )
    db.add(running)
    db.commit()

    conflict = client.post(url, headers=auth_headers(token))
    assert conflict.status_code == 409
    assert conflict.json()["error_code"] == "INSIGHT_GENERATION_IN_PROGRESS"
    assert fake_provider.calls == 0

    running.updated_at = utc_now() - timedelta(minutes=3)
    db.commit()
    recovered = client.post(url, headers=auth_headers(token))
    assert recovered.status_code == 200
    assert recovered.json()["status"] == "completed"


def test_lock_contention_returns_conflict(client, make_user, monkeypatch):
    _, token, interaction = _setup(client, make_user)
    monkeypatch.setattr(
        "app.modules.insights.service.acquire_lock",
        lambda *args, **kwargs: False,
    )
    response = client.post(
        f"/api/v1/interactions/{interaction['id']}/insights",
        headers=auth_headers(token),
    )
    assert response.status_code == 409
    assert response.json()["error_code"] == "INSIGHT_GENERATION_IN_PROGRESS"


def test_generated_insight_schema_validation():
    valid = GeneratedInsight.model_validate(
        {
            "summary": "Summary",
            "sentiment": "negative",
            "action_items": [{"description": "Do the thing", "owner": "  "}],
            "risks": [{"description": "Risk", "severity": "high"}],
        }
    )
    assert valid.sentiment == Sentiment.NEGATIVE
    assert valid.action_items[0].owner is None

    with pytest.raises(ValidationError):
        GeneratedInsight.model_validate({"sentiment": "Positive"})

    with pytest.raises(ValidationError):
        GeneratedInsight.model_validate(
            {"summary": "Summary", "sentiment": "unknown"}
        )

    with pytest.raises(ValidationError):
        GeneratedInsight.model_validate(
            {
                "summary": "Summary",
                "sentiment": "positive",
                "risks": [{"description": "Risk", "severity": "critical"}],
            }
        )
