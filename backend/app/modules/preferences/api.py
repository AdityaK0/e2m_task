from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.modules.preferences.schema import PreferenceResponse, PreferenceUpdateRequest
from app.modules.preferences.service import PreferenceService
from app.modules.users.models import Role, User

preferences_router = APIRouter(prefix="/preferences", tags=["Preferences"])


@preferences_router.get("", response_model=list[PreferenceResponse])
def list_preferences(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    return PreferenceService(db).list_preferences()


@preferences_router.put("/{key}", response_model=PreferenceResponse)
def update_preference(
    key: str,
    data: PreferenceUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(Role.ADMIN)),
):
    return PreferenceService(db).update(key, data.value, current_user)
