from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

JWT_ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # bcrypt rejects inputs over 72 bytes; a stored hash can never match one.
        return False


def validate_password(password: str) -> None:
    """Validate password length constraints shared by account operations."""
    from app.utils.exceptions import AppException

    if len(password) < 8:
        raise AppException(
            "Password must be at least 8 characters long",
            status_code=422,
            error_code="WEAK_PASSWORD",
        )
    if len(password.encode("utf-8")) > 72:
        raise AppException(
            "Password must be at most 72 bytes",
            status_code=422,
            error_code="PASSWORD_TOO_LONG",
        )


def _create_token(subject: str, token_type: str, expires_delta: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_delta,
        "type": token_type,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_access_token(subject: str) -> tuple[str, int]:
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    token = _create_token(subject, "access", expires_delta)
    return token, int(expires_delta.total_seconds())


def create_refresh_token(subject: str) -> str:
    expires_delta = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return _create_token(subject, "refresh", expires_delta)


def decode_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.JWT_SECRET_KEY,
        algorithms=[JWT_ALGORITHM],
        options={"require": ["sub", "type", "iat", "exp"]},
    )


def normalize_email(email: str) -> str:
    return email.strip().lower()
