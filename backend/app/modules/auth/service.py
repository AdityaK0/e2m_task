import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.modules.auth.models import RefreshSession
from app.modules.auth.repository import SessionRepository
from app.modules.auth.schema import RegisterRequest
from app.modules.users.models import Role, User
from app.modules.users.repository import UserRepository
from app.utils.exceptions import AppException
from app.utils.models import utc_now
from app.utils.rate_limit import login_rate_limiter
from app.utils.security import (
    create_access_token,
    generate_token_secret,
    hash_password,
    hash_token_secret,
    normalize_email,
    validate_password,
    verify_password,
)

logger = logging.getLogger("app.auth")


class AuthService:
    def __init__(
        self,
        db: Session,
        *,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ):
        self.db = db
        self.users = UserRepository(db)
        self.sessions = SessionRepository(db)
        self.ip_address = ip_address
        self.user_agent = (user_agent or "")[:255] or None

    # --- registration / login ------------------------------------------------

    def register(self, data: RegisterRequest) -> tuple[str, int, User, str, datetime]:
        if not settings.ALLOW_REGISTRATION:
            raise AppException(
                "Self-service registration is disabled",
                status_code=403,
                error_code="REGISTRATION_DISABLED",
            )
        email = normalize_email(data.email)
        if self.users.get_by_email(email):
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )
        validate_password(data.password)

        user = User(
            name=data.name,
            email=email,
            password_hash=hash_password(data.password),
            role=Role.VIEWER,
            is_active=True,
        )
        try:
            user = self.users.create(user)
        except IntegrityError:
            self.db.rollback()
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )

        access_token, expires_in = create_access_token(str(user.id))
        refresh_token, session = self._create_session(user)
        logger.info("registration succeeded user_id=%s", user.id)
        return access_token, expires_in, user, refresh_token, session.expires_at

    def login(self, email: str, password: str) -> tuple[str, int, User, str, datetime]:
        email = normalize_email(email)
        login_rate_limiter.check(email, self.ip_address)
        user = self.users.get_by_email(email)
        if user is None or not verify_password(password, user.password_hash):
            login_rate_limiter.record_failure(email, self.ip_address)
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

        login_rate_limiter.clear(email, self.ip_address)
        user.last_login_at = utc_now()
        self.users.save(user)
        access_token, expires_in = create_access_token(str(user.id))
        refresh_token, session = self._create_session(user)
        logger.info("login succeeded user_id=%s", user.id)
        return access_token, expires_in, user, refresh_token, session.expires_at

    # --- refresh rotation / logout ------------------------------------------

    def refresh(self, raw_refresh_token: str | None) -> tuple[str, int, User, str, datetime]:
        if not raw_refresh_token:
            raise self._invalid_refresh()
        token_hash = hash_token_secret(raw_refresh_token)
        session = self.sessions.get_by_hash(token_hash)
        if session is None:
            raise self._invalid_refresh()

        if session.revoked_at is not None:
            # Reuse of a rotated/revoked token: assume compromise and kill the
            # whole token family, including the attacker's new session.
            self.sessions.revoke_family(session.family_id)
            logger.warning("refresh token reuse detected family=%s user_id=%s", session.family_id, session.user_id)
            raise self._invalid_refresh()

        now = utc_now()
        expires_at = self._as_utc(session.expires_at)
        if expires_at <= now:
            self.sessions.revoke_family(session.family_id)
            raise AppException(
                "Your session has expired. Please log in again.",
                status_code=401,
                error_code="SESSION_EXPIRED",
            )

        user = self.users.get_by_id(session.user_id)
        if user is None or not user.is_active:
            self.sessions.revoke_family(session.family_id)
            raise AppException(
                "This account is no longer active",
                status_code=401,
                error_code="ACCOUNT_DISABLED",
            )

        new_raw = generate_token_secret()
        new_session = RefreshSession(
            user_id=user.id,
            token_hash=hash_token_secret(new_raw),
            family_id=session.family_id,
            expires_at=expires_at,
            last_used_at=now,
            user_agent=self.user_agent,
            ip_address=self.ip_address,
        )
        self.db.add(new_session)
        self.db.flush()

        session.revoked_at = now
        session.replaced_by_id = new_session.id
        session.last_used_at = now
        self.db.commit()
        self.db.refresh(new_session)

        access_token, expires_in = create_access_token(str(user.id))
        logger.info("refresh rotated user_id=%s family=%s", user.id, session.family_id)
        return access_token, expires_in, user, new_raw, expires_at

    def logout(self, raw_refresh_token: str | None) -> None:
        if not raw_refresh_token:
            return
        session = self.sessions.get_by_hash(hash_token_secret(raw_refresh_token))
        if session is None:
            return
        self.sessions.revoke_family(session.family_id)
        logger.info("logout user_id=%s family=%s", session.user_id, session.family_id)

    def logout_all(self, user: User) -> int:
        count = self.sessions.revoke_all_for_user(user.id)
        logger.info("logout_all user_id=%s sessions=%s", user.id, count)
        return count

    # --- profile -------------------------------------------------------------

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
        self.users.save(user)
        self.sessions.revoke_all_for_user(user.id)
        logger.info("password changed user_id=%s (all sessions revoked)", user.id)

    # --- helpers -------------------------------------------------------------

    def _create_session(self, user: User) -> tuple[str, RefreshSession]:
        raw = generate_token_secret()
        # Fixed absolute lifetime: rotation never extends this deadline.
        expires_at = utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        session = self.sessions.create(
            RefreshSession(
                user_id=user.id,
                token_hash=hash_token_secret(raw),
                family_id=str(uuid.uuid4()),
                expires_at=expires_at,
                last_used_at=utc_now(),
                user_agent=self.user_agent,
                ip_address=self.ip_address,
            )
        )
        return raw, session

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _invalid_refresh() -> AppException:
        return AppException(
            "Invalid or expired refresh token",
            status_code=401,
            error_code="INVALID_REFRESH_TOKEN",
        )
