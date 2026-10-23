from sqlalchemy.orm import Session

from app.modules.customers.repository import CustomerRepository
from app.modules.interactions.models import Interaction
from app.modules.interactions.repository import InteractionRepository
from app.modules.insights.models import InsightStatus
from app.modules.interactions.schema import (
    InteractionCreateRequest,
    InteractionUpdateRequest,
)
from app.modules.users.models import User
from app.utils.cache import invalidate_catalog
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta


class InteractionService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = InteractionRepository(db)
        self.customers = CustomerRepository(db)

    def get_or_404(self, interaction_id: int) -> Interaction:
        interaction = self.repo.get_by_id(interaction_id)
        if interaction is None:
            raise AppException(
                "Interaction not found",
                status_code=404,
                error_code="INTERACTION_NOT_FOUND",
            )
        return interaction

    def list_page(
        self,
        *,
        customer_id: int | None,
        interaction_type,
        date_from,
        date_to,
        search: str | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> dict:
        items, total = self.repo.list(
            customer_id=customer_id,
            interaction_type=interaction_type,
            date_from=date_from,
            date_to=date_to,
            search=search,
            sort=sort,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return {"items": items, **pagination_meta(total, page, page_size)}

    def create(self, data: InteractionCreateRequest, owner: User) -> Interaction:
        customer = self.customers.get_by_id(data.customer_id)
        if customer is None:
            raise AppException(
                "Customer not found", status_code=404, error_code="CUSTOMER_NOT_FOUND"
            )
        interaction = Interaction(
            **data.model_dump(),
            owner_id=owner.id,
            notes_version=1,
        )
        interaction = self.repo.create(interaction)
        invalidate_catalog()
        return interaction

    def update(self, interaction_id: int, data: InteractionUpdateRequest) -> Interaction:
        interaction = self.get_or_404(interaction_id)
        payload = data.model_dump(exclude_unset=True)
        if "customer_id" in payload:
            customer = self.customers.get_by_id(payload["customer_id"])
            if customer is None:
                raise AppException(
                    "Customer not found",
                    status_code=404,
                    error_code="CUSTOMER_NOT_FOUND",
                )

        notes_changed = "notes" in payload and payload["notes"] != interaction.notes
        for key, value in payload.items():
            setattr(interaction, key, value)
        if notes_changed:
            interaction.notes_version += 1
            # The existing insight becomes stale when notes change; the service
            # layer of insights keeps the row but marks status stale on write.
            insight = interaction.insight
            if insight is not None and insight.status == InsightStatus.COMPLETED:
                insight.status = InsightStatus.STALE
                self.db.flush()
        interaction = self.repo.save(interaction)
        invalidate_catalog()
        return interaction

    def delete(self, interaction_id: int) -> None:
        interaction = self.get_or_404(interaction_id)
        self.repo.soft_delete(interaction)
        invalidate_catalog()
