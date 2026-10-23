from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.users.models import Role, User
from app.modules.users.schema import (
    MessageResponse,
    UserCreateRequest,
    UserListResponse,
    UserOption,
    UserResponse,
    UserUpdateRequest,
)
from app.modules.users.service import UserService

users_router = APIRouter(prefix="/users", tags=["Users"])


@users_router.get("/options", response_model=list[UserOption])
def list_user_options(
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.CUSTOMERS_READ)),
):
    """Active admins/CSMs for the customer "assigned manager" picker."""
    return UserService(db).list_assignable()


@users_router.get("", response_model=UserListResponse)
def list_users(
    search: str | None = Query(default=None, max_length=120),
    role: Role | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.USERS_READ)),
):
    return UserService(db).list_users(
        search=search,
        role=role,
        is_active=is_active,
        page=page,
        page_size=page_size,
    )


@users_router.post("", response_model=UserResponse, status_code=201)
def create_user(
    data: UserCreateRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.USERS_MANAGE)),
):
    user = UserService(db).create_user(data)
    return UserResponse.model_validate(user)


@users_router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.USERS_READ)),
):
    return UserResponse.model_validate(UserService(db).get_or_404(user_id))


@users_router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.USERS_MANAGE)),
):
    user = UserService(db).update_user(user_id, data, current_user)
    return UserResponse.model_validate(user)


@users_router.post("/{user_id}/revoke-sessions", response_model=MessageResponse)
def revoke_sessions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.USERS_MANAGE)),
):
    count = UserService(db).revoke_sessions(user_id, current_user)
    return MessageResponse(message=f"Revoked {count} active session(s).")
