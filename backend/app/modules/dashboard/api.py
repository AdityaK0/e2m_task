from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permissions
from app.modules.auth.permissions import Permission
from app.modules.dashboard.schema import DashboardSummary
from app.modules.dashboard.service import DashboardService
from app.modules.users.models import User

dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@dashboard_router.get("", response_model=DashboardSummary)
@dashboard_router.get("/summary", response_model=DashboardSummary)
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permissions(Permission.DASHBOARD_READ)),
):
    return DashboardSummary.model_validate(DashboardService(db).summary(current_user))
