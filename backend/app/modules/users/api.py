from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.modules.users.models import Role, User
from app.modules.users.schema import (
    UserCreateRequest,
    UserListResponse,
    UserOption,
    UserResponse,
    UserUpdateRequest,
    RoleUpdateRequest,
    UserCredentialsResponse,
)
from app.modules.users.service import UserService
from app.utils.exceptions import AppException

users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("/options", response_model=list[UserOption])
def list_user_options(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Active users available for interaction participants."""
    return UserService(db).list_active_options()


@users_router.get("/manager-options", response_model=list[UserOption])
def list_manager_options(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    """Active managers available for customer assignment."""
    return UserService(db).list_assignable()


@users_router.get("", response_model=UserListResponse)
def list_users(
    search: str | None = Query(default=None, max_length=120),
    role: Role | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return UserService(db).list_users(
        search=search,
        role=role,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )


@users_router.post("", response_model=UserCredentialsResponse, status_code=201)
def create_user(
    data: UserCreateRequest,
    response: Response,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    user, password = UserService(db).create_user(data)
    response.headers["Cache-Control"] = "no-store"
    return UserCredentialsResponse(user=UserResponse.model_validate(user), password=password)


@users_router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return UserResponse.model_validate(UserService(db).get_or_404(user_id))


@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    user = UserService(db).update_user(user_id, data, current_user)
    return UserResponse.model_validate(user)


@users_router.patch("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    data: RoleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return UserResponse.model_validate(
        UserService(db).update_user(user_id, UserUpdateRequest(role=data.role), current_user)
    )


@users_router.patch("/{user_id}/active", response_model=UserResponse)
def update_user_active(
    user_id: int,
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    if data.is_active is None:
        raise AppException(
            "is_active is required",
            status_code=422,
            error_code="VALIDATION_ERROR",
        )
    return UserResponse.model_validate(
        UserService(db).update_user(user_id, UserUpdateRequest(is_active=data.is_active), current_user)
    )


@users_router.post("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return UserResponse.model_validate(
        UserService(db).update_user(user_id, UserUpdateRequest(is_active=False), current_user)
    )


@users_router.post("/{user_id}/reactivate", response_model=UserResponse)
def reactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return UserResponse.model_validate(
        UserService(db).update_user(user_id, UserUpdateRequest(is_active=True), current_user)
    )


@users_router.post("/{user_id}/reset-password", response_model=UserCredentialsResponse)
def reset_user_password(
    user_id: int,
    response: Response,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_roles(Role.ADMIN)),
):
    user, password = UserService(db).reset_password(user_id)
    response.headers["Cache-Control"] = "no-store"
    return UserCredentialsResponse(user=UserResponse.model_validate(user), password=password)
