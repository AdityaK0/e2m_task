from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.customers.access import get_customer_or_404
from app.modules.interactions.models import Interaction
from app.modules.interactions.repository import InteractionRepository
from app.modules.insights.models import InsightStatus
from app.modules.interactions.schema import InteractionCreateRequest, InteractionUpdateRequest
from app.modules.users.models import User
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta


class InteractionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = InteractionRepository(db)

    def get_or_404(self, interaction_id: int, user: User) -> Interaction:
        interaction = self.repo.get_by_id(interaction_id, user)
        if interaction is None:
            raise AppException(
                "Interaction not found", status_code=404, error_code="INTERACTION_NOT_FOUND"
            )
        return interaction

    def list_page(
        self, *, customer_id, interaction_type, date_from, date_to,
        search, sort, page, page_size, user: User,
    ) -> dict:
        if customer_id is not None:
            get_customer_or_404(customer_id, user, self.db)
        items, total = self.repo.list(
            customer_id=customer_id, interaction_type=interaction_type,
            date_from=date_from, date_to=date_to, search=search, sort=sort,
            offset=(page - 1) * page_size, limit=page_size, user=user,
        )
        return {"items": items, **pagination_meta(total, page, page_size)}

    def create(self, data: InteractionCreateRequest, owner: User) -> Interaction:
        get_customer_or_404(data.customer_id, owner, self.db)
        self._validate_participants(data.participants)
        interaction = Interaction(
            **data.model_dump(exclude={"generate_insight"}),
            owner_id=owner.id,
            notes_version=1,
        )
        self.db.add(interaction)
        self.db.commit()
        self.db.refresh(interaction)
        return interaction

    def update(self, interaction_id: int, data: InteractionUpdateRequest, user: User) -> Interaction:
        interaction = self.get_or_404(interaction_id, user)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("customer_id") is not None:
            get_customer_or_404(payload["customer_id"], user, self.db)
        if payload.get("participants") is not None:
            self._validate_participants(payload["participants"])

        notes_changed = "notes" in payload and payload["notes"] != interaction.notes
        for key, value in payload.items():
            setattr(interaction, key, value)
        if notes_changed:
            interaction.notes_version += 1
            insight = interaction.insight
            if insight is not None and insight.status == InsightStatus.COMPLETED:
                insight.status = InsightStatus.STALE
        self.db.commit()
        self.db.refresh(interaction)
        return interaction

    def _validate_participants(self, participant_ids: list[int]) -> None:
        if not participant_ids:
            return
        users = list(
            self.db.scalars(
                select(User).where(
                    User.id.in_(participant_ids),
                    User.is_active.is_(True),
                )
            ).all()
        )
        if {user.id for user in users} != set(participant_ids):
            raise AppException(
                "Participants must be existing active users",
                status_code=400,
                error_code="INVALID_PARTICIPANT",
            )

    def delete(self, interaction_id: int, user: User) -> None:
        interaction = self.get_or_404(interaction_id, user)
        from app.utils.models import utc_now
        interaction.deleted_at = utc_now()
        self.db.commit()
