from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.modules.customers.models import CustomerStatus
from app.modules.users.schema import UserSummary


class CustomerCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    status: CustomerStatus = CustomerStatus.PROSPECT
    manager_ids: list[int] = Field(default_factory=list, max_length=500)
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

    @field_validator("manager_ids")
    @classmethod
    def unique_managers(cls, value: list[int]) -> list[int]:
        if any(manager_id <= 0 for manager_id in value):
            raise ValueError("Manager IDs must be positive")
        if len(value) != len(set(value)):
            raise ValueError("Manager IDs must be unique")
        return value


class CustomerUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = Field(default=None, min_length=1, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    contact_name: str | None = Field(default=None, max_length=160)
    contact_email: EmailStr | None = None
    contact_phone: str | None = Field(default=None, max_length=50)
    industry: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=255)
    status: CustomerStatus | None = None
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
    health_sample_size: int
    assigned_managers: list[UserSummary] = Field(default_factory=list)
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


class ManagerAssignmentRequest(BaseModel):
    manager_id: int = Field(gt=0)


class BulkAssignmentRequest(BaseModel):
    manager_id: int = Field(gt=0)
    customer_ids: list[int] | None = Field(default=None, min_length=1, max_length=5000)
    all: bool | None = None

    @model_validator(mode="after")
    def exactly_one_target(self) -> "BulkAssignmentRequest":
        if (self.customer_ids is None) == (self.all is None):
            raise ValueError("Provide exactly one of customer_ids or all")
        if self.all is False:
            raise ValueError("all must be true when provided")
        if self.customer_ids is not None and len(set(self.customer_ids)) != len(self.customer_ids):
            raise ValueError("Customer IDs must be unique")
        return self


class BulkAssignmentResponse(BaseModel):
    assigned: int = 0
    unassigned: int = 0
    skipped: int
