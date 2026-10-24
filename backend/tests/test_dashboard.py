from datetime import datetime, timedelta, timezone

from app.modules.insights.providers.base import LLMProviderError
from app.modules.customers.models import Customer, CustomerManager, CustomerStatus
from app.modules.users.models import Role

from .conftest import (
    auth_headers,
    customer_payload,
    interaction_payload,
    login,
)


def _create_customer(client, token, csm_id, *, name, status):
    response = client.post(
        "/api/v1/customers",
        json=customer_payload(
            name=name,
            status=status,
            contact_email=f"{name.lower().replace(' ', '.')}@example.com",
        ),
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_dashboard_aggregates_and_reads_current_database_state(
    client, make_user, fake_provider, db
):
    csm = make_user("csm@example.com", role=Role.MANAGER, name="Dana Okafor")
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    token, _ = login(client, csm.email, csm.password)
    viewer_token, _ = login(client, viewer.email, viewer.password)
    now = datetime.now(timezone.utc)

    active = _create_customer(
        client, token, csm.id, name="Active Co", status="active"
    )
    at_risk = _create_customer(
        client, token, csm.id, name="At Risk Co", status="at_risk"
    )
    _create_customer(
        client, token, csm.id, name="Prospect Co", status="prospect"
    )
    onboarding = _create_customer(
        client, token, csm.id, name="Onboarding Co", status="onboarding"
    )
    _create_customer(
        client, token, csm.id, name="Churned Co", status="churned"
    )
    other_manager = make_user("other@example.com", role=Role.MANAGER)
    other_customer = Customer(
        name="Other manager customer",
        status=CustomerStatus.ACTIVE,
        health_score=15,
        health_sample_size=1,
    )
    db.add(other_customer)
    db.flush()
    db.add(
        CustomerManager(
            customer_id=other_customer.id,
            manager_id=other_manager.id,
        )
    )
    db.commit()
    other_token, _ = login(client, other_manager.email, other_manager.password)

    recent = client.post(
        "/api/v1/interactions",
        json=interaction_payload(
            active["id"],
            title="Recent review",
            occurred_at=now.isoformat(),
        ),
        headers=auth_headers(token),
    )
    assert recent.status_code == 201
    older = client.post(
        "/api/v1/interactions",
        json=interaction_payload(
            at_risk["id"],
            title="Old escalation",
            type="call",
            occurred_at=(now - timedelta(days=10)).isoformat(),
            notes="The customer is very unhappy about an outage.",
        ),
        headers=auth_headers(token),
    )
    assert older.status_code == 201

    completed = client.post(
        f"/api/v1/interactions/{recent.json()['id']}/insights",
        headers=auth_headers(token),
    )
    assert completed.status_code == 200

    fake_provider.error = LLMProviderError("outage")
    failed = client.post(
        f"/api/v1/interactions/{older.json()['id']}/insights",
        headers=auth_headers(token),
    )
    assert failed.status_code == 502

    summary_response = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(token)
    )
    assert summary_response.status_code == 200, summary_response.text
    summary = summary_response.json()

    assert summary["total_customers"] == 5
    assert summary["active_customers"] == 1
    assert summary["at_risk_customers"] == 1
    assert summary["average_health_score"] == 95.0
    assert summary["prospect_customers"] == 1
    assert summary["churned_customers"] == 1
    assert summary["total_interactions"] == 2
    assert summary["interactions_last_7_days"] == 1
    assert summary["completed_insights"] == 1
    assert summary["failed_insights"] == 1
    assert summary["stale_insights"] == 0
    assert summary["open_action_items"] == 1
    assert summary["insights_needing_review"] == 1

    status_counts = {
        item["status"]: item["count"] for item in summary["customers_by_status"]
    }
    assert status_counts == {
        "active": 1,
        "at_risk": 1,
        "churned": 1,
        "onboarding": 1,
        "prospect": 1,
    }
    assert summary["sentiment_distribution"] == [{"sentiment": "Positive", "count": 1}]
    assert len(summary["recent_interactions"]) == 2
    assert summary["recent_interactions"][0]["title"] == "Recent review"
    assert summary["recent_interactions"][0]["has_insight"] is True
    assert summary["recent_interactions"][1]["has_insight"] is True
    assert {item["id"] for item in summary["at_risk_list"]} == {
        at_risk["id"],
        onboarding["id"],
    }
    assert next(
        item for item in summary["at_risk_list"] if item["id"] == at_risk["id"]
    )["assigned_manager"] == "Dana Okafor"

    viewer_summary = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(viewer_token)
    )
    assert viewer_summary.status_code == 200
    assert viewer_summary.json()["total_customers"] == 0
    assert viewer_summary.json()["average_health_score"] is None
    other_summary = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(other_token)
    ).json()
    assert other_summary["average_health_score"] == 15.0
    admin = make_user("admin@example.com", role=Role.ADMIN)
    admin_token, _ = login(client, admin.email, admin.password)
    admin_summary = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(admin_token)
    ).json()
    assert admin_summary["average_health_score"] == 55.0

    # Dashboard aggregates reflect committed changes on each request.
    updated = client.patch(
        f"/api/v1/customers/{active['id']}",
        json={"status": "churned"},
        headers=auth_headers(token),
    )
    assert updated.status_code == 200
    refreshed = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(token)
    ).json()
    assert refreshed["active_customers"] == 0
    assert refreshed["churned_customers"] == 2


def test_dashboard_requires_authentication(client):
    response = client.get("/api/v1/dashboard/summary")
    assert response.status_code == 401
    assert response.json()["error_code"] == "NOT_AUTHENTICATED"


def test_dashboard_empty_state(client, make_user):
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    token, _ = login(client, viewer.email, viewer.password)
    summary = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(token)
    ).json()
    assert summary["total_customers"] == 0
    assert summary["total_interactions"] == 0
    assert summary["completed_insights"] == 0
    assert summary["customers_by_status"] == []
    assert summary["sentiment_distribution"] == []
    assert summary["recent_interactions"] == []
    assert summary["at_risk_list"] == []
