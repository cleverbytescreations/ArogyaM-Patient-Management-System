"""ArogyaM PMS API entrypoint.

Stage 0 foundation: wires config, CORS, logging and the health/readiness probes
under the versioned `/api/v1` prefix. Feature modules (auth, patients, visits, …)
are mounted here as they are built (Implementation Plan §3, §14).
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import health
from app.core.config import settings

logging.basicConfig(level=settings.log_level.upper())

API_PREFIX = "/api/v1"

app = FastAPI(
    title="ArogyaM Patient Management System API",
    version=__version__,
    docs_url="/docs",
    openapi_url=f"{API_PREFIX}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix=API_PREFIX)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": "arogyam-api", "docs": "/docs", "health": f"{API_PREFIX}/health"}
