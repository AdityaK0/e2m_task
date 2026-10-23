import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.auth.repository import SessionRepository
from app.modules.users.models import Role, User
from app.modules.users.repository import UserRepository
from app.modules.users.schema import UserCreateRequest, UserUpdateRequest
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta
from app.utils.security import hash_password, normalize_email, validate_password

logger = logging.getLogger("app.users")


class UserService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = UserRepository(db)

    def get_or_404(self, user_id: int) -> User:
        user = self.repo.get_by_id(user_id)
        if user is None:
            raise AppException("User not found", status_code=404, error_code="USER_NOT_FOUND")
        return user

    def list_users(
        self,
        *,
        search: str | None,
        role: Role | None,
        is_active: bool | None,
        page: int,
        page_size: int,
    ) -> dict:
        items, total = self.repo.list_users(
            search=search,
            role=role,
            is_active=is_active,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return {"items": items, **pagination_meta(total, page, page_size)}

    def list_assignable(self) -> list[User]:
        return self.repo.list_assignable()

    def create_user(self, data: UserCreateRequest) -> User:
        email = normalize_email(data.email)
        if self.repo.get_by_email(email):
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )
        validate_password(data.password)
        try:
            return self.repo.create(
                User(
                    name=data.name,
                    email=email,
                    password_hash=hash_password(data.password),
                    role=data.role,
                    is_active=True,
                )
            )
        except IntegrityError:
            self.db.rollback()
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )

    def update_user(self, target_id: int, data: UserUpdateRequest, actor: User) -> User:
        target = self.get_or_404(target_id)

        changing_role = data.role is not None and data.role != target.role
        changing_active = data.is_active is not None and data.is_active != target.is_active

        if target.id == actor.id and (changing_role or changing_active):
            raise AppException(
                "You cannot change your own role or active status",
                status_code=409,
                error_code="CANNOT_MODIFY_SELF",
            )

        removing_admin = (
            target.role == Role.ADMIN
            and (changing_role and data.role != Role.ADMIN or changing_active and data.is_active is False)
        )
        if removing_admin and self.repo.count_active_admins(exclude_user_id=target.id) == 0:
            raise AppException(
                "At least one active administrator must remain",
                status_code=409,
                error_code="LAST_ADMIN",
            )

        if data.name is not None:
            target.name = data.name
        if data.role is not None:
            target.role = data.role
        if data.is_active is not None:
            target.is_active = data.is_active

        target = self.repo.save(target)

        if data.is_active is False:
            SessionRepository(self.db).revoke_all_for_user(target.id)
            logger.info("user deactivated and sessions revoked user_id=%s", target.id)
        return target

    def revoke_sessions(self, user_id: int, actor: User) -> int:
        if user_id == actor.id:
            raise AppException(
                "Use logout-all to revoke your own sessions",
                status_code=409,
                error_code="CANNOT_MODIFY_SELF",
            )
        self.get_or_404(user_id)
        return SessionRepository(self.db).revoke_all_for_user(user_id)
