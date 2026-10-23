from datetime import datetime, timezone

from sqlalchemy import DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class BaseModel(Base):
    """Shared primary key and audit timestamps for persisted entities.

    Timestamps are timezone-aware. ``onupdate`` covers ORM-driven updates;
    direct SQL updates should set ``updated_at`` explicitly (documented in
    the README) unless a database trigger is added for that deployment.
    """

    __abstract__ = True

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        server_default=func.now(),
        onupdate=utc_now,
        nullable=False,
    )


class SoftDeleteMixin:
    """Adds a nullable ``deleted_at`` marker. History is retained."""

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
