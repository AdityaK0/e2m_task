from sqlalchemy import delete, func, literal, select
from sqlalchemy.orm import Session, selectinload

from app.modules.customers.access import get_customer_or_404
from app.modules.customers.models import Customer, CustomerManager
from app.modules.customers.repository import CustomerRepository
from app.modules.customers.schema import CustomerCreateRequest, CustomerUpdateRequest
from app.modules.users.models import Role, User
from app.utils.exceptions import AppException
from app.utils.pagination import pagination_meta


class CustomerService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = CustomerRepository(db)

    def get_or_404(self, customer_id: int, user: User) -> Customer:
        return get_customer_or_404(customer_id, user, self.db)

    def list_customers(
        self,
        *,
        user: User,
        search: str | None,
        status,
        assigned_manager_id: int | None,
        sort: str,
        page: int,
        page_size: int,
    ) -> dict:
        items, total = self.repo.list(
            user=user,
            search=search,
            status=status,
            assigned_manager_id=assigned_manager_id,
            sort=sort,
            offset=(page - 1) * page_size,
            limit=page_size,
        )
        return {"items": items, **pagination_meta(total, page, page_size)}

    def detail(self, customer_id: int, user: User) -> dict:
        from app.modules.interactions.models import Interaction
        from app.modules.insights.models import MeetingInsight, InsightStatus

        customer = self.get_or_404(customer_id, user)
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

    def create(self, data: CustomerCreateRequest, actor: User) -> Customer:
        if actor.role != Role.ADMIN and data.manager_ids:
            raise AppException(
                "Only administrators can assign managers",
                status_code=403,
                error_code="FORBIDDEN",
            )
        self._validate_managers(set(data.manager_ids))
        customer = Customer(**data.model_dump(exclude={"manager_ids"}))
        self.db.add(customer)
        try:
            self.db.flush()
            # Assignment and opt-in auto-assignment share the customer transaction.
            explicit_manager_ids = set(data.manager_ids)
            if actor.role == Role.MANAGER:
                explicit_manager_ids.add(actor.id)
            self._insert_assignments(customer.id, explicit_manager_ids, actor.id)
            self._insert_auto_assignments(customer.id, actor.id)
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._loaded_customer(customer.id)

    def update(self, customer_id: int, data: CustomerUpdateRequest, actor: User) -> Customer:
        customer = self.get_or_404(customer_id, actor)
        payload = data.model_dump(exclude_unset=True)
        if payload.get("name") is None and "name" in payload:
            raise AppException(
                "Customer name cannot be empty",
                status_code=422,
                error_code="VALIDATION_ERROR",
            )
        for key, value in payload.items():
            setattr(customer, key, value)
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return self._loaded_customer(customer.id)

    def delete(self, customer_id: int, actor: User) -> None:
        customer = self.get_or_404(customer_id, actor)
        from app.utils.models import utc_now

        customer.deleted_at = utc_now()
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def managers(self, customer_id: int, actor: User) -> list[User]:
        self.get_or_404(customer_id, actor)
        return list(
            self.db.scalars(
                select(User)
                .join(CustomerManager, CustomerManager.manager_id == User.id)
                .where(CustomerManager.customer_id == customer_id)
                .order_by(User.name)
            ).all()
        )

    def assign_manager(self, customer_id: int, manager_id: int, actor: User) -> dict:
        customer = self.get_or_404(customer_id, actor)
        self._validate_managers({manager_id})
        assigned = self._insert_assignments(customer.id, {manager_id}, actor.id)
        if assigned:
            self.db.commit()
        return {"assigned": assigned, "skipped": int(not assigned)}

    def unassign_manager(self, customer_id: int, manager_id: int, actor: User) -> dict:
        customer = self.get_or_404(customer_id, actor)
        assignment = self.db.scalar(
            select(CustomerManager).where(
                CustomerManager.customer_id == customer.id,
                CustomerManager.manager_id == manager_id,
            )
        )
        if assignment is not None:
            self.db.delete(assignment)
            self.db.commit()
        return {"unassigned": int(assignment is not None), "skipped": int(assignment is None)}

    def bulk_assignment(
        self,
        manager_id: int,
        customer_ids: list[int] | None,
        all_customers: bool,
        actor: User,
        *,
        assign: bool,
    ) -> dict:
        self._validate_managers({manager_id})
        if all_customers:
            ids = list(
                self.db.scalars(
                    select(Customer.id).where(Customer.deleted_at.is_(None))
                ).all()
            )
        else:
            ids = list(dict.fromkeys(customer_ids or []))
            found = set(
                self.db.scalars(
                    select(Customer.id).where(
                        Customer.id.in_(ids), Customer.deleted_at.is_(None)
                    )
                ).all()
            ) if ids else set()
            if found != set(ids):
                raise AppException(
                    "One or more customers do not exist",
                    status_code=422,
                    error_code="INVALID_CUSTOMER_IDS",
                )

        if assign:
            changed = self._insert_assignments(set(ids), {manager_id}, actor.id)
            skipped = len(ids) - changed
        else:
            if ids:
                result = self.db.execute(
                    delete(CustomerManager).where(
                        CustomerManager.manager_id == manager_id,
                        CustomerManager.customer_id.in_(ids),
                    )
                )
                changed = result.rowcount or 0
            else:
                changed = 0
            skipped = len(ids) - changed

        if changed:
            self.db.commit()
        else:
            self.db.rollback()
        return {
            "assigned" if assign else "unassigned": changed,
            "skipped": skipped,
        }

    def _validate_managers(self, manager_ids: set[int]) -> list[User]:
        if not manager_ids:
            return []
        users = list(self.db.scalars(select(User).where(User.id.in_(manager_ids))).all())
        by_id = {user.id: user for user in users}
        if any(
            user_id not in by_id
            or not by_id[user_id].is_active
            or by_id[user_id].role != Role.MANAGER
            for user_id in manager_ids
        ):
            raise AppException(
                "Target user must be an active manager",
                status_code=400,
                error_code="INVALID_MANAGER",
            )
        return users

    def _insert_assignments(
        self, customer_id: int | set[int], manager_ids: set[int], assigned_by: int
    ) -> int:
        customer_ids = {customer_id} if isinstance(customer_id, int) else customer_id
        if not customer_ids or not manager_ids:
            return 0
        values = [
            {"customer_id": cid, "manager_id": mid, "assigned_by": assigned_by}
            for cid in customer_ids
            for mid in manager_ids
        ]
        dialect = self.db.get_bind().dialect.name
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        elif dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert
        else:
            raise RuntimeError(f"Unsupported assignment database dialect: {dialect}")
        result = self.db.execute(
            insert(CustomerManager)
            .values(values)
            .on_conflict_do_nothing(
                index_elements=[CustomerManager.customer_id, CustomerManager.manager_id]
            )
        )
        return result.rowcount or 0

    def _insert_auto_assignments(self, customer_id: int, assigned_by: int) -> None:
        dialect = self.db.get_bind().dialect.name
        if dialect == "postgresql":
            from sqlalchemy.dialects.postgresql import insert
        elif dialect == "sqlite":
            from sqlalchemy.dialects.sqlite import insert
        else:
            raise RuntimeError(f"Unsupported assignment database dialect: {dialect}")
        assignment_select = select(
            literal(customer_id),
            User.id,
            literal(assigned_by),
        ).where(
            User.role == Role.MANAGER,
            User.is_active.is_(True),
            User.auto_assign_new_customers.is_(True),
        )
        self.db.execute(
            insert(CustomerManager)
            .from_select(["customer_id", "manager_id", "assigned_by"], assignment_select)
            .on_conflict_do_nothing(
                index_elements=[CustomerManager.customer_id, CustomerManager.manager_id]
            )
        )

    def _loaded_customer(self, customer_id: int) -> Customer:
        return self.db.scalar(
            select(Customer)
            .options(
                selectinload(Customer.manager_assignments).selectinload(CustomerManager.manager)
            )
            .where(Customer.id == customer_id)
        )
