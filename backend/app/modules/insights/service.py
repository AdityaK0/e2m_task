import logging
import uuid
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.modules.insights.models import InsightStatus, MeetingInsight
from app.modules.insights.provider import (
    AINotConfiguredError,
    AIProviderError,
    InsightProvider,
)
from app.modules.insights.repository import InsightRepository
from app.modules.interactions.models import Interaction
from app.modules.interactions.repository import InteractionRepository
from app.utils.cache import acquire_lock, invalidate_catalog, release_lock
from app.utils.exceptions import AppException
from app.utils.models import utc_now

logger = logging.getLogger("app.insights")


class InsightService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = InsightRepository(db)
        self.interactions = InteractionRepository(db)

    def get_for_interaction(self, interaction_id: int) -> tuple[MeetingInsight, Interaction]:
        interaction = self.interactions.get_by_id(interaction_id)
        if interaction is None:
            raise AppException(
                "Interaction not found", status_code=404, error_code="INTERACTION_NOT_FOUND"
            )
        insight = self.repo.get_by_interaction(interaction_id)
        if insight is None:
            raise AppException(
                "No insight has been generated for this interaction",
                status_code=404,
                error_code="INSIGHT_NOT_FOUND",
            )
        return insight, interaction

    def generate(
        self,
        interaction_id: int,
        provider: InsightProvider,
        *,
        force: bool = False,
    ) -> tuple[MeetingInsight, Interaction]:
        interaction = self.interactions.get_by_id(interaction_id)
        if interaction is None:
            raise AppException(
                "Interaction not found", status_code=404, error_code="INTERACTION_NOT_FOUND"
            )
        notes = (interaction.notes or "").strip()
        if not notes:
            raise AppException(
                "Add meeting notes before generating insights",
                status_code=422,
                error_code="NOTES_REQUIRED",
            )

        existing = self.repo.get_by_interaction(interaction_id)
        if existing is not None and self._is_running(existing):
            raise self._in_progress()

        if (
            existing is not None
            and not force
            and existing.status == InsightStatus.COMPLETED
            and existing.notes_version == interaction.notes_version
        ):
            return existing, interaction

        lock_key = f"insight:lock:{interaction_id}"
        lock_token = str(uuid.uuid4())
        if not acquire_lock(lock_key, 120, lock_token):
            raise self._in_progress()

        captured_version = interaction.notes_version
        try:
            # Re-read after acquiring the lock: another request may have just
            # completed while we were waiting.
            existing = self.repo.get_by_interaction(interaction_id)
            if existing is not None and self._is_running(existing):
                raise self._in_progress()
            if (
                existing is not None
                and not force
                and existing.status == InsightStatus.COMPLETED
                and existing.notes_version == captured_version
            ):
                return existing, interaction

            if existing is None:
                insight = MeetingInsight(
                    interaction_id=interaction_id,
                    status=InsightStatus.RUNNING,
                    notes_version=captured_version,
                    action_items=[],
                    risks=[],
                )
                try:
                    insight = self.repo.create(insight)
                except IntegrityError:
                    self.db.rollback()
                    insight = self.repo.get_by_interaction(interaction_id)
                    if insight is None:
                        raise
                    insight.status = InsightStatus.RUNNING
                    insight.notes_version = captured_version
                    insight = self.repo.save(insight)
            else:
                insight = existing
                insight.status = InsightStatus.RUNNING
                insight.notes_version = captured_version
                insight.error_message = None
                insight = self.repo.save(insight)

            customer_name = interaction.customer.name if interaction.customer else "Unknown"
            try:
                generated = provider.generate(
                    notes=notes,
                    title=interaction.title,
                    customer_name=customer_name,
                    occurred_at=interaction.occurred_at,
                )
            except AINotConfiguredError:
                self._mark_failed(insight, "AI provider is not configured.")
                raise AppException(
                    "AI insights are not configured on this server",
                    status_code=503,
                    error_code="AI_NOT_CONFIGURED",
                )
            except AIProviderError:
                self._mark_failed(insight, "AI generation failed. Please retry.")
                raise AppException(
                    "AI generation failed. Please try again.",
                    status_code=502,
                    error_code="AI_GENERATION_FAILED",
                )

            # If notes changed while the provider was working, retain the
            # result but mark it stale rather than presenting it as current.
            self.db.refresh(interaction)
            still_current = interaction.notes_version == captured_version
            insight.summary = generated.summary
            insight.sentiment = generated.sentiment
            insight.action_items = [
                item.model_dump(mode="json") for item in generated.action_items
            ]
            insight.risks = [risk.model_dump(mode="json") for risk in generated.risks]
            insight.action_item_count = len(generated.action_items)
            insight.risk_count = len(generated.risks)
            insight.notes_version = captured_version
            insight.generation_version += 1
            insight.provider = provider.name
            insight.model = provider.model or None
            insight.generated_at = utc_now()
            insight.error_message = None
            insight.status = (
                InsightStatus.COMPLETED if still_current else InsightStatus.STALE
            )
            insight = self.repo.save(insight)
            invalidate_catalog()
            logger.info(
                "insight generated interaction_id=%s status=%s version=%s",
                interaction_id,
                insight.status.value,
                insight.generation_version,
            )
            return insight, interaction
        finally:
            release_lock(lock_key, lock_token)

    def _mark_failed(self, insight: MeetingInsight, message: str) -> None:
        insight.status = InsightStatus.FAILED
        insight.error_message = message
        insight = self.repo.save(insight)
        invalidate_catalog()

    @staticmethod
    def _is_running(insight: MeetingInsight) -> bool:
        if insight.status != InsightStatus.RUNNING:
            return False
        updated = insight.updated_at
        if updated.tzinfo is None:
            from datetime import timezone

            updated = updated.replace(tzinfo=timezone.utc)
        return utc_now() - updated < timedelta(minutes=2)

    @staticmethod
    def _in_progress() -> AppException:
        return AppException(
            "An insight is already being generated for this interaction",
            status_code=409,
            error_code="INSIGHT_GENERATION_IN_PROGRESS",
        )
