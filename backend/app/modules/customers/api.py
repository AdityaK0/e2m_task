from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.customers.models import CustomerStatus
from app.modules.customers.schema import (
    CustomerCreateRequest,
    CustomerDetailResponse,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdateRequest,
)
from app.modules.customers.service import CustomerService
from app.modules.users.models import User
from app.utils.cache import (
    CUSTOMER_LIST_VERSION_KEY,
    build_list_cache_key,
    get_json,
    get_version,
    invalidate_catalog,
    set_json,
)

customer_sort = Literal[
    "name",
    "-name",
    "created_at",
    "-created_at",
    "updated_at",
    "-updated_at",
    "health_score",
    "-health_score",
    "status",
    "-status",
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
    params = {
        "search": search,
        "status": status.value if status else None,
        "assigned_manager_id": assigned_manager_id,
        "sort": sort,
        "page": page,
        "page_size": page_size,
    }
    version = get_version(CUSTOMER_LIST_VERSION_KEY)
    cache_key = build_list_cache_key(
        "customers:list", current_user.role.value, current_user.id, params, version
    )
    cached = get_json(cache_key)
    if cached is not None:
        return CustomerListResponse.model_validate(cached)

    result = CustomerService(db).list_customers(
        search=search,
        status=status,
        assigned_manager_id=assigned_manager_id,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    response = CustomerListResponse(
        items=[CustomerResponse.model_validate(item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )
    set_json(cache_key, response.model_dump(mode="json"))
    return response


@customers_router.post("", response_model=CustomerResponse, status_code=201)
def create_customer(
    data: CustomerCreateRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.CUSTOMERS_WRITE)),
):
    customer = CustomerService(db).create(data)
    invalidate_catalog()
    return CustomerResponse.model_validate(customer)


@customers_router.get("/{customer_id}", response_model=CustomerDetailResponse)
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.CUSTOMERS_READ)),
):
    detail = CustomerService(db).detail(customer_id)
    base = CustomerResponse.model_validate(detail["customer"]).model_dump()
    return CustomerDetailResponse(
        **base,
        interaction_count=detail["interaction_count"],
        last_interaction_at=detail["last_interaction_at"],
        insight_count=detail["insight_count"],
    )


@customers_router.patch("/{customer_id}", response_model=CustomerResponse)
def update_customer(
    customer_id: int,
    data: CustomerUpdateRequest,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.CUSTOMERS_WRITE)),
):
    customer = CustomerService(db).update(customer_id, data)
    invalidate_catalog()
    return CustomerResponse.model_validate(customer)


@customers_router.delete("/{customer_id}", status_code=204)
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _current_user: User = Depends(require_permissions(Permission.CUSTOMERS_DELETE)),
):
    CustomerService(db).delete(customer_id)
    invalidate_catalog()
