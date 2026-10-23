from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.customers.models import Customer, CustomerStatus
from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.interactions.models import Interaction
from app.utils.models import utc_now


class DashboardService:
    def __init__(self, db: Session):
        self.db = db

    def summary(self) -> dict:
        now = utc_now()
        week_ago = now - timedelta(days=7)

        total_customers = int(
            self.db.scalar(
                select(func.count()).select_from(Customer).where(Customer.deleted_at.is_(None))
            )
            or 0
        )
        active_customers = int(
            self.db.scalar(
                select(func.count())
                .select_from(Customer)
                .where(Customer.deleted_at.is_(None), Customer.status == CustomerStatus.ACTIVE)
            )
            or 0
        )
        at_risk_customers = int(
            self.db.scalar(
                select(func.count())
                .select_from(Customer)
                .where(Customer.deleted_at.is_(None), Customer.status == CustomerStatus.AT_RISK)
            )
            or 0
        )
        prospect_customers = int(
            self.db.scalar(
                select(func.count())
                .select_from(Customer)
                .where(Customer.deleted_at.is_(None), Customer.status == CustomerStatus.PROSPECT)
            )
            or 0
        )
        churned_customers = int(
            self.db.scalar(
                select(func.count())
                .select_from(Customer)
                .where(Customer.deleted_at.is_(None), Customer.status == CustomerStatus.CHURNED)
            )
            or 0
        )

        total_interactions = int(
            self.db.scalar(
                select(func.count())
                .select_from(Interaction)
                .where(Interaction.deleted_at.is_(None))
            )
            or 0
        )
        interactions_last_7_days = int(
            self.db.scalar(
                select(func.count())
                .select_from(Interaction)
                .where(
                    Interaction.deleted_at.is_(None),
                    Interaction.occurred_at >= week_ago,
                )
            )
            or 0
        )

        completed_insights = int(
            self.db.scalar(
                select(func.count())
                .select_from(MeetingInsight)
                .where(MeetingInsight.status == InsightStatus.COMPLETED)
            )
            or 0
        )
        failed_insights = int(
            self.db.scalar(
                select(func.count())
                .select_from(MeetingInsight)
                .where(MeetingInsight.status == InsightStatus.FAILED)
            )
            or 0
        )
        stale_insights = int(
            self.db.scalar(
                select(func.count())
                .select_from(MeetingInsight)
                .where(MeetingInsight.status == InsightStatus.STALE)
            )
            or 0
        )
        open_action_items = int(
            self.db.scalar(
                select(func.coalesce(func.sum(MeetingInsight.action_item_count), 0)).where(
                    MeetingInsight.status == InsightStatus.COMPLETED
                )
            )
            or 0
        )

        by_status_rows = self.db.execute(
            select(Customer.status, func.count())
            .where(Customer.deleted_at.is_(None))
            .group_by(Customer.status)
            .order_by(func.count().desc())
        ).all()
        customers_by_status = [
            {"status": status, "count": int(count)} for status, count in by_status_rows
        ]

        sentiment_rows = self.db.execute(
            select(MeetingInsight.sentiment, func.count())
            .where(MeetingInsight.status == InsightStatus.COMPLETED)
            .group_by(MeetingInsight.sentiment)
        ).all()
        sentiment_distribution = [
            {"sentiment": sentiment.value if sentiment else "Unknown", "count": int(count)}
            for sentiment, count in sentiment_rows
        ]

        recent_rows = self.db.execute(
            select(Interaction, Customer.name)
            .join(Customer, Customer.id == Interaction.customer_id)
            .where(Interaction.deleted_at.is_(None))
            .order_by(Interaction.occurred_at.desc())
            .limit(8)
        ).all()
        recent_interactions = []
        for interaction, customer_name in recent_rows:
            has_insight = interaction.insight is not None
            recent_interactions.append(
                {
                    "id": interaction.id,
                    "title": interaction.title,
                    "type": interaction.type.value,
                    "occurred_at": interaction.occurred_at,
                    "customer_id": interaction.customer_id,
                    "customer_name": customer_name,
                    "has_insight": has_insight,
                }
            )

        at_risk_rows = self.db.execute(
            select(Customer)
            .where(
                Customer.deleted_at.is_(None),
                Customer.status.in_([CustomerStatus.AT_RISK, CustomerStatus.ONBOARDING]),
            )
            .order_by(Customer.health_score.asc().nulls_last(), Customer.updated_at.desc())
            .limit(8)
        ).scalars().all()
        at_risk_list = []
        for customer in at_risk_rows:
            manager_name = (
                customer.assigned_manager.name if customer.assigned_manager else None
            )
            at_risk_list.append(
                {
                    "id": customer.id,
                    "name": customer.name,
                    "status": customer.status,
                    "health_score": customer.health_score,
                    "assigned_manager": manager_name,
                }
            )

        return {
            "total_customers": total_customers,
            "active_customers": active_customers,
            "at_risk_customers": at_risk_customers,
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
