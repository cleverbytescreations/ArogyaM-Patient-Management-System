"""Read-through cache for quasi-static reference data.

Backends:
  • Redis  (``REDIS_URL`` set) — shared across workers; survives restart.
  • In-process dict (fallback) — single-process dev/test only.

Cache entries are invalidated explicitly on write (no TTL), so callers must
call ``cache_delete`` after committing mutations that affect cached data.

Usage::

    from app.core.cache import cache_get, cache_set, cache_delete

    value = cache_get("masterdata:gender:all")
    if value is None:
        value = json.dumps([...])
        cache_set("masterdata:gender:all", value)

    # after a write:
    cache_delete("masterdata:gender:all", "masterdata:gender:active")
"""

from __future__ import annotations

from .config import settings

_local_store: dict[str, str] = {}
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
    return _local_store.get(key)


def cache_set(key: str, value: str) -> None:
    client = _redis()
    if client is not None:
        client.set(key, value)
    else:
        _local_store[key] = value


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
