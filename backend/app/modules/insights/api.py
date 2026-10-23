from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.insights.provider import (
    AINotConfiguredError,
    InsightProvider,
    OpenAIInsightProvider,
)
from app.modules.insights.schema import (
    InsightGenerationRequest,
    MeetingInsightResponse,
)
from app.modules.insights.service import InsightService
from app.modules.interactions.models import Interaction
from app.modules.users.models import User
from app.utils.exceptions import AppException

insights_router = APIRouter(tags=["Insights"])


def get_insight_provider() -> InsightProvider:
    try:
        return OpenAIInsightProvider()
    except AINotConfiguredError:
        raise AppException(
            "AI insights are not configured on this server",
            status_code=503,
            error_code="AI_NOT_CONFIGURED",
        )


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
    provider: InsightProvider = Depends(get_insight_provider),
):
    body = data or InsightGenerationRequest()
    insight, interaction = InsightService(db).generate(
        interaction_id, provider, current_user, force=body.force
    )
    return _serialize(insight, interaction)


@insights_router.get("/insights/config")
def insight_config(_current_user: User = Depends(require_permissions(Permission.INSIGHTS_READ))):
    from app.config import settings

    return {
        "configured": settings.ai_configured,
        "provider": settings.AI_PROVIDER if settings.ai_configured else None,
        "model": settings.AI_MODEL if settings.ai_configured else None,
    }
