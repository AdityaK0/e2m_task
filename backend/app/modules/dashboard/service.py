from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.customers.access import apply_customer_access_filter
from app.modules.customers.models import Customer, CustomerStatus
from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.interactions.models import Interaction
from app.modules.users.models import User
from app.utils.models import utc_now


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def summary(self, user: User) -> dict:
        week_ago = utc_now() - timedelta(days=7)

        def customer_scalar(statement):
            return self.db.scalar(apply_customer_access_filter(statement, user))

        def customer_count(*filters) -> int:
            return int(customer_scalar(
                select(func.count()).select_from(Customer).where(
                    Customer.deleted_at.is_(None), *filters
                )
            ) or 0)

        def interaction_count(*filters) -> int:
            statement = (
                select(func.count()).select_from(Interaction)
                .join(Customer, Customer.id == Interaction.customer_id)
                .where(
                    Interaction.deleted_at.is_(None),
                    Customer.deleted_at.is_(None),
                    *filters,
                )
            )
            return int(customer_scalar(statement) or 0)

        def insight_query(*columns):
            return (
                select(*columns).select_from(MeetingInsight)
                .join(Interaction, Interaction.id == MeetingInsight.interaction_id)
                .join(Customer, Customer.id == Interaction.customer_id)
                .where(Interaction.deleted_at.is_(None), Customer.deleted_at.is_(None))
            )

        def insight_count(status: InsightStatus) -> int:
            return int(customer_scalar(
                select(func.count()).select_from(MeetingInsight)
                .join(Interaction, Interaction.id == MeetingInsight.interaction_id)
                .join(Customer, Customer.id == Interaction.customer_id)
                .where(
                    MeetingInsight.status == status,
                    Interaction.deleted_at.is_(None),
                    Customer.deleted_at.is_(None),
                )
            ) or 0)

        total_customers = customer_count()
        active_customers = customer_count(Customer.status == CustomerStatus.ACTIVE)
        at_risk_customers = customer_count(Customer.status == CustomerStatus.AT_RISK)
        average_health_score = customer_scalar(
            select(func.avg(Customer.health_score)).where(
                Customer.deleted_at.is_(None),
                Customer.health_score.is_not(None),
            )
        )
        prospect_customers = customer_count(Customer.status == CustomerStatus.PROSPECT)
        churned_customers = customer_count(Customer.status == CustomerStatus.CHURNED)
        total_interactions = interaction_count()
        interactions_last_7_days = interaction_count(Interaction.occurred_at >= week_ago)

        completed_insights = insight_count(InsightStatus.COMPLETED)
        failed_insights = insight_count(InsightStatus.FAILED)
        stale_insights = insight_count(InsightStatus.STALE)
        open_action_items = int(customer_scalar(
            select(func.coalesce(func.sum(MeetingInsight.action_item_count), 0))
            .select_from(MeetingInsight)
            .join(Interaction, Interaction.id == MeetingInsight.interaction_id)
            .join(Customer, Customer.id == Interaction.customer_id)
            .where(
                MeetingInsight.status == InsightStatus.COMPLETED,
                Interaction.deleted_at.is_(None),
                Customer.deleted_at.is_(None),
            )
        ) or 0)

        status_statement = apply_customer_access_filter(
            select(Customer.status, func.count())
            .where(Customer.deleted_at.is_(None))
            .group_by(Customer.status)
            .order_by(func.count().desc()),
            user,
        )
        customers_by_status = [
            {"status": status, "count": int(count)}
            for status, count in self.db.execute(status_statement).all()
        ]

        sentiment_statement = insight_query(
            MeetingInsight.sentiment, func.count()
        ).where(MeetingInsight.status == InsightStatus.COMPLETED).group_by(
            MeetingInsight.sentiment
        )
        sentiment_rows = self.db.execute(
            apply_customer_access_filter(sentiment_statement, user)
        ).all()
        sentiment_distribution = [
            {"sentiment": sentiment.value if sentiment else "Unknown", "count": int(count)}
            for sentiment, count in sentiment_rows
        ]

        recent_statement = (
            select(Interaction, Customer.name)
            .join(Customer, Customer.id == Interaction.customer_id)
            .where(
                Interaction.deleted_at.is_(None),
                Customer.deleted_at.is_(None),
            )
            .order_by(Interaction.occurred_at.desc())
            .limit(8)
        )
        recent_rows = self.db.execute(
            apply_customer_access_filter(recent_statement, user)
        ).all()
        recent_interactions = [
            {
                "id": interaction.id,
                "title": interaction.title,
                "type": interaction.type.value,
                "occurred_at": interaction.occurred_at,
                "customer_id": interaction.customer_id,
                "customer_name": customer_name,
                "has_insight": interaction.insight is not None,
            }
            for interaction, customer_name in recent_rows
        ]

        at_risk_statement = apply_customer_access_filter(
            select(Customer)
            .where(
                Customer.deleted_at.is_(None),
                Customer.status.in_([CustomerStatus.AT_RISK, CustomerStatus.ONBOARDING]),
            )
            .order_by(Customer.health_score.asc().nulls_last(), Customer.updated_at.desc())
            .limit(8),
            user,
        )
        at_risk_rows = self.db.scalars(at_risk_statement).all()
        at_risk_list = [
            {
                "id": customer.id,
                "name": customer.name,
                "status": customer.status,
                "health_score": customer.health_score,
                "health_sample_size": customer.health_sample_size,
                "assigned_manager": (
                    customer.manager_assignments[0].manager.name
                    if customer.manager_assignments else None
                ),
            }
            for customer in at_risk_rows
        ]

        return {
            "total_customers": total_customers,
            "active_customers": active_customers,
            "at_risk_customers": at_risk_customers,
            "average_health_score": (
                round(float(average_health_score), 1)
                if average_health_score is not None
                else None
            ),
            "prospect_customers": prospect_customers,
            "churned_customers": churned_customers,
            "total_interactions": total_interactions,
            "interactions_last_7_days": interactions_last_7_days,
            "completed_insights": completed_insights,
            "failed_insights": failed_insights,
            "stale_insights": stale_insights,
            "open_action_items": open_action_items,
            "customers_by_status": customers_by_status,
            "sentiment_distribution": sentiment_distribution,
            "recent_interactions": recent_interactions,
            "at_risk_list": at_risk_list,
            "insights_needing_review": stale_insights + failed_insights,
        }
