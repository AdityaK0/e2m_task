from datetime import datetime

from pydantic import BaseModel

from app.modules.customers.models import CustomerStatus
from app.modules.insights.models import InsightStatus


class StatusCount(BaseModel):
    status: CustomerStatus
    count: int


class SentimentCount(BaseModel):
    sentiment: str
    count: int


class RecentInteraction(BaseModel):
    id: int
    title: str
    type: str
    occurred_at: datetime
    customer_id: int
    customer_name: str
    has_insight: bool


class AtRiskCustomer(BaseModel):
    id: int
    name: str
    status: CustomerStatus
    health_score: int | None
    assigned_manager: str | None


class DashboardSummary(BaseModel):
    total_customers: int
    active_customers: int
    at_risk_customers: int
    prospect_customers: int
    churned_customers: int
    total_interactions: int
    interactions_last_7_days: int
    completed_insights: int
    failed_insights: int
    stale_insights: int
    open_action_items: int
    customers_by_status: list[StatusCount]
    sentiment_distribution: list[SentimentCount]
    recent_interactions: list[RecentInteraction]
    at_risk_list: list[AtRiskCustomer]
    insights_needing_review: int
