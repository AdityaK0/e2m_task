import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # bcrypt rejects inputs over 72 bytes; a stored hash can never match one.
        return False


def validate_password(password: str) -> None:
    """Checks shared by registration and admin user creation."""
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


def create_access_token(subject: str, extra: dict | None = None) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires_delta = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + expires_delta,
        "type": "access",
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return token, int(expires_delta.total_seconds())


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def generate_token_secret() -> str:
    return secrets.token_urlsafe(48)


def hash_token_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def normalize_email(email: str) -> str:
    return email.strip().lower()
