"""Reusable audit-write helper (BE-TF.7, SAD §10 / Plan §10.1).

Append-only — participates in the caller's transaction so the audit row and
the business change commit/rollback atomically. The audit_log table is the ONLY
place allowed to hold patient/clinical detail in a log context.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.logging import SENSITIVE_KEYS


def _sanitize(obj: Any) -> Any:
    """Remove sensitive keys from dicts before storing in audit old/new JSON."""
    if isinstance(obj, dict):
        return {k: "***REDACTED***" if k in SENSITIVE_KEYS else _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(i) for i in obj]
    return obj


def write_audit(
    db: Session,
    *,
    action: str,
    user_id: str | uuid.UUID | None = None,
    user_role: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    patient_id: str | uuid.UUID | None = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    description: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> None:
    """Insert one audit_log row inside the current session/transaction."""
    from sqlalchemy import text

    db.execute(
        text(
            """
            INSERT INTO audit_log (
                user_id, user_role, action, entity_type, entity_id, patient_id,
                old_value, new_value, description, ip_address, user_agent, request_id
            ) VALUES (
                :user_id, :user_role, :action, :entity_type, :entity_id, :patient_id,
                CAST(:old_value AS jsonb), CAST(:new_value AS jsonb), :description,
                CAST(:ip_address AS inet), :user_agent, :request_id
            )
            """
        ),
        {
            "user_id": str(user_id) if user_id else None,
            "user_role": user_role,
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "patient_id": str(patient_id) if patient_id else None,
            "old_value": _to_json(old_value),
            "new_value": _to_json(new_value),
            "description": description,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "request_id": request_id,
        },
    )


def _to_json(obj: dict | None) -> str | None:
    if obj is None:
        return None
    import json
    return json.dumps(_sanitize(obj))


def extract_request_meta(request: Any) -> tuple[str | None, str | None, str | None]:
    """Pull ip_address, user_agent, request_id from a FastAPI Request."""
    import ipaddress

    ip = None
    ua = None
    rid = None
    if request is not None:
        raw_ip = getattr(getattr(request, "client", None), "host", None)
        if raw_ip:
            try:
                ipaddress.ip_address(raw_ip)
                ip = raw_ip
            except ValueError:
                ip = None  # non-IP host (e.g. "testclient" from test runner)
        ua = request.headers.get("user-agent")
        rid = getattr(getattr(request, "state", None), "request_id", None)
    return ip, ua, rid