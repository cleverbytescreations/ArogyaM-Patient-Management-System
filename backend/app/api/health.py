"""Liveness and readiness probes (Implementation Plan §13 Observability).

- /health : liveness — process is up. Used by the compose API healthcheck.
- /ready  : readiness — dependencies (database) are reachable. Returns 503 if not.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Response, status

from app import __version__
from app.core.config import settings
from app.core.db import check_database
from app.modules.documents.storage import storage

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "arogyam-api", "version": __version__, "env": settings.env}


@router.get("/ready")
def ready(response: Response) -> dict[str, object]:
    checks: dict[str, str] = {}
    ok = True

    try:
        check_database()
        checks["database"] = "ok"
    except Exception:  # noqa: BLE001 — report unreachable without leaking details
        logger.warning("readiness: database check failed")
        checks["database"] = "unavailable"
        ok = False

    try:
        storage.ping()
        checks["storage"] = "ok"
    except Exception:  # noqa: BLE001
        logger.warning("readiness: storage check failed")
        checks["storage"] = "unavailable"
        ok = False

    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ok" if ok else "degraded", "checks": checks}
