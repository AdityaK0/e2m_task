from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.customers.health import recompute_all_health_scores
from app.modules.preferences.models import Preference
from app.modules.preferences.registry import PREFERENCE_REGISTRY
from app.modules.preferences.schema import PreferenceResponse
from app.modules.users.models import User
from app.utils.exceptions import AppException
from app.utils.models import utc_now


class PreferenceService:
    def __init__(self, db: Session):
        self.db = db

    def list_preferences(self) -> list[PreferenceResponse]:
        rows = {
            row.key: row.value
            for row in self.db.scalars(select(Preference)).all()
        }
        return [
            PreferenceResponse(
                key=definition.key,
                value=rows.get(key, definition.default),
                default=definition.default,
                min=definition.minimum,
                max=definition.maximum,
                description=definition.description,
            )
            for key, definition in PREFERENCE_REGISTRY.items()
        ]

    def update(self, key: str, value: int, actor: User) -> PreferenceResponse:
        definition = PREFERENCE_REGISTRY.get(key)
        if definition is None:
            raise AppException(
                "Preference not found", status_code=404, error_code="PREFERENCE_NOT_FOUND"
            )
        if type(value) is not definition.value_type or (
            definition.minimum is not None and value < definition.minimum
        ) or (
            definition.maximum is not None and value > definition.maximum
        ):
            raise AppException(
                "Preference value is outside the allowed range",
                status_code=422,
                error_code="INVALID_PREFERENCE_VALUE",
                minimum=definition.minimum,
                maximum=definition.maximum,
            )

        row = self.db.scalar(select(Preference).where(Preference.key == key))
        old_value = row.value if row is not None else definition.default
        value_changed = old_value != value
        if row is not None and not value_changed:
            row.updated_by = actor.id
            row.updated_at = utc_now()
        elif row is None:
            row = Preference(key=key, value=value, updated_by=actor.id)
            self.db.add(row)
        else:
            row.value = value
            row.updated_by = actor.id
            row.updated_at = utc_now()

        if key == "health_score_window" and value_changed:
            recompute_all_health_scores(self.db, window=value)

        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return PreferenceResponse(
            key=key,
            value=value,
            default=definition.default,
            min=definition.minimum,
            max=definition.maximum,
            description=definition.description,
        )
