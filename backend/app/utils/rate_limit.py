import threading
import time
from collections import defaultdict, deque

from app.config import settings
from app.utils.exceptions import AppException


class LoginRateLimiter:
    """Small per-process fixed-window limiter for failed logins.

    This protects a single backend process. Multi-replica deployments should
    put the limiter in Redis or a gateway; the trade-off is documented in the
    README.
    """

    def __init__(self) -> None:
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def _key(email: str, ip: str | None) -> str:
        return f"{email.strip().lower()}|{ip or 'unknown'}"

    def check(self, email: str, ip: str | None) -> None:
        now = time.monotonic()
        key = self._key(email, ip)
        with self._lock:
            bucket = self._failures[key]
            while bucket and now - bucket[0] > settings.LOGIN_WINDOW_SECONDS:
                bucket.popleft()
            if len(bucket) >= settings.LOGIN_MAX_ATTEMPTS:
                retry_after = max(1, int(settings.LOGIN_WINDOW_SECONDS - (now - bucket[0])))
                raise AppException(
                    "Too many failed login attempts. Please try again later.",
                    status_code=429,
                    error_code="LOGIN_RATE_LIMITED",
                    retry_after=retry_after,
                )

    def record_failure(self, email: str, ip: str | None) -> None:
        now = time.monotonic()
        with self._lock:
            self._failures[self._key(email, ip)].append(now)

    def clear(self, email: str, ip: str | None) -> None:
        with self._lock:
            self._failures.pop(self._key(email, ip), None)


login_rate_limiter = LoginRateLimiter()
