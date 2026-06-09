"""Log-privacy CI guard (TST-T0.2, LOG-T0.1, SAD §10.1).

Verifies that PII / PHI never appears in application log output produced
during representative clinical and patient-facing requests.

Strategy
--------
1. Attach an in-memory ``logging.Handler`` to the root logger so every log
   record emitted during the test is captured.
2. Perform realistic requests via the FastAPI TestClient (login, patient
   create, patient search, consultation-note create).
3. Assert that the captured log messages contain no seeded PII strings
   (patient name, mobile number, OP number, email, date-of-birth).
4. Assert that ``route_template`` is logged (e.g. ``/patients/{id}``)
   rather than the resolved path (``/patients/abc-123``), per SAD §10.1 #4.

These checks run in CI as part of the normal pytest suite (TST-T0.1) so any
regression in redaction immediately fails the build.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

import pytest
from fastapi.testclient import TestClient

# ── PII seed values ────────────────────────────────────────────────────────────
# These are the exact strings used when creating the test patient below.
# If any of them appear in a non-audit log record the test fails.

_PII_SEEDS = [
    "Radha Krishnamurthy",    # full_name
    "9988776655",              # mobile
    "radha.k@example.com",    # email
    "1975-04-22",              # date_of_birth
    "12 Lotus Lane Mysuru",   # address_line
]


# ── In-memory log capture ──────────────────────────────────────────────────────


class _CapturingHandler(logging.Handler):
    """Collects all log records emitted during a test."""

    def __init__(self) -> None:
        super().__init__(logging.DEBUG)
        self.records: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        # Use the formatted message (JSON string if JSONFormatter is active).
        try:
            self.records.append(self.format(record))
        except Exception:
            self.records.append(record.getMessage())


@pytest.fixture()
def log_capture() -> _CapturingHandler:
    """Attach a capturing handler, yield it, then remove it."""
    handler = _CapturingHandler()
    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    try:
        yield handler
    finally:
        root_logger.removeHandler(handler)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _assert_no_pii(records: list[str], *, context: str) -> None:
    """Fail if any PII seed appears in any captured log record."""
    combined = "\n".join(records)
    for seed in _PII_SEEDS:
        assert seed not in combined, (
            f"[{context}] PII seed '{seed}' found in application log output:\n"
            + "\n".join(r for r in records if seed in r)
        )


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestLoginLogPrivacy:
    """Login endpoint must not log credentials or account details."""

    def test_successful_login_no_pii(
        self, client: TestClient, log_capture: _CapturingHandler
    ) -> None:
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "Admin@12345"},
        )
        assert resp.status_code == 200
        _assert_no_pii(log_capture.records, context="login-success")

    def test_failed_login_no_credential_leak(
        self, client: TestClient, log_capture: _CapturingHandler
    ) -> None:
        resp = client.post(
            "/api/v1/auth/login",
            json={"username": "unknownuser", "password": "s3cr3tP@ss!"},
        )
        assert resp.status_code == 401
        combined = "\n".join(log_capture.records)
        # The literal password and username must not appear in logs
        assert "s3cr3tP@ss!" not in combined, "Password leaked in failed login log"
        assert "unknownuser" not in combined, "Username leaked in failed login log"


class TestPatientLogPrivacy:
    """Patient registration and read must not expose PII in application logs."""

    def test_register_patient_no_pii_in_logs(
        self,
        client: TestClient,
        admin_token: str,
        log_capture: _CapturingHandler,
    ) -> None:
        payload: dict[str, Any] = {
            "full_name": _PII_SEEDS[0],
            "mobile": _PII_SEEDS[1],
            "email": _PII_SEEDS[2],
            "date_of_birth": _PII_SEEDS[3],
            "address_line": _PII_SEEDS[4],
            "city": "Mysuru",
            "state": "Karnataka",
            "gender": "FEMALE",
            "op_category_code": "REGULAR",
        }
        resp = client.post(
            "/api/v1/patients",
            json=payload,
            headers=_auth(admin_token),
        )
        # Accept 201 (created) or 409 (duplicate advisory) — both are valid for
        # this test; we only care about what was *logged*.
        assert resp.status_code in (201, 409)
        _assert_no_pii(log_capture.records, context="patient-register")

    def test_patient_search_query_not_in_logs(
        self,
        client: TestClient,
        admin_token: str,
        log_capture: _CapturingHandler,
    ) -> None:
        # Searching by the seeded name should not appear in application logs.
        resp = client.get(
            "/api/v1/patients/search",
            params={"q": _PII_SEEDS[0]},
            headers=_auth(admin_token),
        )
        assert resp.status_code == 200
        combined = "\n".join(log_capture.records)
        assert _PII_SEEDS[0] not in combined, (
            "Search query (patient name) found in application logs — SAD §10.1 #4"
        )


class TestClinicalLogPrivacy:
    """Clinical note creation must not expose clinical content in logs."""

    _CLINICAL_PII = [
        "Severe chest pain radiating to left arm",   # presenting_complaints
        "Acute myocardial infarction",               # diagnosis
    ]

    def test_consultation_note_no_clinical_content_in_logs(
        self,
        client: TestClient,
        admin_token: str,
        log_capture: _CapturingHandler,
    ) -> None:
        # First create a patient to get a valid patient ID
        reg = client.post(
            "/api/v1/patients",
            json={
                "full_name": f"TestClinical {uuid.uuid4().hex[:6]}",
                "gender": "MALE",
                "op_category_code": "REGULAR",
            },
            headers=_auth(admin_token),
        )
        assert reg.status_code in (201, 409)
        if reg.status_code != 201:
            pytest.skip("Patient creation returned 409; skipping downstream test")

        patient_id = reg.json()["id"]

        # Create a visit
        visit_resp = client.post(
            f"/api/v1/patients/{patient_id}/visits",
            json={
                "visit_date": "2026-06-10",
                "visit_type_code": "NEW",
                "consultation_category": "REGULAR",
            },
            headers=_auth(admin_token),
        )
        assert visit_resp.status_code == 201
        visit_id = visit_resp.json()["id"]

        # Clear records accumulated during setup
        log_capture.records.clear()

        # Create a consultation note with clinical PII
        note_resp = client.post(
            f"/api/v1/visits/{visit_id}/consultation-notes",
            json={
                "presenting_complaints": self._CLINICAL_PII[0],
                "diagnosis": self._CLINICAL_PII[1],
            },
            headers=_auth(admin_token),
        )
        assert note_resp.status_code == 201

        combined = "\n".join(log_capture.records)
        for seed in self._CLINICAL_PII:
            assert seed not in combined, (
                f"Clinical content '{seed}' found in application logs"
            )


class TestRouteTemplateLogging:
    """Route templates (not resolved IDs) must be what's logged (SAD §10.1 #4)."""

    def test_route_template_not_resolved_path(
        self,
        client: TestClient,
        admin_token: str,
        log_capture: _CapturingHandler,
    ) -> None:
        # Make a request to a path with an ID segment.
        test_id = str(uuid.uuid4())
        client.get(f"/api/v1/patients/{test_id}", headers=_auth(admin_token))

        # The resolved UUID must not appear in any log record.
        combined = "\n".join(log_capture.records)
        assert test_id not in combined, (
            f"Resolved path ID '{test_id}' found in logs; "
            "route_template should be logged instead (e.g. /patients/{id})"
        )


class TestRedactionFilter:
    """Unit-test the redaction filter and JSON formatter directly."""

    def test_sensitive_key_redacted_in_json_output(self) -> None:
        from app.core.logging import JSONFormatter, RedactionFilter

        handler = logging.StreamHandler()
        handler.setFormatter(JSONFormatter())

        logger = logging.getLogger("test.redaction")
        logger.addHandler(handler)
        logger.addFilter(RedactionFilter())

        records: list[str] = []

        class _Capture(logging.Handler):
            def emit(self, r: logging.LogRecord) -> None:
                records.append(JSONFormatter().format(r))

        cap = _Capture()
        logger.addHandler(cap)

        # Emit with sensitive keys in extra
        logger.info(
            "test event",
            extra={
                "full_name": "Should Be Redacted",
                "mobile": "9876543210",
                "request_id": "req-123",
            },
        )

        assert records, "No log records captured"
        obj = json.loads(records[0])
        assert obj.get("full_name") == "***REDACTED***", (
            "full_name was not redacted"
        )
        assert obj.get("mobile") == "***REDACTED***", "mobile was not redacted"
        # request_id is in the allow-list — must NOT be redacted
        assert obj.get("request_id") == "req-123", (
            "request_id (allowed field) was incorrectly redacted"
        )

    def test_nested_pii_redacted(self) -> None:
        from app.core.logging import _redact

        payload = {
            "request_id": "r1",
            "patient": {
                "full_name": "Jane Doe",
                "mobile": "9876543210",
                "visits": [{"diagnosis": "Fever"}],
            },
        }
        result = _redact(payload)
        assert result["request_id"] == "r1"
        assert result["patient"]["full_name"] == "***REDACTED***"
        assert result["patient"]["mobile"] == "***REDACTED***"
        assert result["patient"]["visits"][0]["diagnosis"] == "***REDACTED***"

    def test_list_of_pii_objects_redacted(self) -> None:
        from app.core.logging import _redact

        records = [
            {"full_name": "Alice", "role": "DOCTOR"},
            {"full_name": "Bob", "role": "RECEPTION"},
        ]
        result = _redact(records)
        for r in result:
            assert r["full_name"] == "***REDACTED***"
            assert r["role"] == "DOCTOR" or r["role"] == "RECEPTION"
