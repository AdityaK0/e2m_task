from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.interactions.models import InteractionType
from app.modules.interactions.schema import (
    InteractionCreateRequest,
    InteractionCreateResponse,
    InteractionDetailResponse,
    InteractionListResponse,
    InteractionResponse,
    InteractionUpdateRequest,
)
from app.modules.interactions.service import InteractionService
from app.modules.insights.service import InsightService
from app.modules.users.models import User
from app.utils.exceptions import AppException

interaction_sort = Literal[
    "occurred_at",
    "-occurred_at",
    "created_at",
    "-created_at",
    "title",
    "-title",
]

interactions_router = APIRouter(prefix="/interactions", tags=["Interactions"])


@interactions_router.get("", response_model=InteractionListResponse)
def list_interactions(
    customer_id: int | None = Query(default=None, gt=0),
    type: InteractionType | None = Query(default=None),
    date_from: datetime | None = Query(default=None),
    date_to: datetime | None = Query(default=None),
    search: str | None = Query(default=None, max_length=200),
    sort: interaction_sort = Query(default="-occurred_at"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INTERACTIONS_READ)),
):
    result = InteractionService(db).list_page(
        customer_id=customer_id,
        interaction_type=type,
        date_from=date_from,
        date_to=date_to,
        search=search,
        sort=sort,
        page=page,
        page_size=page_size,
        user=current_user,
    )
    return InteractionListResponse(
        items=[InteractionResponse.model_validate(item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
        pages=result["pages"],
    )


@interactions_router.post("", response_model=InteractionCreateResponse, status_code=201)
def create_interaction(
    data: InteractionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INTERACTIONS_WRITE)),
):
    interaction = InteractionService(db).create(data, current_user)
    insight_status = None
    insight_error = None
    if data.generate_insight:
        try:
            insight, interaction = InsightService(db).generate(interaction.id, current_user)
            insight_status = insight.status.value
        except AppException as exc:
            if exc.error_code not in {
                "AI_NOT_CONFIGURED",
                "AI_GENERATION_FAILED",
                "NOTES_REQUIRED",
            }:
                raise
            insight_error = exc.message
            if interaction.insight is not None:
                insight_status = interaction.insight.status.value

    response = InteractionResponse.model_validate(interaction).model_dump()
    return InteractionCreateResponse(
        **response,
        insight_status=insight_status,
        insight_error=insight_error,
    )


@interactions_router.get("/{interaction_id}", response_model=InteractionDetailResponse)
def get_interaction(
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INTERACTIONS_READ)),
):
    interaction = InteractionService(db).get_or_404(interaction_id, current_user)
    payload = InteractionResponse.model_validate(interaction).model_dump()
    insight = interaction.insight
    return InteractionDetailResponse(
        **payload,
        insight_status=insight.status.value if insight else None,
        insight_generated_at=insight.generated_at if insight else None,
    )


@interactions_router.put("/{interaction_id}", response_model=InteractionResponse)
@interactions_router.patch("/{interaction_id}", response_model=InteractionResponse)
def update_interaction(
    interaction_id: int,
    data: InteractionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INTERACTIONS_WRITE)),
):
    interaction = InteractionService(db).update(interaction_id, data, current_user)
    return InteractionResponse.model_validate(interaction)


@interactions_router.delete("/{interaction_id}", status_code=204)
def delete_interaction(
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INTERACTIONS_DELETE)),
):
    InteractionService(db).delete(interaction_id, current_user)
