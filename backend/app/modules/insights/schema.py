from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.insights.models import InsightStatus, Sentiment


class ActionItem(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    owner: str | None = Field(default=None, max_length=120)
    due_date: date | None = None

    @field_validator("owner")
    @classmethod
    def blank_owner_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class RiskItem(BaseModel):
    description: str = Field(min_length=1, max_length=500)
    severity: Literal["low", "medium", "high"] | None = None


class GeneratedInsight(BaseModel):
    """Validated structured output expected from the AI provider."""

    summary: str = Field(min_length=1, max_length=4000)
    sentiment: Sentiment
    action_items: list[ActionItem] = Field(default_factory=list, max_length=30)
    risks: list[RiskItem] = Field(default_factory=list, max_length=30)

    @field_validator("sentiment", mode="before")
    @classmethod
    def normalize_sentiment(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            for sentiment in Sentiment:
                if sentiment.value.lower() == normalized:
                    return sentiment
        return value


class InsightGenerationRequest(BaseModel):
    force: bool = False


class MeetingInsightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    interaction_id: int
    status: InsightStatus
    summary: str | None
    sentiment: Sentiment | None
    action_items: list[ActionItem]
    risks: list[RiskItem]
    action_item_count: int
    risk_count: int
    notes_version: int
    generation_version: int
    provider: str | None
    model: str | None
    error_message: str | None
    generated_at: datetime | None
    created_at: datetime
    updated_at: datetime
    is_stale: bool = False
