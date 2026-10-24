from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.modules.customers.health import compute_health_score
from app.modules.customers.models import Customer, CustomerStatus
from app.modules.insights.models import InsightStatus, MeetingInsight, Sentiment
from app.modules.interactions.models import Interaction, InteractionType
from app.modules.preferences.models import Preference
from app.modules.users.models import Role

from .conftest import auth_headers, login


def _create_customer_with_insights(db, sentiment_risks):
    customer = Customer(name="Health customer", status=CustomerStatus.AT_RISK)
    db.add(customer)
    db.flush()
    now = datetime.now(timezone.utc)
    for index, (sentiment, risks, status) in enumerate(sentiment_risks):
        interaction = Interaction(
            customer_id=customer.id,
            title=f"Review {index}",
            type=InteractionType.MEETING,
            occurred_at=now - timedelta(minutes=index),
            participants=[],
            external_attendees=[],
        )
        db.add(interaction)
        db.flush()
        db.add(
            MeetingInsight(
                interaction_id=interaction.id,
                status=status,
                sentiment=sentiment,
                risks=[{"description": "risk"} for _ in range(risks)],
                action_items=[],
            )
        )
    db.commit()
    return customer


def _set_window(db, value):
    db.add(Preference(key="health_score_window", value=value))
    db.commit()


def test_preference_defaults_authentication_and_validation(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    manager = make_user("manager@example.com", role=Role.MANAGER)
    admin_token, _ = login(client, admin.email, admin.password)
    manager_token, _ = login(client, manager.email, manager.password)

    assert client.get("/api/v1/preferences").status_code == 401
    for token in (admin_token, manager_token):
        response = client.get("/api/v1/preferences", headers=auth_headers(token))
        assert response.status_code == 200
        assert response.json() == [
            {
                "key": "health_score_window",
                "value": 5,
                "default": 5,
                "min": 1,
                "max": 10,
                "description": (
                    "How many of the most recent AI insights are used to calculate a "
                    "customer's health score"
                ),
            }
        ]

    updated = client.put(
        "/api/v1/preferences/health_score_window",
        json={"value": 3},
        headers=auth_headers(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["value"] == 3
    assert client.put(
        "/api/v1/preferences/health_score_window",
        json={"value": 4},
        headers=auth_headers(manager_token),
    ).status_code == 403
    assert client.put(
        "/api/v1/preferences/unknown",
        json={"value": 4},
        headers=auth_headers(admin_token),
    ).status_code == 404

    for value in (0, 11, "abc", None):
        response = client.put(
            "/api/v1/preferences/health_score_window",
            json={"value": value},
            headers=auth_headers(admin_token),
        )
        assert response.status_code == 422


@pytest.mark.parametrize(
    ("window", "entries", "expected"),
    [
        (
            5,
            [
                (Sentiment.POSITIVE, 2, InsightStatus.COMPLETED),
                (Sentiment.NEUTRAL, 0, InsightStatus.COMPLETED),
                (Sentiment.NEGATIVE, 0, InsightStatus.COMPLETED),
            ],
            (57, 3),
        ),
        (1, [(Sentiment.NEUTRAL, 1, InsightStatus.COMPLETED)], (55, 1)),
        (5, [(Sentiment.NEGATIVE, 4, InsightStatus.COMPLETED)], (0, 1)),
        (
            3,
            [
                (Sentiment.POSITIVE, 0, InsightStatus.COMPLETED),
                (Sentiment.NEGATIVE, 0, InsightStatus.COMPLETED),
                (Sentiment.NEUTRAL, 0, InsightStatus.COMPLETED),
                (Sentiment.NEGATIVE, 0, InsightStatus.FAILED),
            ],
            (67, 3),
        ),
        (10, [(Sentiment.POSITIVE, 0, InsightStatus.COMPLETED)], (100, 1)),
        (5, [], (None, 0)),
    ],
)
def test_health_score_formula_and_sample_size(db, window, entries, expected):
    customer = _create_customer_with_insights(db, entries)
    _set_window(db, window)
    assert compute_health_score(customer.id, db) == expected


def test_window_update_recomputes_scores_timestamp_and_preserves_status(
    client, db, make_user
):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    token, _ = login(client, admin.email, admin.password)
    customer = _create_customer_with_insights(
        db,
        [
            (Sentiment.POSITIVE, 0, InsightStatus.COMPLETED),
            (Sentiment.NEGATIVE, 0, InsightStatus.COMPLETED),
            (Sentiment.NEUTRAL, 0, InsightStatus.COMPLETED),
        ],
    )
    customer.health_score = 1
    customer.health_sample_size = 99
    customer.updated_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
    db.commit()

    response = client.put(
        "/api/v1/preferences/health_score_window",
        json={"value": 1},
        headers=auth_headers(token),
    )
    assert response.status_code == 200, response.text
    db.refresh(customer)
    assert customer.health_score == 100
    assert customer.health_sample_size == 1
    assert customer.updated_at.year > 2020
    assert customer.status == CustomerStatus.AT_RISK
    preference = db.scalar(
        select(Preference).where(Preference.key == "health_score_window")
    )
    assert preference is not None
    assert preference.updated_by == admin.id
    customer_response = client.get(
        f"/api/v1/customers/{customer.id}", headers=auth_headers(token)
    )
    assert customer_response.status_code == 200
    assert customer_response.json()["health_score"] == 100
    assert customer_response.json()["health_sample_size"] == 1
    dashboard = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(token)
    ).json()
    assert dashboard["average_health_score"] == 100.0


def test_default_window_is_used_without_a_preference_row(db):
    customer = _create_customer_with_insights(
        db,
        [(Sentiment.NEUTRAL, 0, InsightStatus.COMPLETED)],
    )
    assert compute_health_score(customer.id, db) == (60, 1)
