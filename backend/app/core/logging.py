"""Structured JSON logging with PII/PHI redaction filter (BE-TF.6, SAD §10.1).

Allow-listed fields only: request_id, user_id, role, method, route_template,
status, latency. Sensitive keys are replaced with ***REDACTED***.
Request/response bodies on clinical/patient endpoints are never logged.
"""

from __future__ import annotations

import json
import logging
import traceback
from typing import Any

SENSITIVE_KEYS: frozenset[str] = frozenset(
    {
        "name",
        "full_name",
        "mobile",
        "email",
        "address",
        "address_line",
        "dob",
        "date_of_birth",
        "op_number",
        "q",
        "password",
        "password_hash",
        "diagnosis",
        "presenting_complaints",
        "observations",
        "treatment_advice",
        "medicine_name",
        "dosage",
    }
)

ALLOWED_EXTRA_KEYS: frozenset[str] = frozenset(
    {
        "request_id",
        "user_id",
        "role",
        "method",
        "route_template",
        "status",
        "latency",
        "exc_type",
        "action",
        "entity_type",
    }
)


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: "***REDACTED***" if k in SENSITIVE_KEYS else _redact(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


class RedactionFilter(logging.Filter):
    """Strips sensitive keys from the `extra` dict attached to log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        for key in list(vars(record).keys()):
            if key in SENSITIVE_KEYS:
                setattr(record, key, "***REDACTED***")
        return True


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        for key in ALLOWED_EXTRA_KEYS:
            val = getattr(record, key, None)
            if val is not None:
                log_obj[key] = val

        if record.exc_info:
            log_obj["exc_type"] = record.exc_info[0].__name__ if record.exc_info[0] else None

        return json.dumps(_redact(log_obj))


def setup_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    root.setLevel(level.upper())

    if root.handlers:
        root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    handler.addFilter(RedactionFilter())
    root.addHandler(handler)

    # Suppress noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)