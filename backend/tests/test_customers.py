from sqlalchemy import select

from app.modules.customers.models import Customer
from app.modules.users.models import Role

from .conftest import auth_headers, customer_payload, login


def _csm(make_user):
    return make_user("csm@example.com", role=Role.MANAGER, name="Casey Manager")


def _admin(make_user):
    return make_user("admin@example.com", role=Role.ADMIN, name="Admin User")


def test_create_customer_and_detail_counts(client, make_user):
    csm = _csm(make_user)
    token, _ = login(client, csm.email, csm.password)

    response = client.post(
        "/api/v1/customers",
        json=customer_payload(),
        headers=auth_headers(token),
    )
    assert response.status_code == 201, response.text
    customer = response.json()
    assert customer["name"] == "Acme Corp"
    assert customer["status"] == "active"
    assert customer["health_score"] is None
    assert customer["health_sample_size"] == 0
    assert customer["assigned_managers"][0]["id"] == csm.id

    detail = client.get(
        f"/api/v1/customers/{customer['id']}", headers=auth_headers(token)
    )
    assert detail.status_code == 200
    body = detail.json()
    assert body["interaction_count"] == 0
    assert body["insight_count"] == 0
    assert body["last_interaction_at"] is None


def test_customer_list_filters_search_sorting_and_pagination(client, make_user):
    csm = _csm(make_user)
    admin = _admin(make_user)
    token, _ = login(client, csm.email, csm.password)

    names = ["Zephyr", "Alpha", "Meridian", "Beacon", "Cobalt"]
    for index, name in enumerate(names):
        payload = customer_payload(
            name=name,
            contact_email=f"contact{index}@example.com",
            status="at_risk" if index % 2 else "active",
        )
        response = client.post(
            "/api/v1/customers", json=payload, headers=auth_headers(token)
        )
        assert response.status_code == 201, response.text

    response = client.get(
        "/api/v1/customers?sort=name&page=1&page_size=2", headers=auth_headers(token)
    )
    assert response.status_code == 200
    body = response.json()
    assert [item["name"] for item in body["items"]] == ["Alpha", "Beacon"]
    assert body["total"] == 5
    assert body["pages"] == 3
    assert body["page"] == 1
    assert body["page_size"] == 2

    last_page = client.get(
        "/api/v1/customers?sort=name&page=3&page_size=2", headers=auth_headers(token)
    ).json()
    assert [item["name"] for item in last_page["items"]] == ["Zephyr"]

    filtered = client.get(
        "/api/v1/customers?status=at_risk&sort=name",
        headers=auth_headers(token),
    ).json()
    assert [item["name"] for item in filtered["items"]] == ["Alpha", "Beacon"]

    searched = client.get(
        "/api/v1/customers?search=alp", headers=auth_headers(token)
    ).json()
    assert [item["name"] for item in searched["items"]] == ["Alpha"]

    by_manager = client.get(
        f"/api/v1/customers?assigned_manager_id={admin.id}",
        headers=auth_headers(token),
    ).json()
    assert by_manager["items"] == []

    bad_page = client.get(
        "/api/v1/customers?page_size=101", headers=auth_headers(token)
    )
    assert bad_page.status_code == 422
    assert bad_page.json()["error_code"] == "VALIDATION_ERROR"


def test_customer_validation_and_assignment_rules(client, make_user):
    csm = _csm(make_user)
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    token, _ = login(client, csm.email, csm.password)

    manual_score = client.post(
        "/api/v1/customers",
        json=customer_payload(health_score=101),
        headers=auth_headers(token),
    )
    assert manual_score.status_code == 422

    invalid_email = client.post(
        "/api/v1/customers",
        json=customer_payload(contact_email="not-an-email"),
        headers=auth_headers(token),
    )
    assert invalid_email.status_code == 422

    viewer_manager = client.post(
        "/api/v1/customers",
        json=customer_payload(manager_ids=[viewer.id]),
        headers=auth_headers(token),
    )
    assert viewer_manager.status_code == 403
    assert viewer_manager.json()["error_code"] == "FORBIDDEN"

    missing_manager = client.post(
        "/api/v1/customers",
        json=customer_payload(manager_ids=[99999]),
        headers=auth_headers(token),
    )
    assert missing_manager.status_code == 403
    assert missing_manager.json()["error_code"] == "FORBIDDEN"


def test_customer_update_and_viewer_read_access(client, make_user):
    csm = _csm(make_user)
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    csm_token, _ = login(client, csm.email, csm.password)
    viewer_token, _ = login(client, viewer.email, viewer.password)

    created = client.post(
        "/api/v1/customers",
        json=customer_payload(),
        headers=auth_headers(csm_token),
    ).json()

    updated = client.patch(
        f"/api/v1/customers/{created['id']}",
        json={"status": "churned", "notes": "Lost budget"},
        headers=auth_headers(csm_token),
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "churned"
    assert updated.json()["health_score"] is None
    assert updated.json()["notes"] == "Lost budget"

    read = client.get(
        f"/api/v1/customers/{created['id']}", headers=auth_headers(viewer_token)
    )
    assert read.status_code == 404

    forbidden_write = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Viewer Created"),
        headers=auth_headers(viewer_token),
    )
    assert forbidden_write.status_code == 201

    invalid_update = client.patch(
        f"/api/v1/customers/{created['id']}",
        json={"name": "   "},
        headers=auth_headers(csm_token),
    )
    assert invalid_update.status_code == 422

    missing = client.get("/api/v1/customers/99999", headers=auth_headers(csm_token))
    assert missing.status_code == 404
    assert missing.json()["error_code"] == "CUSTOMER_NOT_FOUND"


def test_customer_soft_delete_is_admin_only(client, make_user, db):
    csm = _csm(make_user)
    admin = _admin(make_user)
    csm_token, _ = login(client, csm.email, csm.password)
    admin_token, _ = login(client, admin.email, admin.password)

    created = client.post(
        "/api/v1/customers",
        json=customer_payload(),
        headers=auth_headers(csm_token),
    ).json()

    denied = client.delete(
        f"/api/v1/customers/{created['id']}", headers=auth_headers(csm_token)
    )
    assert denied.status_code == 403

    deleted = client.delete(
        f"/api/v1/customers/{created['id']}", headers=auth_headers(admin_token)
    )
    assert deleted.status_code == 204

    missing = client.get(
        f"/api/v1/customers/{created['id']}", headers=auth_headers(admin_token)
    )
    assert missing.status_code == 404

    row = db.scalar(select(Customer).where(Customer.id == created["id"]))
    assert row is not None
    assert row.deleted_at is not None

    listing = client.get("/api/v1/customers", headers=auth_headers(admin_token)).json()
    assert listing["items"] == []

    second_delete = client.delete(
        f"/api/v1/customers/{created['id']}", headers=auth_headers(admin_token)
    )
    assert second_delete.status_code == 404


def test_customer_list_reflects_committed_customer_mutations(client, make_user):
    csm = _csm(make_user)
    token, _ = login(client, csm.email, csm.password)

    first = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Fresh One"),
        headers=auth_headers(token),
    )
    assert first.status_code == 201

    listing = client.get("/api/v1/customers", headers=auth_headers(token))
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    again = client.get("/api/v1/customers", headers=auth_headers(token)).json()
    assert again["total"] == 1

    second = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Fresh Two", contact_email="two@example.com"),
        headers=auth_headers(token),
    )
    assert second.status_code == 201
    refreshed = client.get("/api/v1/customers", headers=auth_headers(token)).json()
    assert refreshed["total"] == 2

    distinct_filter = client.get(
        "/api/v1/customers?search=Fresh+Two", headers=auth_headers(token)
    )
    assert distinct_filter.status_code == 200
    assert distinct_filter.json()["total"] == 1
