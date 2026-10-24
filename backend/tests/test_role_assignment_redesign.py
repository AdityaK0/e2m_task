from sqlalchemy import select

from app.modules.customers.models import CustomerManager
from app.modules.users.models import Role, User

from .conftest import auth_headers, customer_payload, interaction_payload, login


def _token(client, user):
    return login(client, user.email, user.password)[0]


def test_manager_customer_and_interaction_access_is_assignment_scoped(client, make_user):
    manager = make_user("manager@example.com", role=Role.MANAGER)
    other = make_user("other@example.com", role=Role.MANAGER)
    admin = make_user("admin@example.com", role=Role.ADMIN)
    manager_token = _token(client, manager)
    other_token = _token(client, other)
    admin_token = _token(client, admin)

    created = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Owned customer"),
        headers=auth_headers(manager_token),
    )
    assert created.status_code == 201, created.text
    customer = created.json()
    assert [item["id"] for item in customer["assigned_managers"]] == [manager.id]
    assert client.get("/api/v1/customers", headers=auth_headers(manager_token)).json()["total"] == 1
    assert client.get("/api/v1/customers", headers=auth_headers(other_token)).json()["total"] == 0
    assert client.get(
        f"/api/v1/customers/{customer['id']}", headers=auth_headers(other_token)
    ).status_code == 404
    assert client.get("/api/v1/customers", headers=auth_headers(admin_token)).json()["total"] == 1

    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer["id"]),
        headers=auth_headers(manager_token),
    ).json()
    assert client.get(
        f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(other_token)
    ).status_code == 404
    assert client.patch(
        f"/api/v1/interactions/{interaction['id']}",
        json={"title": "No access"},
        headers=auth_headers(other_token),
    ).status_code == 404
    assert client.get(
        f"/api/v1/interactions?customer_id={customer['id']}",
        headers=auth_headers(other_token),
    ).status_code == 404
    assert client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer["id"]),
        headers=auth_headers(other_token),
    ).status_code == 404
    assert client.patch(
        f"/api/v1/customers/{customer['id']}",
        json={"name": "No access"},
        headers=auth_headers(other_token),
    ).status_code == 404


def test_admin_creation_auto_assigns_only_opted_in_managers_synchronously(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    opted_in = make_user("on@example.com", role=Role.MANAGER)
    opted_out = make_user("off@example.com", role=Role.MANAGER)
    admin_token = _token(client, admin)
    assert client.patch(
        f"/api/v1/users/{opted_in.id}",
        json={"auto_assign_new_customers": True},
        headers=auth_headers(admin_token),
    ).status_code == 200

    created = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Auto customer"),
        headers=auth_headers(admin_token),
    )
    assert created.status_code == 201, created.text
    assert [item["id"] for item in created.json()["assigned_managers"]] == [opted_in.id]

    opted_in_token = _token(client, opted_in)
    opted_out_token = _token(client, opted_out)
    assert client.get(
        "/api/v1/customers", headers=auth_headers(opted_in_token)
    ).json()["total"] == 1
    assert client.get(
        "/api/v1/customers", headers=auth_headers(opted_out_token)
    ).json()["total"] == 0


def test_admin_bulk_assign_unassign_is_idempotent_and_validates_ids(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    manager = make_user("manager@example.com", role=Role.MANAGER)
    manager2 = make_user("manager2@example.com", role=Role.MANAGER)
    admin_token = _token(client, admin)
    customers = [
        client.post(
            "/api/v1/customers",
            json=customer_payload(name=f"Customer {number}"),
            headers=auth_headers(admin_token),
        ).json()
        for number in range(2)
    ]
    ids = [item["id"] for item in customers]

    path = "/api/v1/customers/assignments"
    first = client.post(
        path, json={"manager_id": manager.id, "customer_ids": ids},
        headers=auth_headers(admin_token),
    )
    assert first.status_code == 200
    assert first.json() == {"assigned": 2, "unassigned": 0, "skipped": 0}
    repeated = client.post(
        path, json={"manager_id": manager.id, "customer_ids": ids},
        headers=auth_headers(admin_token),
    )
    assert repeated.json()["assigned"] == 0
    assert repeated.json()["skipped"] == 2

    all_result = client.post(
        path, json={"manager_id": manager2.id, "all": True},
        headers=auth_headers(admin_token),
    )
    assert all_result.json()["assigned"] == 2
    assert client.post(
        path, json={"manager_id": manager2.id},
        headers=auth_headers(admin_token),
    ).status_code == 422
    assert client.post(
        path, json={"manager_id": manager.id, "all": True, "customer_ids": ids},
        headers=auth_headers(admin_token),
    ).status_code == 422
    assert client.post(
        path, json={"manager_id": manager.id, "customer_ids": [99999]},
        headers=auth_headers(admin_token),
    ).status_code == 422

    removed = client.request(
        "DELETE", path, json={"manager_id": manager.id, "customer_ids": ids},
        headers=auth_headers(admin_token),
    )
    assert removed.status_code == 200
    assert removed.json()["unassigned"] == 2
    assert removed.json()["skipped"] == 0


def test_manager_cannot_manage_assignments_and_admin_role_change_clears_rows(
    client, make_user, db
):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    manager = make_user("manager@example.com", role=Role.MANAGER)
    admin_token = _token(client, admin)
    manager_token = _token(client, manager)
    customer = client.post(
        "/api/v1/customers", json=customer_payload(), headers=auth_headers(manager_token)
    ).json()

    assert client.post(
        f"/api/v1/customers/{customer['id']}/managers",
        json={"manager_id": manager.id},
        headers=auth_headers(manager_token),
    ).status_code == 403
    promoted = client.patch(
        f"/api/v1/users/{manager.id}/role",
        json={"role": "admin"},
        headers=auth_headers(admin_token),
    )
    assert promoted.status_code == 200
    assert promoted.json()["auto_assign_new_customers"] is False
    assert db.scalars(
        select(CustomerManager).where(CustomerManager.manager_id == manager.id)
    ).all() == []

    assert client.patch(
        f"/api/v1/users/{admin.id}/role",
        json={"role": "manager"},
        headers=auth_headers(admin_token),
    ).status_code == 409
    assert client.patch(
        f"/api/v1/users/{admin.id}",
        json={"is_active": False},
        headers=auth_headers(admin_token),
    ).status_code == 409


def test_dashboard_reads_current_assignment_and_customer_state(client, make_user):
    manager = make_user("manager@example.com", role=Role.MANAGER)
    admin = make_user("admin@example.com", role=Role.ADMIN)
    manager_token = _token(client, manager)
    admin_token = _token(client, admin)
    created = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Fresh dashboard customer"),
        headers=auth_headers(manager_token),
    )
    assert created.status_code == 201
    refreshed = client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(manager_token)
    )
    assert refreshed.json()["total_customers"] == 1
    assert client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(admin_token)
    ).json()["total_customers"] == 1

    assert client.delete(
        f"/api/v1/customers/{created.json()['id']}", headers=auth_headers(admin_token)
    ).status_code == 204
    assert client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(admin_token)
    ).json()["total_customers"] == 0

    unassigned = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Assignment dashboard customer"),
        headers=auth_headers(admin_token),
    )
    customer_id = unassigned.json()["id"]
    assignment_path = "/api/v1/customers/assignments"

    assigned = client.post(
        assignment_path,
        json={"manager_id": manager.id, "customer_ids": [customer_id]},
        headers=auth_headers(admin_token),
    )
    assert assigned.json()["assigned"] == 1
    assert client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(manager_token)
    ).json()["total_customers"] == 1

    unassigned_result = client.request(
        "DELETE",
        assignment_path,
        json={"manager_id": manager.id, "customer_ids": [customer_id]},
        headers=auth_headers(admin_token),
    )
    assert unassigned_result.json()["unassigned"] == 1
    assert client.get(
        "/api/v1/dashboard/summary", headers=auth_headers(manager_token)
    ).json()["total_customers"] == 0
