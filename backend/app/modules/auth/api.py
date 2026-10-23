import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.modules.auth.schema import (
    AuthorizationConfigResponse,
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RefreshResponse,
    RegisterRequest,
    RoleOption,
    TokenResponse,
    UpdateProfileRequest,
)
from app.modules.auth.service import AuthService
from app.modules.users.models import Role, User
from app.modules.users.schema import UserResponse
from app.utils.exceptions import AppException
from app.utils.security import generate_csrf_token

REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
REFRESH_COOKIE_PATH = f"{settings.API_V1_PREFIX}/auth"

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


def _get_auth_service(request: Request, db: Session = Depends(get_db)) -> AuthService:
    return AuthService(
        db,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )


def _set_auth_cookies(
    response: Response,
    refresh_token: str,
    csrf_token: str,
    expires_at,
) -> None:
    expires_utc = (
        expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
    )
    max_age = max(1, int((expires_utc - datetime.now(timezone.utc)).total_seconds()))
    # The session deadline is authoritative in the database; the cookie just
    # mirrors it. Both use the same configured cookie attributes.
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        max_age=max_age,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path=REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/",
        domain=settings.COOKIE_DOMAIN,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        domain=settings.COOKIE_DOMAIN,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )
    response.delete_cookie(
        CSRF_COOKIE,
        path="/",
        domain=settings.COOKIE_DOMAIN,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


def _verify_csrf(request: Request) -> None:
    """Double-submit CSRF check for cookie-authenticated auth mutations."""
    cookie_token = request.cookies.get(CSRF_COOKIE)
    header_token = request.headers.get(CSRF_HEADER)
    if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
        raise AppException(
            "CSRF validation failed",
            status_code=403,
            error_code="CSRF_VALIDATION_FAILED",
        )


def _set_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


@auth_router.get("/config", response_model=AuthorizationConfigResponse)
def auth_config():
    return AuthorizationConfigResponse(
        registration_enabled=settings.ALLOW_REGISTRATION,
        roles=[Role.MANAGER.value],
    )


@auth_router.get("/roles", response_model=list[RoleOption])
def role_options():
    return [
        RoleOption(value=Role.MANAGER, label="Manager"),
    ]


@auth_router.post("/register", response_model=TokenResponse, status_code=201)
def register(
    data: RegisterRequest,
    request: Request,
    response: Response,
    service: AuthService = Depends(_get_auth_service),
):
    access_token, expires_in, user, refresh_token, expires_at = service.register(data)
    csrf = generate_csrf_token()
    _set_auth_cookies(response, refresh_token, csrf, expires_at)
    _set_no_store(response)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@auth_router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    request: Request,
    response: Response,
    service: AuthService = Depends(_get_auth_service),
):
    access_token, expires_in, user, refresh_token, expires_at = service.login(
        data.email, data.password
    )
    csrf = generate_csrf_token()
    _set_auth_cookies(response, refresh_token, csrf, expires_at)
    _set_no_store(response)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@auth_router.post("/refresh", response_model=RefreshResponse)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    _verify_csrf(request)
    service = AuthService(
        db,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    access_token, expires_in, user, new_refresh, expires_at = service.refresh(
        request.cookies.get(REFRESH_COOKIE)
    )
    csrf = generate_csrf_token()
    _set_auth_cookies(response, new_refresh, csrf, expires_at)
    _set_no_store(response)
    return RefreshResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@auth_router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    if request.cookies.get(REFRESH_COOKIE):
        _verify_csrf(request)
        AuthService(db).logout(request.cookies.get(REFRESH_COOKIE))
    _clear_auth_cookies(response)
    _set_no_store(response)
    response.status_code = 204
    return response


@auth_router.post("/logout-all", response_model=MessageResponse)
def logout_all(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = AuthService(db).logout_all(current_user)
    return MessageResponse(message=f"Revoked {count} active session(s).")


@auth_router.get("/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user)):
    return MeResponse(data=UserResponse.model_validate(current_user))


@auth_router.patch("/me", response_model=MeResponse)
def update_me(
    data: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = AuthService(db).update_profile(current_user, data.name)
    return MeResponse(data=UserResponse.model_validate(user))


@auth_router.post("/change-password", response_model=MessageResponse)
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuthService(db).change_password(current_user, data.current_password, data.new_password)
    return MessageResponse(
        message="Password changed. All sessions have been revoked; please sign in again."
    )
