"""ArogyaM PMS API entrypoint (API-T0.1).

All routes are mounted under /api/v1. The app wires:
  • Request-ID middleware
  • Structured JSON logging with PII redaction
  • Global error handlers producing the consistent error envelope
  • Auth, User, Role, and Health routers
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError
from sqlalchemy.exc import DataError

from app import __version__
from app.api import health
from app.core.config import settings
from app.core.errors import (
    AppError,
    RateLimitError,
    app_error_handler,
    db_data_error_handler,
    generic_error_handler,
    jwt_error_handler,
    rate_limit_error_handler,
    validation_error_handler,
)
from app.core.logging import setup_logging
from app.core.middleware import RequestIDMiddleware, SecurityHeadersMiddleware
from app.modules.auth.router import me_router
from app.modules.auth.router import router as auth_router
from app.modules.masterdata.router import op_seq_router
from app.modules.masterdata.router import router as masterdata_router
from app.modules.patients.router import router as patients_router
from app.modules.users.router import roles_router
from app.modules.users.router import router as users_router

setup_logging(settings.log_level)

API_PREFIX = "/api/v1"

app = FastAPI(
    title="ArogyaM Patient Management System API",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url=f"{API_PREFIX}/openapi.json",
)

# ── Middleware ─────────────────────────────────────────────────────────────────
# Note: Starlette applies middleware in reverse registration order. Register
# SecurityHeaders before RequestID so both run correctly on the response path.
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global exception handlers ──────────────────────────────────────────────────
# Register RateLimitError before AppError so its specific handler wins
# (Starlette resolves by MRO — most specific type in the handler map wins).
app.add_exception_handler(RateLimitError, rate_limit_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(JWTError, jwt_error_handler)
app.add_exception_handler(DataError, db_data_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, generic_error_handler)

# ── Routers ────────────────────────────────────────────────────────────────────
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(me_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(roles_router, prefix=API_PREFIX)
app.include_router(masterdata_router, prefix=API_PREFIX)
app.include_router(op_seq_router, prefix=API_PREFIX)
app.include_router(patients_router, prefix=API_PREFIX)


@app.get("/", include_in_schema=False)
def root() -> dict[str, str]:
    return {"service": "arogyam-api", "docs": "/docs", "health": f"{API_PREFIX}/health"}
