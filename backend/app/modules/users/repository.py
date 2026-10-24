from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.modules.users.models import Role, User


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def create(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def save(self, user: User) -> User:
        self.db.commit()
        self.db.refresh(user)
        return user

    def get_by_id(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.scalar(select(User).where(User.email == email))

    def list_users(
        self,
        *,
        search: str | None,
        role: Role | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[list[User], int]:
        filters = []
        if search:
            like = f"%{search.strip()}%"
            filters.append(or_(User.name.ilike(like), User.email.ilike(like)))
        if role is not None:
            filters.append(User.role == role)
        if is_active is not None:
            filters.append(User.is_active == is_active)

        base = select(User)
        count_q = select(func.count()).select_from(User)
        if filters:
            base = base.where(*filters)
            count_q = count_q.where(*filters)

        total = int(self.db.scalar(count_q) or 0)
        items = list(
            self.db.scalars(base.order_by(User.created_at.desc()).offset(offset).limit(limit)).all()
        )
        return items, total

    def list_assignable(self) -> list[User]:
        return list(
            self.db.scalars(
                select(User)
                .where(
                    User.is_active.is_(True),
                    User.role == Role.MANAGER,
                )
                .order_by(User.name.asc())
            ).all()
        )

    def list_active_options(self) -> list[User]:
        return list(
            self.db.scalars(
                select(User)
                .where(User.is_active.is_(True))
                .order_by(User.created_at.desc(), User.id.desc())
            ).all()
        )

    def count_active_admins(self, exclude_user_id: int | None = None) -> int:
        q = select(func.count()).select_from(User).where(
            User.role == Role.ADMIN, User.is_active.is_(True)
        )
        if exclude_user_id is not None:
            q = q.where(User.id != exclude_user_id)
        return int(self.db.scalar(q) or 0)
