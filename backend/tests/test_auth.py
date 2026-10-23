from sqlalchemy import select

from app.modules.auth.models import RefreshSession
from app.modules.users.models import Role, User
from app.utils.security import hash_password, verify_password

from .conftest import auth_headers, csrf_headers, login


def test_register_creates_viewer_and_hashes_password(client, db):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "  New User  ",
            "email": "NEW.USER@Example.com",
            "password": "SecurePass123!",
            "password_confirm": "SecurePass123!",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["access_token"]
    assert body["expires_in"] == 15 * 60
    assert body["user"] == {
        "id": body["user"]["id"],
        "name": "New User",
        "email": "new.user@example.com",
        "role": "manager",
        "is_active": True,
        "auto_assign_new_customers": False,
        "last_login_at": None,
        "created_at": body["user"]["created_at"],
    }
    assert "password" not in response.text.lower()

    user = db.scalar(select(User).where(User.email == "new.user@example.com"))
    assert user is not None
    assert user.role == Role.MANAGER
    assert user.password_hash != "SecurePass123!"
    assert verify_password("SecurePass123!", user.password_hash)

    me = client.get("/api/v1/auth/me", headers=auth_headers(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["data"]["email"] == "new.user@example.com"


def test_register_duplicate_email_is_conflict(client):
    payload = {
        "name": "First",
        "email": "duplicate@example.com",
        "password": "SecurePass123!",
        "password_confirm": "SecurePass123!",
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 201
    response = client.post(
        "/api/v1/auth/register", json={**payload, "email": "DUPLICATE@example.com"}
    )
    assert response.status_code == 409
    assert response.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_validation_errors_are_structured(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "",
            "email": "not-an-email",
            "password": "short",
            "password_confirm": "different",
        },
    )
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert body["error_code"] == "VALIDATION_ERROR"
    assert {error["field"] for error in body["errors"]} >= {
        "body.name",
        "body.email",
        "body.password",
    }


def test_registration_can_be_disabled(client, monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "ALLOW_REGISTRATION", False)
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Nope",
            "email": "nope@example.com",
            "password": "SecurePass123!",
            "password_confirm": "SecurePass123!",
        },
    )
    assert response.status_code == 403
    assert response.json()["error_code"] == "REGISTRATION_DISABLED"


def test_login_rejects_bad_credentials_and_inactive_account(client, make_user, db):
    make_user("active@example.com")
    inactive = make_user(
        "inactive@example.com",
        password="Password123!",
        is_active=False,
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "active@example.com", "password": "WrongPass123!"},
    )
    assert response.status_code == 401
    assert response.json()["error_code"] == "INVALID_CREDENTIALS"

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "missing@example.com", "password": "WrongPass123!"},
    )
    assert response.status_code == 401
    assert response.json()["message"] == "Invalid email or password"

    response = client.post(
        "/api/v1/auth/login",
        json={"email": inactive.email, "password": inactive.password},
    )
    assert response.status_code == 403
    assert response.json()["error_code"] == "ACCOUNT_DISABLED"
    assert db.scalar(select(User).where(User.id == inactive.id)).is_active is False


def test_login_rate_limit_returns_429(client, make_user):
    user = make_user("limit@example.com")
    for _ in range(5):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": user.email, "password": "WrongPass123!"},
        )
        assert response.status_code == 401

    response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    assert response.status_code == 429
    assert response.json()["error_code"] == "LOGIN_RATE_LIMITED"
    assert response.json()["retry_after"] >= 1


def test_me_requires_valid_token_and_active_user(client, make_user, db):
    user = make_user("me@example.com")
    token, _ = login(client, user.email, user.password)

    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.get(
            "/api/v1/auth/me", headers=auth_headers("not-a-token")
        ).json()["error_code"]
        == "NOT_AUTHENTICATED"
    )

    user_row = db.get(User, user.id)
    user_row.is_active = False
    db.commit()
    response = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert response.status_code == 401


def test_refresh_rotation_and_reuse_revokes_family(client, make_user, db):
    user = make_user("rotate@example.com")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    assert login_response.status_code == 200
    first_refresh = login_response.cookies.get("refresh_token")
    assert first_refresh

    csrf = csrf_headers(client)
    rotated = client.post("/api/v1/auth/refresh", headers=csrf)
    assert rotated.status_code == 200, rotated.text
    second_refresh = rotated.cookies.get("refresh_token")
    assert second_refresh and second_refresh != first_refresh
    new_access = rotated.json()["access_token"]
    assert client.get("/api/v1/auth/me", headers=auth_headers(new_access)).status_code == 200

    # A request without the CSRF header is rejected before token rotation.
    client.cookies.set("refresh_token", second_refresh, path="/api/v1/auth")
    no_csrf = client.post("/api/v1/auth/refresh")
    assert no_csrf.status_code == 403
    assert no_csrf.json()["error_code"] == "CSRF_VALIDATION_FAILED"

    # Replaying an already-rotated token is treated as compromise.
    client.cookies.set("refresh_token", first_refresh, path="/api/v1/auth")
    reused = client.post("/api/v1/auth/refresh", headers=csrf_headers(client))
    assert reused.status_code == 401
    assert reused.json()["error_code"] == "INVALID_REFRESH_TOKEN"

    # The whole family, including the previously valid second token, is revoked.
    client.cookies.set("refresh_token", second_refresh, path="/api/v1/auth")
    after_reuse = client.post("/api/v1/auth/refresh", headers=csrf_headers(client))
    assert after_reuse.status_code == 401

    sessions = list(db.scalars(select(RefreshSession).where(RefreshSession.user_id == user.id)))
    assert len(sessions) == 2
    assert all(session.revoked_at is not None for session in sessions)


def test_logout_revokes_session_and_clears_cookies(client, make_user, db):
    user = make_user("logout@example.com")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    refresh_token = login_response.cookies.get("refresh_token")

    response = client.post("/api/v1/auth/logout", headers=csrf_headers(client))
    assert response.status_code == 204
    assert client.cookies.get("refresh_token") is None
    assert client.cookies.get("csrf_token") is None

    client.cookies.set("refresh_token", refresh_token, path="/api/v1/auth")
    client.cookies.set("csrf_token", "anything", path="/")
    replay = client.post(
        "/api/v1/auth/refresh", headers={"X-CSRF-Token": "anything"}
    )
    assert replay.status_code == 401

    session = db.scalar(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_not(None),
        )
    )
    assert session is not None


def test_logout_without_refresh_cookie_is_idempotent(client):
    response = client.post("/api/v1/auth/logout")
    assert response.status_code == 204


def test_logout_all_revokes_every_session(client, make_user, db):
    user = make_user("logoutall@example.com")
    login(client, user.email, user.password)
    login(client, user.email, user.password)
    token, _ = login(client, user.email, user.password)

    response = client.post("/api/v1/auth/logout-all", headers=auth_headers(token))
    assert response.status_code == 200
    assert "Revoked 3 active session(s)." in response.json()["message"]
    active = db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
    ).all()
    assert active == []


def test_update_profile_and_change_password(client, make_user, db):
    user = make_user("profile@example.com")
    token, _ = login(client, user.email, user.password)

    response = client.patch(
        "/api/v1/auth/me",
        json={"name": "Updated Name"},
        headers=auth_headers(token),
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Updated Name"

    wrong = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongPass123!", "new_password": "NewSecurePass123!"},
        headers=auth_headers(token),
    )
    assert wrong.status_code == 400
    assert wrong.json()["error_code"] == "INVALID_CURRENT_PASSWORD"

    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": user.password, "new_password": "NewSecurePass123!"},
        headers=auth_headers(token),
    )
    assert changed.status_code == 200

    # Password change revokes refresh sessions; old password no longer works.
    refresh = client.post("/api/v1/auth/refresh", headers=csrf_headers(client))
    assert refresh.status_code == 401
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    assert old_login.status_code == 401
    new_token, _ = login(client, user.email, "NewSecurePass123!")
    assert new_token


def test_expired_refresh_session_is_rejected(client, make_user, db):
    from app.utils.models import utc_now

    user = make_user("expired@example.com")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    raw_refresh = login_response.cookies.get("refresh_token")
    session = db.scalar(select(RefreshSession).where(RefreshSession.user_id == user.id))
    session.expires_at = utc_now()
    db.commit()

    response = client.post("/api/v1/auth/refresh", headers=csrf_headers(client))
    assert response.status_code == 401
    assert response.json()["error_code"] == "SESSION_EXPIRED"


def test_access_token_for_deleted_or_inactive_user_is_rejected(client, make_user, db):
    user = make_user("gone@example.com")
    token, _ = login(client, user.email, user.password)
    row = db.get(User, user.id)
    row.is_active = False
    db.commit()
    assert client.get("/api/v1/auth/me", headers=auth_headers(token)).status_code == 401


def test_old_access_token_type_cannot_be_used_as_refresh(client, make_user):
    from app.utils.security import create_access_token

    user = make_user("type@example.com")
    token, _ = create_access_token(str(user.id))
    # The access token works for bearer auth but is not a refresh cookie.
    assert client.get("/api/v1/auth/me", headers=auth_headers(token)).status_code == 200
    response = client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": "x"},
        cookies={"refresh_token": token, "csrf_token": "x"},
    )
    assert response.status_code == 401


def test_password_hash_helpers_are_compatible():
    hashed = hash_password("Password123!")
    assert hashed != "Password123!"
    assert verify_password("Password123!", hashed)
    assert not verify_password("Wrong", hashed)
