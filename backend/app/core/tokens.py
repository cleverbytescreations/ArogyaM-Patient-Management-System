"""JWT denylist for logout + refresh-token rotation (BE-T1.3).

A presented refresh token is single-use: on rotation its ``jti`` is denied so it
cannot be replayed. Logout denies the current access token's ``jti``.

Storage backends:
  • Redis (``REDIS_URL`` set) — shared across workers/instances, survives restart.
  • In-process dict (fallback) — works for the single-process Phase 1 deployment
    (docker-compose, one uvicorn worker). Documented limitation: a multi-worker
    or multi-instance rollout MUST configure Redis for the denylist to be global.

Either way the entry self-expires at the token's own ``exp`` so the store never
grows unbounded.
"""

from __future__ import annotations

import time

from .config import settings

# jti -> unix-epoch expiry. Only used when Redis is not configured.
_local_denylist: dict[str, float] = {}
_redis_client = None


def _redis():
    """Lazily build a Redis client when REDIS_URL is configured, else None."""
    global _redis_client
    if not settings.redis_url:
        return None
    if _redis_client is None:
        import redis  # imported lazily so redis is an optional dependency

        _redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


def _purge_expired() -> None:
    now = time.time()
    expired = [jti for jti, exp in _local_denylist.items() if exp <= now]
    for jti in expired:
        _local_denylist.pop(jti, None)


def deny(jti: str | None, exp: float | int | None) -> None:
    """Add a token's jti to the denylist until its expiry.

    ``exp`` is the JWT ``exp`` claim (unix epoch seconds). A missing exp falls
    back to the configured refresh TTL so the entry still self-expires.
    """
    if not jti:
        return
    if exp is None:
        exp = time.time() + settings.jwt_refresh_ttl_min * 60

    client = _redis()
    if client is not None:
        ttl = max(1, int(exp - time.time()))
        client.setex(f"denylist:{jti}", ttl, "1")
        return

    _purge_expired()
    _local_denylist[jti] = float(exp)


def is_denied(jti: str | None) -> bool:
    if not jti:
        return False

    client = _redis()
    if client is not None:
        return bool(client.exists(f"denylist:{jti}"))

    _purge_expired()
    return jti in _local_denylist


def reset() -> None:
    """Clear the in-process denylist (test helper)."""
    _local_denylist.clear()
