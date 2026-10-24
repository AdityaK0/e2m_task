from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Index, Integer, JSON, String, Text, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.utils.models import BaseModel, SoftDeleteMixin


class InteractionType(str, Enum):
    MEETING = "meeting"
    CALL = "call"
    EMAIL = "email"
    OTHER = "other"


class Interaction(BaseModel, SoftDeleteMixin):
    __tablename__ = "interactions"
    __table_args__ = (
        Index("ix_interactions_customer_occurred_at", "customer_id", "occurred_at"),
    )

    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(250), nullable=False)
    type: Mapped[InteractionType] = mapped_column(
        SAEnum(
            InteractionType,
            name="interaction_type",
            native_enum=False,
            length=20,
            create_constraint=True,
        ),
        nullable=False,
        default=InteractionType.MEETING,
        index=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    notes_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    participants: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    external_attendees: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list, server_default=text("'[]'")
    )
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    customer: Mapped["Customer"] = relationship(back_populates="interactions")
    owner: Mapped["User | None"] = relationship(foreign_keys=[owner_id])
    insight: Mapped["MeetingInsight | None"] = relationship(
        back_populates="interaction",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
