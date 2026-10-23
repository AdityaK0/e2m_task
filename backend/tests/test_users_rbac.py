from sqlalchemy import select

from app.modules.auth.models import RefreshSession
from app.modules.users.models import Role, User

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
            "password_confirm": "SecurePass123!",
            "role": "admin",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["user"]["role"] == "viewer"
    user = db.scalar(select(User).where(User.email == "sneaky@example.com"))
    assert user.role == Role.VIEWER


def test_role_and_auth_config_endpoints(client):
    roles = client.get("/api/v1/auth/roles")
    assert roles.status_code == 200
    assert [item["value"] for item in roles.json()] == ["admin", "csm", "viewer"]

    config = client.get("/api/v1/auth/config")
    assert config.status_code == 200
    assert config.json() == {
        "registration_enabled": True,
        "roles": ["admin", "csm", "viewer"],
    }


def test_viewer_is_read_only(client, make_user):
    viewer = make_user("viewer@example.com", role=Role.VIEWER)
    csm = make_user("csm@example.com", role=Role.CSM)
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

    checks = [
        ("get", "/api/v1/customers", None),
        ("get", f"/api/v1/customers/{customer['id']}", None),
        ("get", "/api/v1/interactions", None),
        ("get", f"/api/v1/interactions/{interaction['id']}", None),
        ("get", "/api/v1/dashboard/summary", None),
        ("get", "/api/v1/auth/me", None),
    ]
    for method, url, payload in checks:
        kwargs = {"headers": auth_headers(viewer_token)}
        if payload is not None:
            kwargs["json"] = payload
        response = getattr(client, method)(url, **kwargs)
        assert response.status_code == 200, (url, response.text)

    forbidden = [
        ("post", "/api/v1/customers", customer_payload(name="Nope")),
        ("patch", f"/api/v1/customers/{customer['id']}", {"name": "Nope"}),
        ("delete", f"/api/v1/customers/{customer['id']}", None),
        ("post", "/api/v1/interactions", interaction_payload(customer["id"])),
        ("patch", f"/api/v1/interactions/{interaction['id']}", {"title": "Nope"}),
        ("delete", f"/api/v1/interactions/{interaction['id']}", None),
        (
            "post",
            f"/api/v1/interactions/{interaction['id']}/insights",
            None,
        ),
        ("get", "/api/v1/users", None),
        (
            "post",
            "/api/v1/users",
            {
                "name": "Nope",
                "email": "nope@example.com",
                "password": "SecurePass123!",
                "role": "admin",
            },
        ),
        ("patch", f"/api/v1/users/{admin.id}", {"role": "viewer"}),
    ]
    for method, url, payload in forbidden:
        kwargs = {"headers": auth_headers(viewer_token)}
        if payload is not None:
            kwargs["json"] = payload
        response = getattr(client, method)(url, **kwargs)
        assert response.status_code == 403, (method, url, response.text)
        assert response.json()["error_code"] == "FORBIDDEN"


def test_csm_permissions(client, make_user):
    csm = make_user("csm@example.com", role=Role.CSM)
    admin = make_user("admin@example.com", role=Role.ADMIN)
    viewer = make_user("viewer@example.com", role=Role.VIEWER)
    token, _ = login(client, csm.email, csm.password)

    users = client.get("/api/v1/users", headers=auth_headers(token))
    assert users.status_code == 200
    assert users.json()["total"] == 3

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
    assert deleted.status_code == 204

    options = client.get("/api/v1/users/options", headers=auth_headers(token))
    assert options.status_code == 200
    assert [item["role"] for item in options.json()] == ["admin", "csm"]
    assert viewer.id not in {item["id"] for item in options.json()}
    assert admin.id in {item["id"] for item in options.json()}


def test_admin_user_management(client, make_user, db):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    admin_token, _ = login(client, admin.email, admin.password)

    created = client.post(
        "/api/v1/users",
        json={
            "name": "  New CSM  ",
            "email": "NEW.CSM@Example.com",
            "password": "SecurePass123!",
            "role": "csm",
        },
        headers=auth_headers(admin_token),
    )
    assert created.status_code == 201, created.text
    new_user = created.json()
    assert new_user["name"] == "New CSM"
    assert new_user["email"] == "new.csm@example.com"
    assert new_user["role"] == "csm"

    duplicate = client.post(
        "/api/v1/users",
        json={
            "name": "Duplicate",
            "email": "new.csm@example.com",
            "password": "SecurePass123!",
            "role": "viewer",
        },
        headers=auth_headers(admin_token),
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"

    weak = client.post(
        "/api/v1/users",
        json={
            "name": "Weak",
            "email": "weak@example.com",
            "password": "short",
            "role": "viewer",
        },
        headers=auth_headers(admin_token),
    )
    assert weak.status_code == 422

    filtered = client.get(
        "/api/v1/users?role=csm&search=new", headers=auth_headers(admin_token)
    ).json()
    assert filtered["total"] == 1
    assert filtered["items"][0]["id"] == new_user["id"]

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
        json={"role": "viewer"},
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


def test_deactivation_and_session_revocation(client, make_user, db):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target@example.com", role=Role.CSM)
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

    sessions = db.scalars(
        select(RefreshSession).where(RefreshSession.user_id == target.id)
    ).all()
    assert sessions
    assert all(session.revoked_at is not None for session in sessions)


def test_admin_can_revoke_sessions_but_not_own(client, make_user, db):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    target = make_user("target@example.com", role=Role.CSM)
    admin_token, _ = login(client, admin.email, admin.password)
    login(client, target.email, target.password)

    response = client.post(
        f"/api/v1/users/{target.id}/revoke-sessions",
        headers=auth_headers(admin_token),
    )
    assert response.status_code == 200
    assert "Revoked 1 active session(s)." in response.json()["message"]

    sessions = db.scalars(
        select(RefreshSession).where(RefreshSession.user_id == target.id)
    ).all()
    assert all(session.revoked_at is not None for session in sessions)

    own = client.post(
        f"/api/v1/users/{admin.id}/revoke-sessions",
        headers=auth_headers(admin_token),
    )
    assert own.status_code == 409
    assert own.json()["error_code"] == "CANNOT_MODIFY_SELF"


def test_csm_can_read_user_options(client, make_user):
    csm = make_user("csm@example.com", role=Role.CSM)
    token, _ = login(client, csm.email, csm.password)
    options = client.get("/api/v1/users/options", headers=auth_headers(token))
    assert options.status_code == 200


def test_health_and_openapi_expose_api_routes(client):
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    paths = openapi.json()["paths"]
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/customers" in paths
    assert "/api/v1/dashboard/summary" in paths


def test_unknown_route_uses_error_envelope(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert response.json()["error_code"] == "HTTP_404"


def test_logout_all_with_csrf_cookie_set_does_not_affect_access(client, make_user):
    user = make_user("csrf@example.com", role=Role.VIEWER)
    token, _ = login(client, user.email, user.password)
    # CSRF applies only to cookie-authenticated auth mutations, not bearer APIs.
    client.cookies.set(
        "csrf_token", "random", domain="testserver.local", path="/"
    )
    response = client.post("/api/v1/auth/logout-all", headers=auth_headers(token))
    assert response.status_code == 200
    assert (
        client.cookies.get("csrf_token", domain="testserver.local", path="/")
        == "random"
    )
