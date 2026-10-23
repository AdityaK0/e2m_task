from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.dashboard.schema import DashboardSummary
from app.modules.dashboard.service import DashboardService
from app.modules.users.models import User
from app.utils.cache import get_json, set_json
from app.modules.users.models import Role

dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@dashboard_router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.DASHBOARD_READ)),
):
    cache_key = (
        "dashboard:admin"
        if current_user.role == Role.ADMIN
        else f"dashboard:manager:{current_user.id}"
    )
    cached = get_json(cache_key)
    if cached is not None:
        return DashboardSummary.model_validate(cached)

    summary = DashboardSummary.model_validate(DashboardService(db).summary(current_user))
    set_json(cache_key, summary.model_dump(mode="json"), ttl=300)
    return summary
