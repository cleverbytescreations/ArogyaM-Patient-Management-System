# ArogyaM PMS — Security Checklist (SEC-T0.4)

**Application:** ArogyaM Patient Management System  
**Phase:** Phase 1 (R1 go-live)  
**Standard:** OWASP Top 10 (2021)  
**Date:** 2026-06-09  
**Reviewer:** Tech Lead / Security reviewer  
**Status:** ✅ = implemented & tested · 🔄 = in progress · ❌ = not yet addressed

> Each item maps to an OWASP Top 10 category, the SAD §10.1 control numbers
> it satisfies, and the backend test(s) that verify it.  Sign off this
> checklist before every R1 production go-live.

---

## A01 — Broken Access Control

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Deny-by-default RBAC — every endpoint declares `require_permission(...)` | `core/dependencies.py`, all routers | `tests/test_rbac_enforcement.py`, `tests/test_security.py` |
| ✅ | JWT bearer required on all non-public endpoints | `core/dependencies.py::get_current_user` | `TestAuthNegative::test_no_token_protected_endpoint` |
| ✅ | Disabled/locked user with valid token → 403 | `core/dependencies.py::require_active` | `TestAuthNegative::test_disabled_user_blocked` |
| ✅ | Record-level ownership — patient documents checked against patient membership | `modules/documents/service.py` | `tests/test_documents_timeline.py` |
| ✅ | Field-level visibility filtering — limited roles receive reduced clinical view | `modules/patients/service.py`, `modules/patients/schemas.py` | `tests/test_patients.py::TestFieldFiltering` |
| ✅ | Document download permission-checked before stream/pre-sign | `modules/documents/service.py::stream_document` | `tests/test_documents_timeline.py::test_unauthorized_download` |
| ✅ | No hard-delete on any patient/clinical/document record | all repositories (DB-T14.1) | `tests/test_security.py` |
| ✅ | Merge operations admin-gated (`merge_records` permission) | `modules/duplicates/` (R2) | R2 sprint |

---

## A02 — Cryptographic Failures

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Passwords hashed with bcrypt (cost ≥ 12) — never stored in plaintext | `core/security.py::hash_password` | `tests/test_auth.py::test_password_not_in_db` |
| ✅ | JWT signed with HS256 using a ≥32-byte secret from env — never hardcoded | `core/security.py`, `core/config.py` | `tests/test_config.py` |
| ✅ | Refresh tokens rotated on each use — old `jti` invalidated when Redis on | `modules/auth/service.py` | `tests/test_auth.py::test_refresh_rotation` |
| ✅ | `SQL_ECHO=false` in all environments — SQL parameters never logged | `core/config.py`, `core/db.py` | `tests/test_log_privacy.py` |
| ✅ | TLS in transit enforced by reverse proxy (DEV-TF.3) | `ops/proxy/nginx.conf` | Proxy smoke test in ops runbook |
| ✅ | Object storage at rest: MinIO encryption config (DEV-TF.8) | `ops/docker-compose.prod.yml` | Ops drill |
| 🔄 | Database volume encryption at rest (filesystem/disk encryption) | Hosting-level, documented in `ops/DEPLOYMENT.md` | Ops drill pre-go-live |

---

## A03 — Injection

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | All DB queries use SQLAlchemy parameterized statements — no string-built SQL | all repositories | `tests/test_input_validation.py::TestSQLInjection` |
| ✅ | Pydantic v2 strict schema validation at every API boundary | all routers/schemas | `tests/test_input_validation.py` |
| ✅ | Search queries sanitized and never interpolated into raw SQL | `modules/search/repository.py` | `tests/test_patients.py` |
| ✅ | HTML/template injection N/A — JSON-only API; no server-side HTML rendering | — | — |

---

## A04 — Insecure Design

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Inline duplicate-patient advisory — suggests existing records instead of silently overwriting | `modules/patients/service.py` | `tests/test_patients.py::TestDuplicateCheck` |
| ✅ | Finalize-before-amend pattern on discharge summaries — irreversible state enforced | `modules/clinical/discharge/service.py` | `tests/test_clinical_stage4.py` |
| ✅ | Audit trail append-only — no UPDATE/DELETE on `audit_log` table | `core/audit.py`, schema constraints | `tests/test_migrations.py` (table constraints) |
| ✅ | OP number generated inside a `SELECT … FOR UPDATE` transaction — no race condition | `modules/patients/op_number.py` | `tests/test_op_number.py::TestConcurrency` |

---

## A05 — Security Misconfiguration

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | CORS locked to SPA origin (wildcard forbidden outside dev) | `core/config.py`, `main.py` | `tests/test_proxy_config.py` |
| ✅ | Security response headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy | `core/middleware.py::SecurityHeadersMiddleware` | `tests/test_security.py::TestSecurityHeaders` |
| ✅ | Debug mode off in prod (`ENV=prod` disables reload and stack traces) | `core/config.py`, `main.py` | `tests/test_config.py` |
| ✅ | No secrets in code or Docker images — all via env | `core/config.py`, `.env.example` | `tests/test_secrets_management.py` |
| ✅ | Nginx query-string redaction on `/patients/search` | `ops/proxy/nginx.conf` | `tests/test_proxy_config.py` |
| ✅ | MinIO not publicly accessible — document URLs never exposed | `modules/documents/storage.py` | `tests/test_documents_timeline.py` |

---

## A06 — Vulnerable and Outdated Components

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | CI dep-scan with `pip-audit` (Python) and `npm audit` (Node) — fails on HIGH/CRITICAL | `.github/workflows/ci.yml::dep-scan` | CI gate |
| ✅ | CI image scan with Trivy on merged images — fails on HIGH/CRITICAL | `.github/workflows/ci.yml::image-scan` | CI gate |
| ✅ | Pinned base images in Dockerfiles (`python:3.12-slim`, `node:20-alpine`) | `backend/Dockerfile`, `frontend/Dockerfile` | CI image build |
| 🔄 | Periodic dependency update cadence (monthly review before R1) | `Docs/OPEN_QUESTIONS_LOG.md` | Process |

---

## A07 — Identification and Authentication Failures

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Login lockout after N failed attempts; generic error — no user enumeration | `modules/auth/service.py` | `tests/test_auth.py::TestLoginLockout` |
| ✅ | Locked/disabled user cannot authenticate with valid password | `modules/auth/service.py` | `tests/test_auth.py::test_locked_account` |
| ✅ | Auth rate limiting → `429 RATE_LIMITED` + `Retry-After` (SEC-T1.2, optional Redis) | `core/ratelimit.py` | `tests/test_security.py::TestRateLimiting` |
| ✅ | JWT access TTL = 15 min; refresh TTL = 8 h (configurable) | `core/security.py`, `core/config.py` | `tests/test_auth.py` |
| ✅ | Refresh token rotation — each use issues a new pair; old jti denylisted | `modules/auth/service.py` | `tests/test_auth.py::test_refresh_rotation` |
| ✅ | Password hash uses bcrypt (cost ≥ 12); `password_changed_at` stamped on reset | `core/security.py`, `modules/users/service.py` | `tests/test_users.py` |

---

## A08 — Software and Data Integrity Failures

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Optimistic concurrency `version` column on all mutable records | `core/concurrency.py`, applied across modules | `tests/test_patients.py`, `tests/test_visits.py` |
| ✅ | File upload: MIME sniff + extension allow-list + max size enforced | `modules/documents/service.py::_validate_upload` | `tests/test_documents_timeline.py` |
| ✅ | No SQL in migration files — all schema changes via Alembic (DB-T0.4) | `migrations/versions/` | `tests/test_migrations.py` |
| ✅ | CI secret scan (gitleaks) prevents committing credentials | `.github/workflows/ci.yml::secret-scan` | CI gate |

---

## A09 — Security Logging and Monitoring Failures

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | Audit trail on all sensitive actions: login, view/create/update patient, clinical records, upload, download, user changes | `core/audit.py`, wired in all services (LOG-T1.1) | `tests/test_auth.py`, `tests/test_patients.py`, `tests/test_documents_timeline.py` |
| ✅ | Structured JSON logging with allow-list — PII/PHI never in non-audit logs | `core/logging.py` | `tests/test_log_privacy.py` |
| ✅ | CI log-privacy guard — fails build if PII found in application logs | `tests/test_log_privacy.py`, CI job | CI gate (TST-T0.2) |
| ✅ | Backup alert on failure (INT-T13.2) — notify admin when nightly backup fails | `ops/backup/notify.sh` | Ops drill |
| 🔄 | Log retention ≥ 1 year; restricted file permissions (LOG-T0.3) | `ops/logging/logrotate.conf` | Ops review |
| 🔄 | Uptime monitoring wired to `/health` + `/ready` (DEV-TF.9) | `ops/observability/` | Smoke test |

---

## A10 — Server-Side Request Forgery (SSRF)

| # | Control | Implemented in | Test |
|---|---------|---------------|------|
| ✅ | No user-supplied URLs fetched server-side in Phase 1 | N/A (no webhook/URL-fetch endpoints) | N/A |
| ✅ | Document pre-signed URLs are generated by the server for internal MinIO — never proxied from user input | `modules/documents/storage.py` | `tests/test_documents_timeline.py` |
| ✅ | External integrations (SMTP only) use fixed admin-configured endpoints — not user-controlled | `core/notify.py` | N/A |

---

## Sign-Off

| Role | Name | Date | Signed |
|------|------|------|--------|
| Tech Lead | | | ☐ |
| Backend Dev | | | ☐ |
| Security Reviewer | | | ☐ |

> **Pre-go-live gate:** All ✅ items verified; all 🔄 items resolved or risk-accepted with a documented decision in `Docs/OPEN_QUESTIONS_LOG.md` before R1 production cutover.
