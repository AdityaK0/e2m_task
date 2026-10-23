from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.interactions.models import InteractionType
from app.modules.users.schema import UserSummary


class CustomerReference(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    company: str | None = None


class InteractionCreateRequest(BaseModel):
    customer_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=250)
    type: InteractionType = InteractionType.MEETING
    occurred_at: datetime
    notes: str | None = Field(default=None, max_length=50000)
    participants: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title is required")
        return value

    @field_validator("occurred_at")
    @classmethod
    def ensure_timezone(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @field_validator("participants")
    @classmethod
    def clean_participants(cls, value: list[str]) -> list[str]:
        cleaned = []
        for participant in value:
            participant = participant.strip()
            if participant:
                if len(participant) > 200:
                    raise ValueError("Participant names must be at most 200 characters")
                cleaned.append(participant)
        return cleaned


class InteractionUpdateRequest(BaseModel):
    customer_id: int | None = Field(default=None, gt=0)
    title: str | None = Field(default=None, min_length=1, max_length=250)
    type: InteractionType | None = None
    occurred_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=50000)
    participants: list[str] | None = Field(default=None, max_length=50)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value

    @field_validator("occurred_at")
    @classmethod
    def ensure_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @field_validator("participants")
    @classmethod
    def clean_participants(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        cleaned = []
        for participant in value:
            participant = participant.strip()
            if participant:
                if len(participant) > 200:
                    raise ValueError("Participant names must be at most 200 characters")
                cleaned.append(participant)
        return cleaned


class InteractionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    customer: CustomerReference
    title: str
    type: InteractionType
    occurred_at: datetime
    notes: str | None
    notes_version: int
    participants: list[str]
    owner_id: int | None
    owner: UserSummary | None = None
    created_at: datetime
    updated_at: datetime


class InteractionListResponse(BaseModel):
    items: list[InteractionResponse]
    total: int
    page: int
    page_size: int
    pages: int


class InteractionDetailResponse(InteractionResponse):
    insight_status: str | None = None
    insight_generated_at: datetime | None = None
