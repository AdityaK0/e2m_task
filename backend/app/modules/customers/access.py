from sqlalchemy import Select, exists, select
from sqlalchemy.orm import Session

from app.modules.customers.models import Customer, CustomerManager
from app.modules.users.models import Role, User
from app.utils.exceptions import AppException


def apply_customer_access_filter(query: Select, user: User) -> Select:
    if user.role == Role.ADMIN:
        return query
    accessible = exists(
        select(CustomerManager.id).where(
            CustomerManager.customer_id == Customer.id,
            CustomerManager.manager_id == user.id,
        )
    )
    return query.where(accessible)


def get_customer_or_404(customer_id: int, user: User, db: Session) -> Customer:
    query = apply_customer_access_filter(
        select(Customer).where(
            Customer.id == customer_id,
            Customer.deleted_at.is_(None),
        ),
        user,
    )
    customer = db.scalar(query)
    if customer is None:
        raise AppException(
            "Customer not found", status_code=404, error_code="CUSTOMER_NOT_FOUND"
        )
    return customer
