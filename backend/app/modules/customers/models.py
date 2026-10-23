from __future__ import annotations

from enum import Enum

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.utils.models import BaseModel, SoftDeleteMixin


class CustomerStatus(str, Enum):
    PROSPECT = "prospect"
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    AT_RISK = "at_risk"
    CHURNED = "churned"


class Customer(BaseModel, SoftDeleteMixin):
    __tablename__ = "customers"
    __table_args__ = (
        CheckConstraint(
            "health_score IS NULL OR (health_score >= 0 AND health_score <= 100)",
            name="ck_customers_health_score_range",
        ),
        Index("ix_customers_status_created_at", "status", "created_at"),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(120), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[CustomerStatus] = mapped_column(
        SAEnum(
            CustomerStatus,
            name="customer_status",
            native_enum=False,
            length=20,
            create_constraint=True,
        ),
        nullable=False,
        default=CustomerStatus.PROSPECT,
        index=True,
    )
    health_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    assigned_manager: Mapped["User | None"] = relationship(foreign_keys=[assigned_manager_id])
    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="customer",
        passive_deletes=True,
    )
