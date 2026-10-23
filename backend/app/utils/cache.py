import hashlib
import json
import logging
from typing import Any

import redis
from redis.exceptions import RedisError

from app.config import settings

logger = logging.getLogger("app.cache")

# A single synchronous client is used by the synchronous service layer. Short
# connect/read timeouts keep a Redis outage from becoming an API outage.
_client = redis.Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=settings.REDIS_SOCKET_TIMEOUT_SECONDS,
    socket_timeout=settings.REDIS_SOCKET_TIMEOUT_SECONDS,
    retry_on_timeout=False,
)

CUSTOMER_LIST_VERSION_KEY = "cache:customers:version"
DASHBOARD_VERSION_KEY = "cache:dashboard:version"


def get_client() -> redis.Redis:
    return _client


def set_client(client: redis.Redis) -> None:
    """Test hook: swap in fakeredis or another compatible client."""
    global _client
    _client = client


def get_version(name: str) -> int:
    """Read a cache-generation counter.

    A missing Redis is treated as version 0. Reads then fall through to
    PostgreSQL; writes are best-effort.
    """
    try:
        value = _client.get(name)
        return int(value) if value is not None else 0
    except (RedisError, ValueError, TypeError) as exc:
        logger.warning("cache version read failed key=%s error=%s", name, type(exc).__name__)
        return 0


def bump_version(name: str) -> None:
    """Invalidate every cached variant generated under a version.

    Old keys are left to expire via TTL; bumping the generation means every
    filter/pagination/sort combination is invalidated at once, without
    needing to track individual keys.
    """
    try:
        _client.incr(name)
    except RedisError as exc:
        logger.warning("cache version bump failed key=%s error=%s", name, type(exc).__name__)


def invalidate_catalog() -> None:
    bump_version(CUSTOMER_LIST_VERSION_KEY)
    bump_version(DASHBOARD_VERSION_KEY)


def invalidate_dashboard_for(manager_ids: set[int] | list[int] | tuple[int, ...] = ()) -> None:
    """Invalidate shared admin stats and each manager affected by a mutation."""
    delete("dashboard:admin")
    for manager_id in set(manager_ids):
        delete(f"dashboard:manager:{manager_id}")


def invalidate_customer_mutation(manager_ids: set[int] | list[int] | tuple[int, ...] = ()) -> None:
    """Invalidate customer lists and dashboard data after a committed mutation."""
    bump_version(CUSTOMER_LIST_VERSION_KEY)
    invalidate_dashboard_for(manager_ids)


def get_json(key: str) -> Any | None:
    try:
        raw = _client.get(key)
    except RedisError as exc:
        logger.warning("cache read failed key=%s error=%s", key, type(exc).__name__)
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError, ValueError):
        logger.warning("cache entry unreadable; dropping key=%s", key)
        delete(key)
        return None


def set_json(key: str, value: Any, ttl: int | None = None) -> None:
    cache_ttl = ttl if ttl is not None else settings.REDIS_CACHE_TTL_SECONDS
    if cache_ttl <= 0:
        return
    try:
        _client.set(key, json.dumps(value, default=str), ex=cache_ttl)
    except (RedisError, TypeError, ValueError) as exc:
        logger.warning("cache write failed key=%s error=%s", key, type(exc).__name__)


def delete(key: str) -> None:
    try:
        _client.delete(key)
    except RedisError as exc:
        logger.warning("cache delete failed key=%s error=%s", key, type(exc).__name__)


def build_list_cache_key(prefix: str, role: str, user_id: int, params: dict, version: int) -> str:
    """Versioned key covering every response-affecting parameter and identity.

    The role/user scope is included even though the current policy lets every
    role read all customers, so a future ownership policy cannot accidentally
    serve one user another user's cached rows.
    """
    normalized = json.dumps(params, sort_keys=True, default=str, separators=(",", ":"))
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:24]
    return f"{prefix}:v{version}:{role}:{user_id}:{digest}"


def acquire_lock(key: str, ttl_seconds: int, token: str) -> bool:
    """Best-effort distributed mutex. If Redis is unavailable, fail open and
    rely on the database's unique row plus state checks."""
    try:
        return bool(_client.set(key, token, nx=True, ex=ttl_seconds))
    except RedisError as exc:
        logger.warning("cache lock acquire failed key=%s error=%s", key, type(exc).__name__)
        return True


def release_lock(key: str, token: str) -> None:
    try:
        if _client.get(key) == token:
            _client.delete(key)
    except RedisError as exc:
        logger.warning("cache lock release failed key=%s error=%s", key, type(exc).__name__)
