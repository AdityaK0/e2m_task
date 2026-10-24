import pytest
from sqlalchemy import select

from app.modules.users.models import Role, User
from app.modules.users.schema import UserUpdateRequest
from app.modules.users.service import UserService
from app.utils.exceptions import AppException
from app.utils.security import verify_password

from .conftest import (
    auth_headers,
    customer_payload,
    interaction_payload,
    login,
)


def test_registration_cannot_self_elevate(client, db):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Sneaky",
            "email": "sneaky@example.com",
            "password": "SecurePass123!",
            "role": "admin",
        },
    )
    assert response.status_code == 401
    assert db.scalar(select(User).where(User.email == "sneaky@example.com")) is None


def test_role_and_auth_config_endpoints(client):
    roles = client.get("/api/v1/auth/roles")
    assert roles.status_code == 200
    assert [item["value"] for item in roles.json()] == ["admin", "manager"]

    config = client.get("/api/v1/auth/config")
    assert config.status_code == 200
    assert config.json() == {
        "registration_enabled": False,
        "roles": ["admin", "manager"],
    }


def test_viewer_is_read_only(client, make_user):
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    csm = make_user("csm@example.com", role=Role.MANAGER)
    admin = make_user("admin@example.com", role=Role.ADMIN)
    viewer_token, _ = login(client, viewer.email, viewer.password)
    csm_token, _ = login(client, csm.email, csm.password)

    customer = client.post(
        "/api/v1/customers",
        json=customer_payload(),
        headers=auth_headers(csm_token),
    ).json()
    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer["id"]),
        headers=auth_headers(csm_token),
    ).json()

    assert client.get("/api/v1/customers", headers=auth_headers(viewer_token)).json()["total"] == 0
    assert client.get(
        f"/api/v1/customers/{customer['id']}", headers=auth_headers(viewer_token)
    ).status_code == 404
    assert client.get(
        f"/api/v1/interactions/{interaction['id']}", headers=auth_headers(viewer_token)
    ).status_code == 404
    assert client.get("/api/v1/dashboard/summary", headers=auth_headers(viewer_token)).json()["total_customers"] == 0
    assert client.get("/api/v1/auth/me", headers=auth_headers(viewer_token)).status_code == 200
    own_customer = client.post(
        "/api/v1/customers",
        json=customer_payload(name="Manager-owned"),
        headers=auth_headers(viewer_token),
    )
    assert own_customer.status_code == 201
    for method, url, payload in [
        ("delete", f"/api/v1/customers/{customer['id']}", None),
        ("get", "/api/v1/users", None),
        ("patch", f"/api/v1/users/{admin.id}", {"role": "manager"}),
    ]:
        kwargs = {"headers": auth_headers(viewer_token)}
        if payload is not None:
            kwargs["json"] = payload
        assert getattr(client, method)(url, **kwargs).status_code == 403
    options = client.get("/api/v1/users/options", headers=auth_headers(viewer_token))
    assert options.status_code == 200
    assert all(set(item) == {"id", "name"} for item in options.json())


def test_csm_permissions(client, make_user):
    csm = make_user("csm@example.com", role=Role.MANAGER)
    admin = make_user("admin@example.com", role=Role.ADMIN)
    viewer = make_user("viewer@example.com", role=Role.MANAGER)
    token, _ = login(client, csm.email, csm.password)

    users = client.get("/api/v1/users", headers=auth_headers(token))
    assert users.status_code == 403

    create_user = client.post(
        "/api/v1/users",
        json={
            "name": "New User",
            "email": "new@example.com",
            "password": "SecurePass123!",
            "role": "viewer",
        },
        headers=auth_headers(token),
    )
    assert create_user.status_code == 403

    customer = client.post(
        "/api/v1/customers",
        json=customer_payload(),
        headers=auth_headers(token),
    )
    assert customer.status_code == 201

    delete_customer = client.delete(
        f"/api/v1/customers/{customer.json()['id']}", headers=auth_headers(token)
    )
    assert delete_customer.status_code == 403

    interaction = client.post(
        "/api/v1/interactions",
        json=interaction_payload(customer.json()["id"]),
        headers=auth_headers(token),
    )
    assert interaction.status_code == 201
    deleted = client.delete(
        f"/api/v1/interactions/{interaction.json()['id']}",
        headers=auth_headers(token),
    )
    assert deleted.status_code == 403

    options = client.get("/api/v1/users/options", headers=auth_headers(token))
    assert options.status_code == 200
    assert all(set(item) == {"id", "name"} for item in options.json())


def test_admin_user_management(client, make_user, db):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    admin_token, _ = login(client, admin.email, admin.password)

    created = client.post(
        "/api/v1/users",
        json={
            "name": "  New CSM  ",
            "email": "NEW.CSM@Example.com",
            "password": "SecurePass123!",
            "role": "manager",
        },
        headers=auth_headers(admin_token),
    )
    assert created.status_code == 201, created.text
    assert created.headers["cache-control"] == "no-store"
    new_user = created.json()["user"]
    assert created.json()["password"] == "SecurePass123!"
    assert new_user["name"] == "New CSM"
    assert new_user["email"] == "new.csm@example.com"
    assert new_user["role"] == "manager"
    assert new_user["must_change_password"] is True

    duplicate = client.post(
        "/api/v1/users",
        json={
            "name": "Duplicate",
            "email": "new.csm@example.com",
            "password": "SecurePass123!",
            "role": "manager",
        },
        headers=auth_headers(admin_token),
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"

    created_admin = client.post(
        "/api/v1/users",
        json={"name": "Second Admin", "email": "SECOND.ADMIN@example.com", "role": "admin"},
        headers=auth_headers(admin_token),
    )
    assert created_admin.status_code == 201
    assert created_admin.json()["user"]["role"] == "admin"
    assert len(created_admin.json()["password"]) >= 32
    assert created_admin.json()["user"]["must_change_password"] is True

    weak = client.post(
        "/api/v1/users",
        json={
            "name": "Weak",
            "email": "weak@example.com",
            "password": "short",
            "role": "manager",
        },
        headers=auth_headers(admin_token),
    )
    assert weak.status_code == 422

    filtered = client.get(
        "/api/v1/users?role=manager&search=new", headers=auth_headers(admin_token)
    ).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["id"] == new_user["id"]
    assert "password" not in filtered["items"][0]
    assert "password_hash" not in filtered["items"][0]
    assert "SecurePass123!" not in str(filtered)
    detail = client.get(
        f"/api/v1/users/{new_user['id']}", headers=auth_headers(admin_token)
    )
    assert detail.status_code == 200
    assert "password" not in detail.json()
    assert "password_hash" not in detail.json()
    assert "SecurePass123!" not in detail.text

    updated = client.patch(
        f"/api/v1/users/{new_user['id']}",
        json={"role": "admin", "name": "Promoted User"},
        headers=auth_headers(admin_token),
    )
    assert updated.status_code == 200
    assert updated.json()["role"] == "admin"
    assert updated.json()["name"] == "Promoted User"

    self_role = client.patch(
        f"/api/v1/users/{admin.id}",
        json={"role": "manager"},
        headers=auth_headers(admin_token),
    )
    assert self_role.status_code == 409
    assert self_role.json()["error_code"] == "CANNOT_MODIFY_SELF"

    self_deactivate = client.patch(
        f"/api/v1/users/{admin.id}",
        json={"is_active": False},
        headers=auth_headers(admin_token),
    )
    assert self_deactivate.status_code == 409

    deactivated = client.patch(
        f"/api/v1/users/{new_user['id']}",
        json={"is_active": False},
        headers=auth_headers(admin_token),
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    row = db.get(User, new_user["id"])
    assert row.is_active is False


def test_deactivation_takes_effect_with_existing_access_token(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target@example.com", role=Role.MANAGER)
    admin_token, _ = login(client, admin.email, admin.password)
    target_token, _ = login(client, target.email, target.password)

    assert (
        client.get("/api/v1/auth/me", headers=auth_headers(target_token)).status_code
        == 200
    )

    deactivate = client.patch(
        f"/api/v1/users/{target.id}",
        json={"is_active": False},
        headers=auth_headers(admin_token),
    )
    assert deactivate.status_code == 200

    assert (
        client.get("/api/v1/auth/me", headers=auth_headers(target_token)).status_code
        == 401
    )

def test_admin_can_deactivate_and_reactivate_user(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target@example.com")
    admin_token, _ = login(client, admin.email, admin.password)
    headers = auth_headers(admin_token)

    deactivated = client.post(f"/api/v1/users/{target.id}/deactivate", headers=headers)
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False

    reactivated = client.post(f"/api/v1/users/{target.id}/reactivate", headers=headers)
    assert reactivated.status_code == 200
    assert reactivated.json()["is_active"] is True


def test_admin_password_reset_is_one_time_and_requires_change(client, make_user, db, caplog):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target@example.com")
    admin_token, _ = login(client, admin.email, admin.password)

    reset = client.post(
        f"/api/v1/users/{target.id}/reset-password",
        headers=auth_headers(admin_token),
    )
    assert reset.status_code == 200
    credentials = reset.json()
    new_password = credentials["password"]
    assert credentials["user"]["must_change_password"] is True
    assert reset.headers["cache-control"] == "no-store"
    assert new_password != target.password
    assert new_password not in caplog.text
    assert verify_password(new_password, db.get(User, target.id).password_hash)

    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": target.email, "password": target.password},
    )
    assert old_login.status_code == 401
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": target.email, "password": new_password},
    )
    assert new_login.status_code == 200
    assert new_login.json()["user"]["must_change_password"] is True


def test_last_active_admin_cannot_be_removed(db, make_user):
    admin = make_user("only-admin@example.com", role=Role.ADMIN)
    non_admin_actor = make_user("actor@example.com", role=Role.MANAGER)

    with pytest.raises(AppException) as error:
        UserService(db).update_user(
            admin.id,
            UserUpdateRequest(is_active=False),
            User(id=non_admin_actor.id, role=Role.MANAGER),
        )
    assert error.value.error_code == "LAST_ADMIN"

    with pytest.raises(AppException) as error:
        UserService(db).update_user(
            admin.id,
            UserUpdateRequest(role=Role.MANAGER),
            User(id=non_admin_actor.id, role=Role.MANAGER),
        )
    assert error.value.error_code == "LAST_ADMIN"


def test_manager_can_read_active_user_options(client, make_user):
    csm = make_user("csm@example.com", role=Role.MANAGER)
    token, _ = login(client, csm.email, csm.password)
    options = client.get("/api/v1/users/options", headers=auth_headers(token))
    assert options.status_code == 200
    assert options.json() == [{"id": csm.id, "name": csm.name}]


def test_health_and_openapi_expose_api_routes(client):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.headers["x-content-type-options"] == "nosniff"

    preflight = client.options(
        "/api/v1/auth/me",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "access-control-allow-credentials" not in preflight.headers

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/logout" not in paths
    assert "/api/v1/auth/logout-all" not in paths
    assert "/api/v1/users/{user_id}/revoke-sessions" not in paths
    assert "/api/v1/customers" in paths
    assert "/api/v1/dashboard/summary" in paths


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert response.json()["error_code"] == "HTTP_404"


def test_role_change_takes_effect_with_existing_access_token(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target-admin@example.com", role=Role.ADMIN)
    admin_token, _ = login(client, admin.email, admin.password)
    target_token, _ = login(client, target.email, target.password)

    demoted = client.patch(
        f"/api/v1/users/{target.id}/role",
        json={"role": "manager"},
        headers=auth_headers(admin_token),
    )
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "manager"

    denied = client.get("/api/v1/users", headers=auth_headers(target_token))
    assert denied.status_code == 403
    assert denied.json()["error_code"] == "FORBIDDEN"
