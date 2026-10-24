from __future__ import annotations

from enum import Enum

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.utils.models import BaseModel, SoftDeleteMixin


class CustomerStatus(str, Enum):
    PROSPECT = "prospect"
    ONBOARDING = "onboarding"
    ACTIVE = "active"
    AT_RISK = "at_risk"
    CHURNED = "churned"


class CustomerManager(BaseModel):
    __tablename__ = "customer_managers"
    __table_args__ = (
        UniqueConstraint("customer_id", "manager_id", name="uq_customer_manager"),
        Index("ix_customer_managers_customer_id", "customer_id"),
        Index("ix_customer_managers_manager_id", "manager_id"),
    )

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="CASCADE"), nullable=False
    )
    manager_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    assigned_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    customer: Mapped["Customer"] = relationship(back_populates="manager_assignments")
    manager: Mapped["User"] = relationship(
        back_populates="customer_assignments", foreign_keys=[manager_id]
    )
    assigner: Mapped["User | None"] = relationship(foreign_keys=[assigned_by])


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
    health_sample_size: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    manager_assignments: Mapped[list[CustomerManager]] = relationship(
        back_populates="customer", cascade="all, delete-orphan", passive_deletes=True
    )
    interactions: Mapped[list["Interaction"]] = relationship(
        back_populates="customer",
        passive_deletes=True,
    )

    @property
    def assigned_managers(self):
        return [assignment.manager for assignment in self.manager_assignments]
