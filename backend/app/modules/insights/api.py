from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.insights.schema import (
    InsightGenerationRequest,
    MeetingInsightResponse,
)
from app.modules.insights.service import InsightService
from app.modules.interactions.models import Interaction
from app.modules.users.models import User

insights_router = APIRouter(tags=["Insights"])

def _serialize(insight: MeetingInsight, interaction: Interaction) -> MeetingInsightResponse:
    stale = insight.status == InsightStatus.STALE or (
        insight.notes_version != interaction.notes_version
        and insight.status == InsightStatus.COMPLETED
    )
    payload = MeetingInsightResponse.model_validate(insight).model_dump()
    payload["is_stale"] = stale
    return MeetingInsightResponse.model_validate(payload)


@insights_router.get(
    "/interactions/{interaction_id}/insights", response_model=MeetingInsightResponse
)
def get_insight(
    interaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INSIGHTS_READ)),
):
    insight, interaction = InsightService(db).get_for_interaction(interaction_id, current_user)
    return _serialize(insight, interaction)


@insights_router.post(
    "/interactions/{interaction_id}/insights", response_model=MeetingInsightResponse
)
def generate_insight(
    interaction_id: int,
    data: InsightGenerationRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INSIGHTS_GENERATE)),
):
    body = data or InsightGenerationRequest()
    insight, interaction = InsightService(db).generate(
        interaction_id, current_user, force=body.force
    )
    return _serialize(insight, interaction)


@insights_router.post(
    "/interactions/{interaction_id}/regenerate-insights", response_model=MeetingInsightResponse
)
def regenerate_insight(
    interaction_id: int,
    data: InsightGenerationRequest | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.INSIGHTS_GENERATE)),
):
    body = data or InsightGenerationRequest(force=True)
    insight, interaction = InsightService(db).generate(
        interaction_id, current_user, force=body.force
    )
    return _serialize(insight, interaction)


@insights_router.get("/insights/config")
def insight_config(_current_user: User = Depends(require_permissions(Permission.INSIGHTS_READ))):
    from app.config import settings

    configured = settings.llm_configured
    return {
        "configured": configured,
        "provider": settings.LLM_PROVIDER if configured else None,
        "model": (
            (settings.GEMINI_MODEL if settings.LLM_PROVIDER == "gemini" else settings.LLM_MODEL)
            if configured
            else None
        ),
    }
