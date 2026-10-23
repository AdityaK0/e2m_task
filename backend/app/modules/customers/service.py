from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.customers.models import Customer
from app.modules.customers.repository import CustomerRepository
from app.modules.customers.schema import (
    CustomerCreateRequest,
    CustomerUpdateRequest,
)
from app.modules.users.models import Role, User
from app.modules.users.repository import UserRepository
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta


class CustomerService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CustomerRepository(db)

    def get_or_404(self, customer_id: int) -> Customer:
        customer = self.repo.get_by_id(customer_id)
        if customer is None:
            raise AppException(
                "Customer not found", status_code=404, error_code="CUSTOMER_NOT_FOUND"
            )
        return customer

    def list_customers(
        self,
        *,
        search: str | None,
        status,
        assigned_manager_id: int | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> dict:
        items, total = self.repo.list(
            search=search,
            status=status,
            assigned_manager_id=assigned_manager_id,
            sort=sort,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return {"items": items, **pagination_meta(total, page, page_size)}

    def detail(self, customer_id: int) -> dict:
        from app.modules.interactions.models import Interaction
        from app.modules.insights.models import MeetingInsight, InsightStatus

        customer = self.get_or_404(customer_id)
        interaction_count = int(
            self.db.scalar(
                select(func.count())
                .select_from(Interaction)
                .where(
                    Interaction.customer_id == customer.id,
                    Interaction.deleted_at.is_(None),
                )
            )
            or 0
        )
        last_interaction_at = self.db.scalar(
            select(func.max(Interaction.occurred_at)).where(
                Interaction.customer_id == customer.id,
                Interaction.deleted_at.is_(None),
            )
        )
        insight_count = int(
            self.db.scalar(
                select(func.count())
                .select_from(MeetingInsight)
                .join(Interaction, Interaction.id == MeetingInsight.interaction_id)
                .where(
                    Interaction.customer_id == customer.id,
                    Interaction.deleted_at.is_(None),
                    MeetingInsight.status == InsightStatus.COMPLETED,
                )
            )
            or 0
        )
        return {
            "customer": customer,
            "interaction_count": interaction_count,
            "last_interaction_at": last_interaction_at,
            "insight_count": insight_count,
        }

    def create(self, data: CustomerCreateRequest) -> Customer:
        self._validate_manager(data.assigned_manager_id)
        customer = Customer(**data.model_dump())
        return self.repo.create(customer)

    def update(self, customer_id: int, data: CustomerUpdateRequest) -> Customer:
        customer = self.get_or_404(customer_id)
        payload = data.model_dump(exclude_unset=True)
        if "assigned_manager_id" in payload:
            self._validate_manager(payload["assigned_manager_id"])
        if payload.get("name") is None and "name" in payload:
            raise AppException(
                "Customer name cannot be empty",
                status_code=422,
                error_code="VALIDATION_ERROR",
            )
        for key, value in payload.items():
            setattr(customer, key, value)
        return self.repo.save(customer)

    def delete(self, customer_id: int) -> None:
        customer = self.get_or_404(customer_id)
        # Soft delete preserves interaction and insight history. Only admins
        # reach this method (enforced by the route permission dependency).
        self.repo.soft_delete(customer)

    def _validate_manager(self, manager_id: int | None) -> None:
        if manager_id is None:
            return
        manager = UserRepository(self.db).get_by_id(manager_id)
        if manager is None or not manager.is_active:
            raise AppException(
                "Assigned manager must be an active user",
                status_code=422,
                error_code="INVALID_ASSIGNED_MANAGER",
            )
        if manager.role not in (Role.ADMIN, Role.CSM):
            raise AppException(
                "Customers can only be assigned to an admin or CSM",
                status_code=422,
                error_code="INVALID_ASSIGNED_MANAGER",
            )
