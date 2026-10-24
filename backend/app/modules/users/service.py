import secrets

from sqlalchemy import delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.customers.models import CustomerManager
from app.modules.users.models import Role, User
from app.modules.users.repository import UserRepository
from app.modules.users.schema import UserCreateRequest, UserUpdateRequest
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta
from app.utils.security import hash_password, normalize_email, validate_password

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

    def list_active_options(self) -> list[User]:
        return self.repo.list_active_options()

    def create_user(self, data: UserCreateRequest) -> tuple[User, str]:
        email = normalize_email(data.email)
        if self.repo.get_by_email(email):
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )
        password = data.password or secrets.token_urlsafe(32)
        validate_password(password)
        auto_assign = data.auto_assign_new_customers
        if data.role == Role.ADMIN and auto_assign:
            raise AppException(
                "Auto-assign is available to managers only",
                status_code=400,
                error_code="INVALID_AUTO_ASSIGN_ROLE",
            )
        try:
            user = self.repo.create(
                User(
                    name=data.name,
                    email=email,
                    password_hash=hash_password(password),
                    role=data.role,
                    is_active=True,
                    must_change_password=True,
                    auto_assign_new_customers=auto_assign,
                )
            )
            return user, password
        except IntegrityError:
            self.db.rollback()
            raise AppException(
                "An account with this email already exists",
                status_code=409,
                error_code="EMAIL_ALREADY_REGISTERED",
            )

    def reset_password(self, user_id: int) -> tuple[User, str]:
        user = self.get_or_404(user_id)
        password = secrets.token_urlsafe(32)
        user.password_hash = hash_password(password)
        user.must_change_password = True
        user = self.repo.save(user)
        return user, password

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
        if data.auto_assign_new_customers is not None:
            if target.role == Role.ADMIN and data.auto_assign_new_customers:
                raise AppException(
                    "Auto-assign is available to managers only",
                    status_code=400,
                    error_code="INVALID_AUTO_ASSIGN_ROLE",
                )
            target.auto_assign_new_customers = data.auto_assign_new_customers

        if target.role == Role.ADMIN:
            target.auto_assign_new_customers = False
            self.db.execute(
                delete(CustomerManager).where(CustomerManager.manager_id == target.id)
            )

        target = self.repo.save(target)
        return target
