from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions, require_roles
from app.modules.auth.permissions import Permission
from app.modules.customers.models import CustomerStatus
from app.modules.customers.schema import (
    BulkAssignmentRequest,
    BulkAssignmentResponse,
    CustomerCreateRequest,
    CustomerDetailResponse,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdateRequest,
    ManagerAssignmentRequest,
)
from app.modules.customers.service import CustomerService
from app.modules.users.models import Role, User
from app.modules.users.schema import UserSummary

customer_sort = Literal[
    "name", "-name", "created_at", "-created_at", "updated_at", "-updated_at",
    "health_score", "-health_score", "status", "-status",
]
customers_router = APIRouter(prefix="/customers", tags=["Customers"])


@customers_router.get("", response_model=CustomerListResponse)
def list_customers(
    search: str | None = Query(default=None, max_length=200),
    status: CustomerStatus | None = Query(default=None),
    assigned_manager_id: int | None = Query(default=None, gt=0),
    sort: customer_sort = Query(default="-created_at"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.CUSTOMERS_READ)),
):
    result = CustomerService(db).list_customers(
        user=current_user, search=search, status=status,
        assigned_manager_id=assigned_manager_id, sort=sort,
        page=page, page_size=page_size,
    )
    return CustomerListResponse(
        items=[CustomerResponse.model_validate(item) for item in result["items"]],
        total=result["total"], page=result["page"],
        page_size=result["page_size"], pages=result["pages"],
    )


@customers_router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(
    data: CustomerCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.CUSTOMERS_WRITE)),
):
    return CustomerResponse.model_validate(CustomerService(db).create(data, current_user))


@customers_router.post("/assignments", response_model=BulkAssignmentResponse)
def bulk_assign(
    data: BulkAssignmentRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
):
    return CustomerService(db).bulk_assignment(
        data.manager_id, data.customer_ids, data.all is True, actor, assign=True
    )


@customers_router.delete("/assignments", response_model=BulkAssignmentResponse)
def bulk_unassign(
    data: BulkAssignmentRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
):
    return CustomerService(db).bulk_assignment(
        data.manager_id, data.customer_ids, data.all is True, actor, assign=False
    )


@customers_router.get("/{customer_id}/managers", response_model=list[UserSummary])
def get_managers(
    customer_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
):
    return [
        UserSummary.model_validate(user)
        for user in CustomerService(db).managers(customer_id, actor)
    ]


@customers_router.post("/{customer_id}/managers", response_model=BulkAssignmentResponse)
def assign_manager(
    customer_id: int,
    data: ManagerAssignmentRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
):
    return CustomerService(db).assign_manager(customer_id, data.manager_id, actor)


@customers_router.delete("/{customer_id}/managers/{manager_id}", response_model=BulkAssignmentResponse)
def unassign_manager(
    customer_id: int,
    manager_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_roles(Role.ADMIN)),
):
    return CustomerService(db).unassign_manager(customer_id, manager_id, actor)


@customers_router.get("/{customer_id}", response_model=CustomerDetailResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.CUSTOMERS_READ)),
):
    detail = CustomerService(db).detail(customer_id, current_user)
    base = CustomerResponse.model_validate(detail["customer"]).model_dump()
    return CustomerDetailResponse(
        **base, interaction_count=detail["interaction_count"],
        last_interaction_at=detail["last_interaction_at"],
        insight_count=detail["insight_count"],
    )


@customers_router.put("/{customer_id}", response_model=CustomerResponse)
@customers_router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    data: CustomerUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.CUSTOMERS_WRITE)),
):
    return CustomerResponse.model_validate(
        CustomerService(db).update(customer_id, data, current_user)
    )


@customers_router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    response: Response,
    db: Session = Depends(get_db),
    actor: User = Depends(require_permissions(Permission.CUSTOMERS_DELETE)),
):
    CustomerService(db).delete(customer_id, actor)
    response.status_code = 204
