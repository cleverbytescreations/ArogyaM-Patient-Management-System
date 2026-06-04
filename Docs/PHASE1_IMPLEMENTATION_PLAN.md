# Phase 1 Implementation Plan

**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Version:** 1.0
**Date:** 2026-06-04
**Status:** For Review
**Source References:**
- `Docs/usecases.md` — Phase 1 Detailed Use Case Document (UC-01 … UC-30)
- `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` — System Architecture Document (SAD v1.0)
- `Docs/DDL_DATAMODEL.sql` — Phase 1 Database DDL / Data Model

**Intended Audience:** Developers · Tech Lead · DevOps · QA · Project Manager

> This plan turns the approved use cases, architecture, and data model into a sequenced, developer-actionable build plan. It deliberately separates **MVP (Must-Have)** from **Full-Scope (Should/Could-Have)** so the team ships a working core first and layers refinements after. No application code is written in this step.

---

## 1. Overview

### 1.1 Purpose
Deliver a secure, web-based internal PMS that replaces paper case-sheet handling with: login & RBAC, patient registration with transaction-safe OP numbering, fast search, patient profile & timeline, visits/case sheets/consultation notes, prescriptions, discharge summaries, document upload, follow-up tracking, audit trail, duplicate detection & merge, basic dashboard/reports, and backup/recovery.

### 1.2 Solution Shape (from SAD)
A **modular monolith**: **React (Vite + TypeScript) SPA** → **Nginx/Caddy reverse proxy (TLS)** → **FastAPI (Python) REST API** → **PostgreSQL 15+**, with **MinIO/S3** for document binaries and **Redis (optional)** for caching/rate-limiting. Deployed as **Docker Compose on a single Linux VM**. Search uses **PostgreSQL FTS + pg_trgm** (no separate search engine).

### 1.3 Scope Boundaries
- **In scope (Phase 1):** 14 modules listed in SAD §2.1; the 30 use cases UC-01–UC-30.
- **Out of scope (deferred):** public registration, appointment booking, patient portal, SMS/WhatsApp, payments, ABDM/ABHA, AI/OCR, advanced analytics, mobile app, teleconsultation, pharmacy/lab integration.

### 1.4 Release Tiers
| Tier | Content |
|------|---------|
| **MVP (R1)** | Auth+RBAC · Patient registration · OP numbering · Search · Profile + timeline · Visits · Case sheets · Consultation notes · Prescriptions (entry/upload) · Discharge summaries (entry/upload) · Document upload · Follow-ups · Audit trail · Backup |
| **Full-Scope (R2)** | Duplicate detection & merge · Basic dashboard · Basic reports · Export · Master-data config UI · PDF generation · Advanced search filters · Document preview · Bulk historical import template |

### 1.5 Definition of Done (per feature)
Code merged via PR · unit + integration tests passing · RBAC enforced server-side · sensitive actions audited · inputs validated (Pydantic) · no PII/PHI in non-audit logs (SAD §10.1) · OpenAPI updated · migration applied · reviewed.

---

## 2. Implementation Approach

### 2.1 Principles
- **API-first:** Define OpenAPI contracts before UI; FastAPI auto-generates docs.
- **Vertical slices:** Build each module end-to-end (DB → repo → service → router → UI) so value is demonstrable early.
- **Modular monolith layering:** `routers/ → services/ → repositories/ → models/` with Pydantic schemas at the boundary. No business logic in routers; no SQL outside repositories.
- **Deny-by-default security:** Central auth dependency; every endpoint declares required permission and record-level rule.
- **Migrations as source of truth:** Alembic owns schema; the DDL file is the reference baseline for the initial migration.
- **Trunk-based dev:** Short-lived feature branches → PR → `main`; CI gates on lint, type-check, tests, security scan.

### 2.2 Backend Project Structure (target)
```
backend/app/
  core/        # config, security, logging, db session, dependencies
  modules/
    auth/      patients/   visits/    clinical/   documents/
    followups/ masterdata/ duplicates/ reports/   audit/   backup/
      router.py  service.py  repository.py  models.py  schemas.py
  migrations/  # Alembic
  tests/
```

### 2.3 Frontend Project Structure (target)
```
frontend/src/
  api/         # generated/typed API client, axios instance, interceptors
  auth/        # token store, route guards, permission hooks
  components/  # shared UI (forms, tables, timeline, file upload)
  features/    # one folder per module mirroring backend
  routes/      # role-gated routing
  lib/         # validation (zod), formatting, constants
```

### 2.4 Environments
Dev (local Docker Compose, seed data) → CI (ephemeral Postgres) → UAT (single VM mirror) → Production (single VM, TLS, nightly backups).

---

## 3. Module-wise Implementation Plan

Each module lists its primary use cases, key tables (from `DDL_DATAMODEL.sql`), core endpoints, and tier.

| # | Module | Use Cases | Key Tables | Core Endpoints | Tier |
|---|--------|-----------|------------|----------------|------|
| 1 | **User & Access / RBAC** | UC-01, UC-02 | `users`, `roles`, `user_roles`, `audit_log` | `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `GET /me`, `GET/POST/PUT /users`, `PUT /users/{id}/status` (enable/disable), `POST /users/{id}/reset-password`, `GET /roles`, `GET /me/permissions` | MVP |
| 2 | **Master Data** | UC-28, UC-04 (prefixes) | `master_data`, `op_sequence` | `GET/POST/PUT /master-data/{type}`, `GET/PUT /op-sequences` | MVP (data) / Full (config UI) |
| 3 | **Patient Registration & Profile** | UC-03, UC-06, UC-07, UC-16 | `patients`, `patient_aliases`, `op_sequence` | `POST/GET/PUT /patients`, `GET /patients/{id}/timeline` | MVP |
| 4 | **OP Numbering** | UC-04 | `op_sequence`, `patients` | (internal to registration txn) | MVP |
| 5 | **Search & Retrieval** | UC-05 | `patients` (+FTS/trgm), `patient_aliases` | `GET /patients/search` | MVP |
| 6 | **Visit & Consultation** | UC-08, UC-09, UC-10 | `visits`, `case_sheets`, `consultation_notes` | `POST /patients/{id}/visits`, `POST /visits/{id}/case-sheet`, `/consultation-notes` | MVP |
| 7 | **Prescriptions** | UC-11, UC-12 | `prescriptions`, `prescription_items`, `documents` | `POST/GET /visits/{id}/prescriptions` | MVP |
| 8 | **Discharge Summaries** | UC-13, UC-14 | `discharge_summaries`, `documents` | `POST/GET /visits/{id}/discharge-summary`, `PUT …/finalize` | MVP |
| 9 | **Documents** | UC-12, UC-14, UC-15, UC-30 | `documents` | `POST /patients/{id}/documents`, `GET /documents/{id}` (proxied) | MVP |
| 10 | **Patient Timeline** | UC-17 | all clinical + `documents` + `follow_ups` | `GET /patients/{id}/timeline` | MVP |
| 11 | **Follow-Up Tracking** | UC-20, UC-21 | `follow_ups` | `POST /patients/{id}/follow-ups`, `PUT /follow-ups/{id}` | MVP |
| 12 | **Audit Trail** | UC-25 | `audit_log` | `GET /audit-logs` (admin) | MVP |
| 13 | **Backup & Recovery** | UC-26, UC-27 | `backup_log` | `GET /backup/status` (admin) + ops scripts | MVP |
| 14 | **Concurrency Handling** | UC-29 | `version` columns, `op_sequence` lock | (cross-cutting) | MVP |
| 15 | **Duplicate Detection & Merge** | UC-18, UC-19 | `patients`, `patient_aliases`, `merge_requests`, `audit_log` | `GET /patients/duplicates`, `POST /merge-requests` (staff request), `GET /merge-requests?status=pending` (admin queue), `POST /merge-requests/{id}/approve` / `/reject` (admin) | Full-Scope |
| 16 | **Dashboard** | UC-22 | aggregates | `GET /dashboard/summary` | Full-Scope (basic) |
| 17 | **Reports & Export** | UC-23, UC-24 | views + `audit_log` | `GET /reports/{type}`, `POST /patients/{id}/export` | Full-Scope |

> **Doctor list (clarification):** Although SAD §7.4 groups "Doctor list" under master data, the data model implements it via `users.is_doctor = TRUE` (a user is the consulting doctor referenced by `visits.doctor_id`, `consultation_notes.doctor_id`, etc.) — **not** a `master_data` row. The doctor picker is sourced from `GET /users?is_doctor=true`; do not build a separate doctor lookup table.

---

## 4. Backend Implementation

### 4.1 Foundation (build first — blocks all modules)
- Project scaffold (FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic), `pyproject`, linting (ruff), typing (mypy).
- `core/config.py`: env-driven settings (DB URL, JWT secrets/TTLs, S3/MinIO creds, CORS origin, upload limits) — no secrets in code.
- `core/db.py`: SQLAlchemy engine/session, `echo=False` in prod.
- `core/security.py`: password hashing (argon2/bcrypt), JWT issue/verify, refresh rotation.
- `core/dependencies.py`: `get_current_user`, `require_permission(...)`, `require_active`, record-level guard helpers.
- `core/logging.py`: structured JSON logging + **redaction filter** (SAD §10.1) — allow-listed fields only.
- `core/audit.py`: reusable audit-write helper (writes `audit_log` with `request_id`, old/new JSON).
- `core/errors.py`: global exception handler → consistent envelope `{ "error": { code, message, details } }`.

### 4.2 Per-module backend pattern
For each module deliver: SQLAlchemy models → Pydantic schemas (request/response, snake_case) → repository (parameterized queries only) → service (business rules, transactions, audit calls) → router (RBAC dependency + validation) → tests.

### 4.3 Key backend business logic
- **OP numbering (UC-04/UC-29):** Inside the registration DB transaction — `SELECT … FROM op_sequence WHERE category_code=:c FOR UPDATE`, increment `last_sequence`, format `prefix + zero-pad(padding_width)`, persist patient. Guarantees no duplicates/no reuse.
- **Optimistic concurrency (UC-29):** Service compares client-supplied `version`; on mismatch return `409 Conflict` → UI forces reload. App increments `version` on update.
- **Duplicate detection (UC-18):** Mobile exact = high confidence; name (`pg_trgm` similarity) + DOB/gender = possible match. Returns suggestions, never auto-merges.
- **Merge request → approval (UC-18/UC-19, SAD §11.5/§12.2):** Two-step workflow. Receptionist/Data-Entry (or Admin) **request** a merge → a `merge_requests` row is created with `status='PENDING'` (states: `PENDING → APPROVED | REJECTED | CANCELLED`). Admins see the queue (`GET /merge-requests?status=pending`) and **approve** or **reject** with `decision_remarks`. Both request and decision are audited; non-admins cannot execute a merge.
- **Merge execution (UC-19, on approval):** Admin-only, single transaction: reassign `visits`/`documents`/`follow_ups` to the primary, set duplicate `status='MERGED'`, `merged_into=primary`, copy the old OP into `patient_aliases`, stamp `merge_requests.status='APPROVED'` + `merged_at`, write full before/after audit. Never physical delete; irreversible via normal UI.
- **Discharge finalize (UC-13):** On finalize set `is_finalized=TRUE`, `finalized_at/by`; block further edits; amendments create a new row linked via `amends_id`.
- **Document access (UC-30):** Permission check → stream via proxy endpoint or short-lived pre-signed URL; never expose object-store URLs; log access.

---

## 5. Frontend Implementation

### 5.1 Foundation
- Vite + React + TypeScript + MUI; axios client with JWT interceptor (attach access token, auto-refresh on 401, redirect on refresh failure).
- Auth context + token storage; **route guards** and a `usePermissions()` hook that hides unauthorized actions (UI gating mirrors—but does not replace—server enforcement).
- Shared components: data table (pagination/sort/filter), form wrapper with field-level validation (zod), file upload with client-side type/size pre-check, confirmation dialog, timeline component, toast/error display.

### 5.2 Screens (per SAD §5 menu / usecases §9)
1. **Login** (UC-01)
2. **Dashboard** (UC-22, role-filtered widgets) — Full-Scope basic
3. **Patient Search** (UC-05) — dashboard-first, partial name, OP, mobile
4. **New Patient Registration** (UC-03) with inline duplicate warning (UC-18)
5. **Patient Profile** tabs (UC-06, UC-17): Basic Details · Visits · Case Sheets · Consultation Notes · Prescriptions · Discharge Summaries · Documents · Follow-Ups · Audit History
6. **Visit** create + clinical entry forms (UC-08/09/10/11/13) mirroring paper case sheets
7. **Follow-Up Register** (UC-20/21)
8. **Documents Register** (UC-15) + secure viewer/download
9. **Reports** (UC-23/24) — Full-Scope
10. **User Management** (UC-02) — admin
11. **Master Data** (UC-28) — admin, Full-Scope UI
12. **Backup Status** (UC-26) — admin
13. **Audit Logs** (UC-25) — admin
14. **Merge Duplicates** (UC-19) — admin, Full-Scope

### 5.3 UX rules
Mandatory fields clearly marked; clinical forms resemble existing paper sheets; medical detail never shown in search result lists; conflict (409) shows reload prompt; no patient data cached beyond session.

### 5.4 Accessibility (baseline WCAG 2.1 AA — SAD §21)
Use accessible MUI components with correct semantics/ARIA; full keyboard navigation and visible focus order on all forms; labels programmatically associated with inputs and clear error announcements; colour-contrast ≥ AA and never colour-as-only-signal (e.g., follow-up status uses icon/text, not just colour); responsive layout usable at common desktop resolutions. Add an automated accessibility check (e.g., axe via Playwright/jest-axe) to CI for key screens.

---

## 6. API Implementation

- **Style:** REST/JSON over HTTPS; versioned under `/api/v1`.
- **Auth:** Bearer JWT (access + refresh); central RBAC dependency; deny-by-default.
- **Conventions:** snake_case JSON, ISO-8601 timestamps, UUID identifiers.
- **Pagination/sort/filter:** `?page=&page_size=&sort=&order=` + resource filters; response envelope includes `total, page, page_size`.
- **Errors:** consistent envelope with field-level validation detail and proper HTTP codes (400/401/403/404/409/422).
- **File transfer:** multipart upload with server-side type/size validation; downloads via permission-checked proxy or short-lived pre-signed URL.
- **Audit:** view-profile, upload, export, merge, login, user changes always write `audit_log`.
- **Docs:** OpenAPI/Swagger auto-published; optionally generate the TS client for the frontend.
- **Rate limiting (optional):** login throttling via Redis.

API groups exactly as SAD §9.2 (Auth, User, Role/Permission, Master Data, Patient, Search, Visit/Workflow, Clinical, Document, Follow-Up, Duplicate/Merge, Dashboard, Report, Audit, Backup).

---

## 7. Database Implementation

- **Baseline migration:** Convert `Docs/DDL_DATAMODEL.sql` into the initial Alembic migration (extensions, tables, constraints, indexes, `set_updated_at()` trigger, seed lookups). Keep the DDL file as the human-readable reference.
- **Seed data:** Roles, consultation categories, OP sequences (OPN/OPV/FC), visit/document types, follow-up statuses, blood groups, dietary prefs, marital status, gender, discharge conditions (already in DDL §9). Add a separate seed for the first Administrator user (hashed password via secure script, not committed).
- **Search:** Verify `pg_trgm` GIN on `patients.full_name` and GIN on generated `search_vector`; tune query to rank exact OP/mobile first, then name relevance.
- **Concurrency:** `version` columns on mutable records; `op_sequence` row lock in the registration transaction.
- **Soft delete:** Use `status`/`is_active` flags; no physical deletes of patients/clinical/documents.
- **Reporting:** SQL views for dashboard/report aggregations; promote to materialized views only if a report is slow.
- **Migration discipline:** Every schema change = a reviewed Alembic revision with up/down; forward-fix preferred for prod.
- **Performance:** Confirm indexes back the hot paths (search, timeline, pending-follow-ups composite `idx_follow_ups_status_date`, audit lookups).
- **Multi-branch readiness (future, no build now):** Single branch in Phase 1 — do **not** add `branch_id` yet, but keep services/repositories free of hard-coded single-branch assumptions so a nullable `branch_id` + branch-scoped access can be introduced later without restructuring (SAD §8.1/§24).

---

## 8. Authentication and Authorization

- **AuthN:** JWT access (short TTL) + refresh (rotation); argon2/bcrypt hashing; active-only login; generic error on bad credentials (no username enumeration, UC-01); failed-attempt counter + temporary lockout (`failed_login_attempts`, `locked_until`).
- **AuthZ (RBAC):** Coarse permissions (`create_patient`, `view_medical_history`, `add_consultation`, `merge_records`, `manage_users`, `view_audit`, `backup_control`, `export`, …) mapped from the UC §4 / SAD §11 matrix. Central dependency enforces per-endpoint + record-level rules; deny-by-default.
- **Field-level visibility:** Receptionist/data-entry get limited medical fields (response schema filtering by role) — limited ABAC, not a full engine.
- **Session:** inactivity timeout (configurable); server-side expiry; optional Redis denylist for logout/revocation.
- **Admin-only:** user management, master data, merge approval, audit review, backup/restore, OP-number correction — all audited.
- **User lifecycle (UC-02):** Admin can create/edit users, **enable/disable** (`PUT /users/{id}/status` → toggles `users.status`; disabled/locked users cannot authenticate), and **reset password** (`POST /users/{id}/reset-password` → sets a new hash, stamps `password_changed_at`, clears lockout). All three are audited; role changes audited per UC-02 BR4.
- **MFA (deferred, decision recorded):** Not implemented in Phase 1 (internal users only, SAD §10). Admin MFA is recommended for a future phase; auth layer should keep an extensibility seam (post-password step) so MFA can be added without redesign.
- **OWASP alignment:** Implementation explicitly targets the OWASP Top 10 — injection (parameterized queries), broken auth (JWT hygiene, lockout, no enumeration), broken access control (deny-by-default RBAC + record-level checks), sensitive-data exposure (TLS, secured docs, log redaction), and security misconfiguration (hardened containers, debug off). Verified by the security test suite (§12).

---

## 9. Validation and Error Handling

- **Input validation:** Pydantic v2 schemas at every boundary; strict types; reject unknown fields where appropriate.
- **Domain rules enforced (mirrors DB CHECKs):** patient minimum identity (name + ≥1 contact/ID field), non-future visit date unless scheduled, discharge_date ≥ admission_date, allow-listed file types (PDF/JPG/JPEG/PNG) + size limit, lookup-code existence against `master_data`.
- **SQL safety:** SQLAlchemy parameterized queries only — no string-built SQL.
- **Error envelope:** `{ "error": { "code", "message", "details" } }`; 422 with field detail for validation; 409 for version conflicts; 403 for RBAC; generic 500 with `request_id` (no internals leaked).
- **File upload:** server-side content-type sniffing + extension allow-list + max size; store outside web root in object storage; optional AV scan hook.

---

## 10. Logging and Audit Trail

### 10.1 Audit trail (business)
`audit_log` is the single place permitted to hold patient/clinical detail. Write for: login (incl. failures), view profile, create/update patient & clinical records, upload, export, merge, user/role/master-data changes, backup/restore. Capture user, role snapshot, action, entity type/id, affected patient, old/new JSON, IP, user agent, `request_id`. Append-only; admin-read-only.

### 10.2 Application logging (PII/PHI-safe — SAD §10.1)
- Allow-listed structured fields only: `request_id`, `user_id`, `role`, method, **route template** (`/patients/{id}`, not resolved value), status, latency.
- Central **redaction filter** masks sensitive keys (`name`, `mobile`, `email`, `address`, `dob`, `op_number`, clinical fields, search `q`).
- No request/response bodies on clinical/patient endpoints; uploads log metadata only.
- Search terms omitted/hashed; `echo=False` and debug off in prod; exception handler logs type+stack+`request_id` only.
- Reverse-proxy access logs drop/anonymize query strings.
- **CI guard:** test that scans representative request logs and fails if seeded PII appears in non-audit streams.

---

## 11. Integration Requirements

- **External integrations:** **None in Phase 1** (ABDM/ABHA, lab, pharmacy explicitly deferred).
- **Internal "integration-like" items:**
  - **Object storage (MinIO/S3):** S3-compatible client; bucket provisioning; pre-signed URL / proxy download; lifecycle/versioning config.
  - **SMTP (optional):** backup success/failure alert email to Administrator.
  - **Bulk historical import template (Could-Have, UC-16):** internal batch utility (CSV/Excel template) for migrated records, marking `is_historical=TRUE`, preserving old OP numbers as aliases — built as an internal admin tool, not an external connection.
- **Future-readiness (no build now):** adapter-layer seam, OAuth2/API-key secrets pattern, retry/backoff/idempotency — documented only.

---

## 12. Testing Strategy

| Level | Scope | Tooling |
|-------|-------|---------|
| **Unit** | Services/business rules: OP numbering, version conflict, duplicate scoring, merge logic, discharge finalize, RBAC permission map, validation | pytest |
| **Integration** | Routers + DB against ephemeral PostgreSQL (testcontainers/CI service): registration→OP→search→timeline, upload→secure download, follow-up lifecycle | pytest + httpx |
| **Concurrency** | Simultaneous registrations produce unique OP numbers; concurrent edits raise 409 (UC-29) | pytest (parallel) |
| **Security** | AuthN/Z negative tests (no token/expired/wrong role/disabled user), no username enumeration, document access denial, SQL-injection attempts | pytest |
| **Log-privacy** | Assert no PII/PHI in non-audit logs for representative clinical requests (SAD §10.1) | pytest + log capture |
| **Frontend** | Component + form validation; route-guard/permission gating; API mocks | Vitest + React Testing Library |
| **Accessibility** | Automated a11y checks (axe) on key screens; keyboard-nav smoke (SAD §21) | jest-axe / Playwright-axe |
| **Performance / Load** | Validate NFRs (SAD §8.3/§21) against a representative seeded dataset (tens of thousands of patients): search latency, dashboard load, concurrent-user throughput | k6 / Locust |
| **E2E (key flows)** | Login → register → search → visit → clinical entry → upload → follow-up | Playwright (optional R2) |
| **Migration** | Alembic up/down on clean DB; seed integrity | CI |

**NFR performance targets (baseline, confirm in SAD §27):** patient search p95 < 1s on a seeded ~50k-patient dataset; dashboard load p95 < 2s; system stable at the assumed 15–20 concurrent users (peak 30). Run load tests against UAT before R1 go-live; tune indexes / add materialized views only if a target is missed.
**CI gates:** lint (ruff/eslint), type-check (mypy/tsc), unit+integration tests, accessibility check, dependency scan (`pip-audit`/`npm audit`), image scan (Trivy), secret scan, log-privacy test.
**Coverage targets:** prioritize business-rule and security paths; OP numbering, merge request/approval, RBAC, and audit must have explicit tests.

---

## 13. Deployment Considerations

- **Packaging:** Docker images for API and frontend (static build served by Nginx/Caddy); `docker-compose.yml` with services: proxy, frontend, api, postgres (+volume), minio (+volume), redis (optional).
- **Reverse proxy/TLS:** Nginx or Caddy/Traefik; Let's Encrypt; HTTP→HTTPS redirect; secure headers; proxy query-string redaction for patient/search routes.
- **Config:** per-env `.env`/Docker secrets; no secrets in images; least-privilege DB user; debug disabled in prod.
- **CI/CD (GitHub Actions):** on PR → build/test/scan; on merge/tag → build versioned images (GHCR) → deploy to UAT then Prod (`docker compose pull && up -d` or deploy script).
- **Migrations on deploy:** run Alembic upgrade as a controlled step before API rollout.
- **Backup & recovery (UC-26/27):** nightly `pg_dump` + MinIO/document backup to off-server/offsite target via cron; record runs in `backup_log`; failure email alert; **documented + tested restore runbook**.
- **Observability:** `/health` (liveness), `/ready` (DB+storage), structured logs via Docker; optional Uptime Kuma; Prometheus/Grafana deferred to Full-Scope.
- **Rollback:** redeploy previous image tag; DB via tested backup/down-migration (favor forward-fix).
- **Release management (SAD §19):** semantic-version git tags drive image tags; maintain a `CHANGELOG`; each release records its Alembic migration notes (and any required manual/ops steps); promote the *same* images Dev → CI → UAT → Prod with only env config changing.
- **Encryption:** TLS in transit; disk/volume + object-store encryption at rest.

---

## 14. Implementation Sequence

Dependencies flow top-down; later stages assume earlier ones are complete.

### Stage 0 — Foundations (blocks everything)
Repo scaffold (backend + frontend) · Docker Compose dev env · PostgreSQL + MinIO up · Alembic baseline from DDL · CI pipeline skeleton · `core/` (config, db, security, logging+redaction, errors, audit helper, RBAC dependency).

### Stage 1 — Auth & Access (MVP)
`roles`/`users`/`user_roles` seed + first admin · login/refresh/logout · `GET /me` + permissions · User Management (admin) · login & user-change auditing · frontend auth shell, guards, login screen.
*Depends on:* Stage 0.

### Stage 2 — Master Data & OP Numbering (MVP)
Master-data read APIs + seed verification · `op_sequence` access · OP-number generation service (locked txn).
*Depends on:* Stage 1.

### Stage 3 — Patient Core (MVP)
Registration (with OP numbering + inline duplicate warning) · profile view/edit (role-filtered, version-checked, audited) · `patient_aliases` · Search (FTS/trgm) · Registration + Search + Profile screens.
*Depends on:* Stage 2.

### Stage 4 — Visits & Clinical (MVP)
Visits · case sheets · consultation notes · prescriptions (+items) · discharge summaries (+finalize/amend) · clinical forms + version-conflict UX.
*Depends on:* Stage 3.

### Stage 5 — Documents & Timeline (MVP)
Upload (validation + MinIO) · secure proxied download (UC-30) · document register · patient timeline aggregation (UC-17).
*Depends on:* Stage 4 (links to visits/clinical).

### Stage 6 — Follow-Ups (MVP)
Create/update follow-ups · status lifecycle · Follow-Up Register screen.
*Depends on:* Stage 3/4.

### Stage 7 — Audit & Backup hardening (MVP)
Audit-log read API + Audit History tab · backup scripts + `backup_log` + `GET /backup/status` + alert · restore runbook + restore test.
*Depends on:* cross-cutting; finalize before R1 go-live.

### Stage 8 — Full-Scope (R2)
Duplicate detection list · **merge request (staff) → admin approve/reject → merge execution** (`merge_requests`) · basic dashboard · basic reports + export (audited) · master-data config UI · PDF generation · advanced search filters · document preview · bulk historical import template.
*Depends on:* MVP (R1) stable.

**Milestones:** M1 = Stage 0–1 (auth working) · M2 = Stage 2–3 (register + search + profile) · M3 = Stage 4–6 (clinical + docs + follow-up) · M4 = Stage 7 (R1 go-live ready) · M5 = Stage 8 (Full-Scope).

### 14.1 Indicative Effort, Timeline & Roles
Estimates are **indicative** (small team of ~2–3 engineers) and must be confirmed once the SAD §27 open questions and final team size are known.

| Stage | Indicative effort | Primary roles |
|-------|-------------------|---------------|
| 0 — Foundations | 1.5–2 wks | Backend lead + DevOps |
| 1 — Auth & Access | 1.5–2 wks | Backend + Frontend |
| 2 — Master Data & OP | 1 wk | Backend |
| 3 — Patient Core | 2–3 wks | Backend + Frontend |
| 4 — Visits & Clinical | 2.5–3 wks | Backend + Frontend |
| 5 — Documents & Timeline | 1.5–2 wks | Backend + Frontend + DevOps (MinIO) |
| 6 — Follow-Ups | 1 wk | Backend + Frontend |
| 7 — Audit & Backup hardening | 1–1.5 wks | Backend + DevOps |
| **R1 subtotal** | **~12–16 wks** | — |
| 8 — Full-Scope (R2) | 4–6 wks | Full team |

**Suggested roles:** Tech Lead (architecture/reviews), 1–2 Backend (FastAPI/Postgres), 1 Frontend (React), part-time DevOps (Docker/CI/backup), part-time QA (test automation). A single full-stack pair can deliver R1 sequentially at the longer end of the range. Run QA and security/log-privacy tests continuously, not as a final phase.

---

## 15. Risks and Mitigation

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| 1 | OP-number duplication under concurrency | High | Row-locked `op_sequence` inside registration txn; concurrency test in CI (UC-29) |
| 2 | Lost updates from concurrent edits | Medium | Optimistic `version` → 409 + reload UX; tested |
| 3 | PII/PHI leakage via app/proxy logs | High | Redaction filter, allow-listed fields, no body/SQL logging in prod, proxy query-string redaction, CI log-privacy test (SAD §10.1) |
| 4 | Unauthorized access to records/documents | High | Deny-by-default RBAC, record-level checks, proxied/pre-signed downloads, access auditing |
| 5 | Unsafe merge losing history | High | Two-step request→admin-approval (`merge_requests`), single-txn merge on approval, soft-inactivate (never delete), aliases retained, full before/after audit, confirmation required |
| 6 | Poor historical/migrated data quality | Medium | `is_historical` flag, approximate dates + remarks, alias preservation, dedup review, import-template validation |
| 7 | Backup failure / untested restore | High | Automated nightly backups, failure alert, scheduled restore drills before go-live |
| 8 | Insecure file uploads (malware/oversized) | Medium | Type allow-list + size limit + content sniffing, store outside web root, optional AV hook |
| 9 | Single-VM single point of failure | High | Off-server backups, restart policies, documented restore; HA path defined for Full-Scale (SAD §23) |
| 10 | Scope creep into future-phase features | Medium | Strict MVP/Full-Scope/Future separation; change control |
| 11 | Search performance as data grows | Low/Med | Proper B-tree/GIN/trgm indexes, pagination, optional cache, materialized views when needed |
| 12 | Non-technical user adoption | Medium | Paper-like forms, dashboard-first search, mandatory-field clarity, training |
| 13 | Unconfirmed open questions (OP format, retention, hosting) | Medium | Resolve SAD §27 items before locking config; OP format already parameterized in `op_sequence` |

---

## Appendix A — Open Questions to Resolve Before Build Lock
Carried from SAD §27 — confirm early as they affect config/sizing, not architecture:
concurrent-user count · patient/historical volume · mandatory reports for go-live · receptionist field-level visibility rules · data retention/deletion policy · backup frequency/retention/offsite + RPO/RTO · hosting (cloud vs on-prem → MinIO vs S3) · SMTP details · network exposure (intranet/VPN/public) · upload size limit + AV requirement · DPDP specifics/consent · PDF-at-launch decision · exact OP prefixes/padding/reset rules · future-integration influence · backup ownership.

---

*End of Phase 1 Implementation Plan — ArogyaM Patient Management System, v1.0.*
