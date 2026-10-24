from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.modules.auth.schema import (
    AuthorizationConfigResponse,
    ChangePasswordRequest,
    LoginRequest,
    MeResponse,
    MessageResponse,
    RefreshRequest,
    RefreshResponse,
    RoleOption,
    TokenResponse,
    UpdateProfileRequest,
)
from app.modules.auth.service import AuthService
from app.modules.users.models import Role, User
from app.modules.users.schema import UserCreateRequest, UserCredentialsResponse, UserResponse
from app.modules.users.service import UserService

auth_router = APIRouter(prefix="/auth", tags=["Auth"])


@auth_router.get("/config", response_model=AuthorizationConfigResponse)
def auth_config():
    return AuthorizationConfigResponse(
        registration_enabled=False,
        roles=[Role.ADMIN.value, Role.MANAGER.value],
    )


@auth_router.get("/roles", response_model=list[RoleOption])
def role_options():
    return [
        RoleOption(value=Role.ADMIN, label="Administrator"),
        RoleOption(value=Role.MANAGER, label="Manager"),
    ]


@auth_router.post("/register", response_model=UserCredentialsResponse, status_code=201)
def register(
    data: UserCreateRequest,
    response: Response,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    user, password = UserService(db).create_user(data)
    response.headers["Cache-Control"] = "no-store"
    return UserCredentialsResponse(user=UserResponse.model_validate(user), password=password)


@auth_router.post("/login", response_model=TokenResponse)
def login(
    data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    access_token, refresh_token, expires_in, user = AuthService(db).login(
        data.email, data.password
    )
    response.headers["Cache-Control"] = "no-store"
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
        user=UserResponse.model_validate(user),
    )


@auth_router.post("/refresh", response_model=RefreshResponse)
def refresh(
    response: Response,
    data: RefreshRequest | None = None,
    db: Session = Depends(get_db),
):
    access_token, expires_in = AuthService(db).refresh(
        data.refresh_token if data else None
    )
    response.headers["Cache-Control"] = "no-store"
    return RefreshResponse(access_token=access_token, expires_in=expires_in)


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
    return MessageResponse(message="Password changed.")
