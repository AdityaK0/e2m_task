import logging

import jwt
from sqlalchemy.orm import Session

from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.utils.exceptions import AppException
from app.utils.models import utc_now
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    normalize_email,
    validate_password,
    verify_password,
)

logger = logging.getLogger("e2m-insights.auth")


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.users = UserRepository(db)

    def login(self, email: str, password: str) -> tuple[str, str, int, User]:
        email = normalize_email(email)
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            logger.info("login failed email=%s", email)
            raise AppException(
                "Invalid email or password",
                status_code=401,
                error_code="INVALID_CREDENTIALS",
            )
        if not user.is_active:
            raise AppException(
                "This account has been deactivated",
                status_code=403,
                error_code="ACCOUNT_DISABLED",
            )

        user.last_login_at = utc_now()
        self.users.save(user)
        access_token, expires_in = create_access_token(str(user.id))
        refresh_token = create_refresh_token(str(user.id))
        logger.info("login succeeded user_id=%s", user.id)
        return access_token, refresh_token, expires_in, user

    def refresh(self, raw_refresh_token: str | None) -> tuple[str, int]:
        if not raw_refresh_token:
            raise AppException(
                "Refresh token is required",
                status_code=401,
                error_code="INVALID_TOKEN",
            )
        try:
            payload = decode_token(raw_refresh_token)
        except jwt.ExpiredSignatureError as exc:
            raise AppException(
                "Refresh token has expired",
                status_code=401,
                error_code="TOKEN_EXPIRED",
            ) from exc
        except jwt.PyJWTError as exc:
            raise AppException(
                "Invalid refresh token",
                status_code=401,
                error_code="INVALID_TOKEN",
            ) from exc

        if payload.get("type") != "refresh":
            raise AppException(
                "Invalid refresh token",
                status_code=401,
                error_code="INVALID_TOKEN",
            )
        try:
            user_id = int(payload.get("sub"))
        except (TypeError, ValueError):
            raise AppException(
                "Invalid refresh token",
                status_code=401,
                error_code="INVALID_TOKEN",
            )

        user = self.users.get_by_id(user_id)
        if user is None:
            raise AppException(
                "Invalid refresh token",
                status_code=401,
                error_code="INVALID_TOKEN",
            )
        if not user.is_active:
            raise AppException(
                "This account is no longer active",
                status_code=401,
                error_code="ACCOUNT_DISABLED",
            )

        access_token, expires_in = create_access_token(str(user.id))
        logger.info("refresh succeeded user_id=%s", user.id)
        return access_token, expires_in

    def update_profile(self, user: User, name: str) -> User:
        user.name = name.strip()
        return self.users.save(user)

    def change_password(self, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.password_hash):
            raise AppException(
                "Current password is incorrect",
                status_code=400,
                error_code="INVALID_CURRENT_PASSWORD",
            )
        validate_password(new_password)
        user.password_hash = hash_password(new_password)
        user.must_change_password = False
        self.users.save(user)
