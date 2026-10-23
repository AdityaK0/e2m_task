from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.customers.access import get_customer_or_404
from app.modules.customers.models import CustomerManager
from app.modules.interactions.models import Interaction
from app.modules.interactions.repository import InteractionRepository
from app.modules.insights.models import InsightStatus
from app.modules.interactions.schema import InteractionCreateRequest, InteractionUpdateRequest
from app.modules.users.models import User
from app.utils.cache import invalidate_dashboard_for
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
        customer = get_customer_or_404(data.customer_id, owner, self.db)
        interaction = Interaction(**data.model_dump(), owner_id=owner.id, notes_version=1)
        self.db.add(interaction)
        self.db.commit()
        self.db.refresh(interaction)
        self._invalidate_customer(customer.id)
        return interaction

    def update(self, interaction_id: int, data: InteractionUpdateRequest, user: User) -> Interaction:
        interaction = self.get_or_404(interaction_id, user)
        affected_customer_ids = {interaction.customer_id}
        payload = data.model_dump(exclude_unset=True)
        if payload.get("customer_id") is not None:
            new_customer = get_customer_or_404(payload["customer_id"], user, self.db)
            affected_customer_ids.add(new_customer.id)

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
        for customer_id in affected_customer_ids:
            self._invalidate_customer(customer_id)
        return interaction

    def delete(self, interaction_id: int, user: User) -> None:
        interaction = self.get_or_404(interaction_id, user)
        customer_id = interaction.customer_id
        from app.utils.models import utc_now
        interaction.deleted_at = utc_now()
        self.db.commit()
        self._invalidate_customer(customer_id)

    def _invalidate_customer(self, customer_id: int) -> None:
        manager_ids = set(
            self.db.scalars(
                select(CustomerManager.manager_id).where(
                    CustomerManager.customer_id == customer_id
                )
            ).all()
        )
        invalidate_dashboard_for(manager_ids)
