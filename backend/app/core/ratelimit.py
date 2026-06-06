"""Login rate limiting (SEC-T1.2).

Tracks login attempts per client identifier (IP address or fallback string) in
a fixed time window.

Backends:
  • Redis  (``REDIS_URL`` set) — shared across workers/instances; survives restart.
  • In-process dict (fallback) — single-process dev/test deployment only.

Either way the window self-expires so the store never grows unbounded.

Usage::

    from app.core.ratelimit import check_login_rate_limit
    check_login_rate_limit("1.2.3.4")  # raises RateLimitError if over limit
"""

from __future__ import annotations

import time

from .config import settings
from .errors import RateLimitError

# ---------------------------------------------------------------------------
# In-process fallback store: key → (count, window_expires_epoch)
# ---------------------------------------------------------------------------
_local_store: dict[str, tuple[int, float]] = {}

_redis_client = None


def _redis():
    """Lazily build a Redis client when REDIS_URL is configured, else None."""
    global _redis_client
    if not settings.redis_url:
        return None
    if _redis_client is None:
        import redis  # optional dependency — see requirements.txt (pulled in for REDIS_URL)

        _redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _purge_expired() -> None:
    now = time.time()
    stale = [k for k, (_, exp) in _local_store.items() if exp <= now]
    for k in stale:
        _local_store.pop(k, None)


def check_login_rate_limit(identifier: str) -> None:
    """Increment the attempt counter for ``identifier`` and raise if over limit.

    Raises ``RateLimitError`` with a ``retry_after`` value when the caller
    has exceeded ``rate_limit_login_max`` attempts within the current
    ``rate_limit_login_window_sec`` window.  Does nothing when rate limiting
    is disabled via config.
    """
    if not settings.rate_limit_enabled:
        return

    limit = settings.rate_limit_login_max
    window = settings.rate_limit_login_window_sec

    client = _redis()
    if client is not None:
        _check_redis(client, identifier, limit, window)
    else:
        _check_local(identifier, limit, window)


def _check_redis(client, identifier: str, limit: int, window: int) -> None:
    """Redis-backed fixed-window counter."""
    now = int(time.time())
    bucket = now // window
    key = f"ratelimit:login:{identifier}:{bucket}"

    count = client.incr(key)
    if count == 1:
        # First hit in this window — set TTL so Redis cleans up automatically.
        client.expire(key, window)

    if count > limit:
        ttl = client.ttl(key)
        retry_after = max(1, ttl)
        raise RateLimitError(
            f"Too many login attempts. Try again in {retry_after} seconds.",
            retry_after=retry_after,
        )


def _check_local(identifier: str, limit: int, window: int) -> None:
    """In-process fixed-window counter (single-process deployments only)."""
    now = time.time()
    window_start = (int(now) // window) * window
    window_end = window_start + window
    key = f"{identifier}:{window_start}"

    _purge_expired()

    if key not in _local_store:
        _local_store[key] = (1, window_end)
    else:
        count, exp = _local_store[key]
        _local_store[key] = (count + 1, exp)

    count, exp = _local_store[key]
    if count > limit:
        retry_after = max(1, int(exp - now))
        raise RateLimitError(
            f"Too many login attempts. Try again in {retry_after} seconds.",
            retry_after=retry_after,
        )


def reset() -> None:
    """Clear the in-process rate limit store (test helper)."""
    _local_store.clear()
