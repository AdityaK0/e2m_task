import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.auth.permissions import Permission, has_permission
from app.modules.users.models import User
from app.modules.users.repository import UserRepository
from app.utils.exceptions import AppException
from app.utils.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = AppException(
        "Not authenticated", status_code=401, error_code="NOT_AUTHENTICATED"
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_access_token(credentials.credentials)
    except jwt.PyJWTError:
        raise unauthorized
    if payload.get("type") != "access":
        raise unauthorized
    subject = payload.get("sub")
    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise unauthorized

    user = UserRepository(db).get_by_id(user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_permissions(*permissions: Permission):
    """Return a dependency enforcing every requested permission.

    Permissions are derived from the persisted user's role, never from any
    client-supplied role value.
    """

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        missing = [p for p in permissions if not has_permission(current_user.role, p)]
        if missing:
            raise AppException(
                "You do not have permission to perform this action",
                status_code=403,
                error_code="FORBIDDEN",
                required_permissions=[p.value for p in missing],
            )
        return current_user

    return dependency
