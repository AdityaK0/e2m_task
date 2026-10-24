from datetime import datetime, timedelta, timezone

import jwt
import pytest
from sqlalchemy import select

from app.config import Settings, settings
from app.modules.users.models import Role, User
from app.utils.security import hash_password, verify_password

from .conftest import auth_headers, login


def test_production_rejects_example_jwt_secret():
    with pytest.raises(ValueError, match="strong, unique JWT_SECRET_KEY"):
        Settings(
            APP_ENV="production",
            JWT_SECRET_KEY="replace-this-with-a-unique-random-secret-of-at-least-32-characters",
        )


def tamper_token(token: str) -> str:
    header, payload, signature = token.split(".")
    replacement = "A" if signature[0] != "A" else "B"
    return ".".join((header, payload, replacement + signature[1:]))


def test_unauthenticated_register_is_rejected(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "  New User  ",
            "email": "NEW.USER@Example.com",
            "password": "SecurePass123!",
            "role": "manager",
        },
    )
    assert response.status_code == 401


def test_register_creates_user_for_admin(client, make_user, db, caplog):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    token, _ = login(client, admin.email, admin.password)
    response = client.post(
        "/api/v1/auth/register",
        headers=auth_headers(token),
        json={
            "name": "  New User  ",
            "email": "NEW.USER@Example.com",
            "password": "SecurePass123!",
            "role": "manager",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["password"] == "SecurePass123!"
    assert body["user"]["name"] == "New User"
    assert body["user"]["email"] == "new.user@example.com"
    assert body["user"]["role"] == "manager"
    assert body["user"]["must_change_password"] is True
    assert response.headers["cache-control"] == "no-store"
    assert "SecurePass123!" not in caplog.text

    user = db.scalar(select(User).where(User.email == "new.user@example.com"))
    assert user is not None
    assert user.role == Role.MANAGER
    assert user.password_hash != "SecurePass123!"
    assert verify_password("SecurePass123!", user.password_hash)


def test_register_duplicate_email_is_conflict(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    token, _ = login(client, admin.email, admin.password)
    payload = {
        "name": "First",
        "email": "duplicate@example.com",
        "password": "SecurePass123!",
        "role": "manager",
    }
    headers = auth_headers(token)
    assert client.post("/api/v1/auth/register", json=payload, headers=headers).status_code == 201
    response = client.post(
        "/api/v1/auth/register",
        json={**payload, "email": "DUPLICATE@example.com"},
        headers=headers,
    )
    assert response.status_code == 409
    assert response.json()["error_code"] == "EMAIL_ALREADY_REGISTERED"


def test_register_validation_errors_are_structured(client, make_user):
    admin = make_user("admin@example.com", role=Role.ADMIN)
    token, _ = login(client, admin.email, admin.password)
    response = client.post(
        "/api/v1/auth/register",
        headers=auth_headers(token),
        json={
            "name": "",
            "email": "not-an-email",
            "password": "short",
            "role": "manager",
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


def test_non_admin_cannot_register(client, make_user):
    manager = make_user("manager@example.com", role=Role.MANAGER)
    token, _ = login(client, manager.email, manager.password)
    response = client.post(
        "/api/v1/auth/register",
        headers=auth_headers(token),
        json={
            "name": "No access",
            "email": "no-access@example.com",
            "password": "SecurePass123!",
            "role": "admin",
        },
    )
    assert response.status_code == 403
    assert response.json()["error_code"] == "FORBIDDEN"


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


def test_me_requires_valid_token_and_active_user(client, make_user, db):
    user = make_user("me@example.com")
    token, _ = login(client, user.email, user.password)

    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.get(
            "/api/v1/auth/me", headers=auth_headers("not-a-token")
        ).json()["error_code"]
        == "INVALID_TOKEN"
    )

    user_row = db.get(User, user.id)
    user_row.is_active = False
    db.commit()
    response = client.get("/api/v1/auth/me", headers=auth_headers(token))
    assert response.status_code == 401
    assert response.json()["error_code"] == "ACCOUNT_DISABLED"


def test_login_returns_access_and_fixed_lifetime_refresh_tokens(client, make_user):
    user = make_user("tokens@example.com")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    assert login_response.status_code == 200
    body = login_response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert body["user"]["must_change_password"] is True
    assert login_response.headers["cache-control"] == "no-store"
    assert "set-cookie" not in login_response.headers
    assert set(body) == {"access_token", "refresh_token", "token_type", "expires_in", "user"}

    access_payload = jwt.decode(
        body["access_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"]
    )
    refresh_payload = jwt.decode(
        body["refresh_token"], settings.JWT_SECRET_KEY, algorithms=["HS256"]
    )
    assert access_payload["sub"] == str(user.id)
    assert access_payload["type"] == "access"
    assert access_payload["exp"] - access_payload["iat"] == 15 * 60
    assert refresh_payload["sub"] == str(user.id)
    assert refresh_payload["type"] == "refresh"
    assert refresh_payload["exp"] - refresh_payload["iat"] == 7 * 24 * 60 * 60


def test_access_tokens_reject_missing_expired_tampered_and_wrong_type(client, make_user):
    user = make_user("access@example.com")
    tokens, _ = login(client, user.email, user.password)
    login_body = tokens

    assert client.get("/api/v1/auth/me", headers=auth_headers(login_body)).status_code == 200
    missing = client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.json()["error_code"] == "NOT_AUTHENTICATED"

    refresh_token = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    ).json()["refresh_token"]
    wrong_type = client.get("/api/v1/auth/me", headers=auth_headers(refresh_token))
    assert wrong_type.status_code == 401
    assert wrong_type.json()["error_code"] == "INVALID_TOKEN"

    expired = jwt.encode(
        {
            "sub": str(user.id),
            "type": "access",
            "iat": datetime.now(timezone.utc) - timedelta(minutes=20),
            "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    expired_response = client.get("/api/v1/auth/me", headers=auth_headers(expired))
    assert expired_response.status_code == 401
    assert expired_response.json()["error_code"] == "TOKEN_EXPIRED"

    tampered = tamper_token(login_body)
    tampered_response = client.get("/api/v1/auth/me", headers=auth_headers(tampered))
    assert tampered_response.status_code == 401
    assert tampered_response.json()["error_code"] == "INVALID_TOKEN"


def test_refresh_returns_only_access_and_does_not_rotate_or_extend(client, make_user):
    user = make_user("refresh@example.com")
    login_body = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    ).json()
    refresh_token = login_body["refresh_token"]
    original_payload = jwt.decode(
        refresh_token,
        settings.JWT_SECRET_KEY,
        algorithms=["HS256"],
        options={"verify_exp": False},
    )

    first = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    second = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert first.status_code == 200
    assert second.status_code == 200
    assert set(first.json()) == {"access_token", "expires_in"}
    assert first.json()["expires_in"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert client.get(
        "/api/v1/auth/me", headers=auth_headers(first.json()["access_token"])
    ).status_code == 200

    access_as_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": login_body["access_token"]},
    )
    assert access_as_refresh.status_code == 401
    assert access_as_refresh.json()["error_code"] == "INVALID_TOKEN"
    missing_refresh = client.post("/api/v1/auth/refresh", json={})
    assert missing_refresh.status_code == 401
    assert missing_refresh.json()["error_code"] == "INVALID_TOKEN"
    missing_body = client.post("/api/v1/auth/refresh")
    assert missing_body.status_code == 401
    assert missing_body.json()["error_code"] == "INVALID_TOKEN"

    expired = jwt.encode(
        {
            "sub": str(user.id),
            "type": "refresh",
            "iat": datetime.now(timezone.utc) - timedelta(days=8),
            "exp": datetime.now(timezone.utc) - timedelta(days=1),
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    expired_response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": expired}
    )
    assert expired_response.status_code == 401
    assert expired_response.json()["error_code"] == "TOKEN_EXPIRED"
    tampered = tamper_token(refresh_token)
    invalid_response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tampered}
    )
    assert invalid_response.status_code == 401
    assert invalid_response.json()["error_code"] == "INVALID_TOKEN"
    assert original_payload["exp"] - original_payload["iat"] == 7 * 24 * 60 * 60


def test_inactive_user_immediately_loses_access_and_refresh(client, make_user, db):
    user = make_user("disabled@example.com")
    login_body = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    ).json()
    row = db.get(User, user.id)
    row.is_active = False
    db.commit()

    access_response = client.get(
        "/api/v1/auth/me", headers=auth_headers(login_body["access_token"])
    )
    assert access_response.status_code == 401
    assert access_response.json()["error_code"] == "ACCOUNT_DISABLED"
    refresh_response = client.post(
        "/api/v1/auth/refresh", json={"refresh_token": login_body["refresh_token"]}
    )
    assert refresh_response.status_code == 401
    assert refresh_response.json()["error_code"] == "ACCOUNT_DISABLED"


def test_update_profile_and_change_password(client, make_user, db):
    user = make_user("profile@example.com")
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    token = login_response.json()["access_token"]
    refresh_token = login_response.json()["refresh_token"]

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
    db.refresh(db.get(User, user.id))
    assert db.get(User, user.id).must_change_password is False

    # JWTs are not individually revocable; they remain usable until expiry.
    assert client.get("/api/v1/auth/me", headers=auth_headers(token)).status_code == 200
    refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token},
    )
    assert refresh.status_code == 200
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": user.email, "password": user.password},
    )
    assert old_login.status_code == 401
    new_token, _ = login(client, user.email, "NewSecurePass123!")
    assert new_token
    me = client.get("/api/v1/auth/me", headers=auth_headers(new_token))
    assert me.json()["data"]["must_change_password"] is False


def test_password_hash_helpers_are_compatible():
    hashed = hash_password("Password123!")
    assert hashed != "Password123!"
    assert verify_password("Password123!", hashed)
    assert not verify_password("Wrong", hashed)
