"""Read-through cache for quasi-static reference data.

Backends:
  • Redis  (``REDIS_URL`` set) — shared across workers; survives restart.
  • In-process dict (fallback) — single-process dev/test only.

Every entry is stored with a TTL (``ttl_sec``). Entries are also invalidated
explicitly on write via ``cache_delete``, so the TTL is a safety-net expiry
rather than the primary freshness mechanism.

Usage::

    from app.core.cache import cache_get, cache_set, cache_delete

    value = cache_get("masterdata:gender:all")
    if value is None:
        value = json.dumps([...])
        cache_set("masterdata:gender:all", value, ttl_sec=1800)

    # after a write:
    cache_delete("masterdata:gender:all", "masterdata:gender:active")
"""

from __future__ import annotations

import time

from .config import settings

# In-process fallback store: key → (serialised_value, expires_at_epoch)
_local_store: dict[str, tuple[str, float]] = {}

_redis_client = None


def _redis():
    """Lazily build a Redis client when REDIS_URL is configured, else None."""
    global _redis_client
    if not settings.redis_url:
        return None
    if _redis_client is None:
        import redis  # optional dependency; pulled in when REDIS_URL is set

        _redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def cache_get(key: str) -> str | None:
    client = _redis()
    if client is not None:
        return client.get(key)
    entry = _local_store.get(key)
    if entry is None:
        return None
    value, expires_at = entry
    if time.monotonic() >= expires_at:
        _local_store.pop(key, None)
        return None
    return value


def cache_set(key: str, value: str, ttl_sec: int = 1800) -> None:
    client = _redis()
    if client is not None:
        client.setex(key, ttl_sec, value)
    else:
        _local_store[key] = (value, time.monotonic() + ttl_sec)


def cache_delete(*keys: str) -> None:
    if not keys:
        return
    client = _redis()
    if client is not None:
        client.delete(*keys)
    else:
        for key in keys:
            _local_store.pop(key, None)


def cache_clear_local() -> None:
    """Clear the in-process store (test helper)."""
    _local_store.clear()
