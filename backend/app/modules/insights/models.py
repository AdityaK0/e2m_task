from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.utils.models import BaseModel


class Sentiment(str, Enum):
    POSITIVE = "Positive"
    NEUTRAL = "Neutral"
    NEGATIVE = "Negative"


class InsightStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STALE = "stale"


class MeetingInsight(BaseModel):
    """One current insight per interaction.

    ``notes_version`` records which version of the meeting notes produced the
    stored result. Editing notes marks the insight stale; regenerating updates
    this row in place (``generation_version`` increments), avoiding duplicate
    concurrent results and keeping the API simple.
    """

    __tablename__ = "meeting_insights"
    __table_args__ = (
        UniqueConstraint("interaction_id", name="uq_meeting_insights_interaction_id"),
    )

    interaction_id: Mapped[int] = mapped_column(
        ForeignKey("interactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[InsightStatus] = mapped_column(
        SAEnum(
            InsightStatus,
            name="insight_status",
            native_enum=False,
            length=20,
            create_constraint=True,
        ),
        nullable=False,
        default=InsightStatus.PENDING,
        index=True,
    )
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Sentiment | None] = mapped_column(
        SAEnum(
            Sentiment,
            name="insight_sentiment",
            native_enum=False,
            length=20,
            create_constraint=True,
        ),
        nullable=True,
        index=True,
    )
    action_items: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    risks: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    action_item_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    risk_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    notes_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    generation_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    interaction: Mapped["Interaction"] = relationship(back_populates="insight")
