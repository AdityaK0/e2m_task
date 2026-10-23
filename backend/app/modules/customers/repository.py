from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.customers.models import Customer, CustomerStatus
from app.utils.models import utc_now

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

    def create(self, customer: Customer) -> Customer:
        self.db.add(customer)
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def save(self, customer: Customer) -> Customer:
        self.db.commit()
        self.db.refresh(customer)
        return customer

    def get_by_id(self, customer_id: int, *, include_deleted: bool = False) -> Customer | None:
        q = (
            select(Customer)
            .options(selectinload(Customer.assigned_manager))
            .where(Customer.id == customer_id)
        )
        if not include_deleted:
            q = q.where(Customer.deleted_at.is_(None))
        return self.db.scalar(q)

    def list(
        self,
        *,
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
            filters.append(Customer.assigned_manager_id == assigned_manager_id)

        base = (
            select(Customer)
            .options(selectinload(Customer.assigned_manager))
            .where(*filters)
        )
        count_q = select(func.count()).select_from(Customer).where(*filters)
        total = int(self.db.scalar(count_q) or 0)

        order = SORT_COLUMNS.get(sort, SORT_COLUMNS["-created_at"])
        items = list(
            self.db.scalars(base.order_by(order).offset(offset).limit(limit)).all()
        )
        return items, total

    def soft_delete(self, customer: Customer) -> None:
        customer.deleted_at = utc_now()
        self.db.commit()
