from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.customers.access import apply_customer_access_filter
from app.modules.customers.models import Customer, CustomerManager, CustomerStatus
from app.modules.users.models import User

SORT_COLUMNS = {
    "name": Customer.name,
    "-name": Customer.name.desc(),
    "created_at": Customer.created_at,
    "-created_at": Customer.created_at.desc(),
    "updated_at": Customer.updated_at,
    "-updated_at": Customer.updated_at.desc(),
    "health_score": Customer.health_score,
    "-health_score": Customer.health_score.desc(),
    "status": Customer.status,
    "-status": Customer.status.desc(),
}


class CustomerRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, customer_id: int, user: User) -> Customer | None:
        query = (
            select(Customer)
            .options(
                selectinload(Customer.manager_assignments).selectinload(CustomerManager.manager)
            )
            .where(Customer.id == customer_id, Customer.deleted_at.is_(None))
        )
        return self.db.scalar(apply_customer_access_filter(query, user))

    def list(
        self,
        *,
        user: User,
        search: str | None,
        status: CustomerStatus | None,
        assigned_manager_id: int | None,
        sort: str,
        offset: int,
        limit: int,
    ) -> tuple[list[Customer], int]:
        filters = [Customer.deleted_at.is_(None)]
        if search:
            like = f"%{search.strip()}%"
            filters.append(
                or_(
                    Customer.name.ilike(like),
                    Customer.company.ilike(like),
                    Customer.contact_name.ilike(like),
                    Customer.contact_email.ilike(like),
                )
            )
        if status is not None:
            filters.append(Customer.status == status)
        if assigned_manager_id is not None:
            filters.append(
                select(CustomerManager.id)
                .where(
                    CustomerManager.customer_id == Customer.id,
                    CustomerManager.manager_id == assigned_manager_id,
                )
                .exists()
            )

        base = (
            select(Customer)
            .options(
                selectinload(Customer.manager_assignments).selectinload(CustomerManager.manager)
            )
            .where(*filters)
        )
        count_query = select(func.count()).select_from(Customer).where(*filters)
        base = apply_customer_access_filter(base, user)
        count_query = apply_customer_access_filter(count_query, user)
        total = int(self.db.scalar(count_query) or 0)
        items = list(
            self.db.scalars(
                base.order_by(SORT_COLUMNS.get(sort, SORT_COLUMNS["-created_at"]))
                .offset(offset)
                .limit(limit)
            ).all()
        )
        return items, total
