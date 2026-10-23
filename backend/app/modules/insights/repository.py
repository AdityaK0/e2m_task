from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.insights.models import MeetingInsight


class InsightRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_interaction(self, interaction_id: int) -> MeetingInsight | None:
        return self.db.scalar(
            select(MeetingInsight).where(MeetingInsight.interaction_id == interaction_id)
        )

    def create(self, insight: MeetingInsight) -> MeetingInsight:
        self.db.add(insight)
        self.db.commit()
        self.db.refresh(insight)
        return insight

    def save(self, insight: MeetingInsight) -> MeetingInsight:
        self.db.commit()
        self.db.refresh(insight)
        return insight
