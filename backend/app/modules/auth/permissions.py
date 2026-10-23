from enum import Enum

from app.modules.users.models import Role


class Permission(str, Enum):
    USERS_READ = "users:read"
    USERS_MANAGE = "users:manage"

    CUSTOMERS_READ = "customers:read"
    CUSTOMERS_WRITE = "customers:write"
    CUSTOMERS_DELETE = "customers:delete"

    INTERACTIONS_READ = "interactions:read"
    INTERACTIONS_WRITE = "interactions:write"
    INTERACTIONS_DELETE = "interactions:delete"

    INSIGHTS_READ = "insights:read"
    INSIGHTS_GENERATE = "insights:generate"

    DASHBOARD_READ = "dashboard:read"


READ_ONLY_PERMISSIONS = {
    Permission.CUSTOMERS_READ,
    Permission.INTERACTIONS_READ,
    Permission.INSIGHTS_READ,
    Permission.DASHBOARD_READ,
}

ROLE_PERMISSIONS: dict[Role, set[Permission]] = {
    Role.ADMIN: set(Permission),
    Role.MANAGER: {
        *READ_ONLY_PERMISSIONS,
        Permission.CUSTOMERS_WRITE,
        Permission.INTERACTIONS_WRITE,
        Permission.INSIGHTS_GENERATE,
    },
}


def has_permission(role: Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS.get(role, set())
