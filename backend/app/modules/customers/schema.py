from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.modules.customers.models import CustomerStatus
from app.modules.users.schema import UserSummary


class CustomerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    status: CustomerStatus = CustomerStatus.PROSPECT
    health_score: int | None = Field(default=None, ge=0, le=100)
    assigned_manager_id: int | None = None
    notes: str | None = Field(default=None, max_length=20000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Customer name is required")
        return value

    @field_validator("contact_email")
    @classmethod
    def empty_email(cls, value: EmailStr | None) -> EmailStr | None:
        return value or None


class CustomerUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    status: CustomerStatus | None = None
    health_score: int | None = Field(default=None, ge=0, le=100)
    assigned_manager_id: int | None = None
    notes: str | None = Field(default=None, max_length=20000)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Customer name cannot be empty")
        return value


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    company: str | None
    contact_name: str | None
    contact_email: EmailStr | None
    contact_phone: str | None
    industry: str | None
    website: str | None
    status: CustomerStatus
    health_score: int | None
    assigned_manager_id: int | None
    assigned_manager: UserSummary | None = None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class CustomerDetailResponse(CustomerResponse):
    interaction_count: int = 0
    last_interaction_at: datetime | None = None
    insight_count: int = 0


class CustomerListResponse(BaseModel):
    items: list[CustomerResponse]
    total: int
    page: int
    page_size: int
    pages: int
