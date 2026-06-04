# Phase 1 — API / Backend Developer Task Checklist

**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Scope source:** `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` (SAD v1.0) · `Docs/PHASE1_IMPLEMENTATION_PLAN.md` · `Docs/API_SPECIFICATION_OPENAPI.md`
**Companion:** UI tasks are tracked separately in `Docs/PHASE_1_UI_TASK_CHECKLIST.md`
**Date:** 2026-06-04
**Status:** For build

> **How to read this checklist**
> - Tasks are grouped under the 8 required sections (Backend, API, Database, Integration, Security, Logging & Audit, Testing, Documentation), and **within each section by Module** (module numbering follows Plan §3 / SAD §7).
> - Task ID pattern: `<SECTION>-T<module>.<seq>` (e.g. `BE-T9.1`, `API-T9.2`). Foundation/cross-cutting tasks use `F` (foundation) or `0`.
> - Effort tags: **[S]** ≤0.5 day · **[M]** ~1–2 days · **[L]** ~3+ days.
> - Tier tags: **(MVP)** = R1 must-have · **(R2)** = Full-Scope.
> - All tasks are unchecked `[ ]` by default. **No code is to be written in this planning step.**
>
> **Module map:** 0 Foundation · 1 Auth/RBAC · 2 Master Data · 3 Patient Reg & Profile · 4 OP Numbering · 5 Search · 6 Visit & Consultation · 7 Prescriptions · 8 Discharge Summaries · 9 Documents · 10 Patient Timeline · 11 Follow-Ups · 12 Audit Trail · 13 Backup & Recovery · 14 Concurrency · 15 Duplicate Detection & Merge (R2) · 16 Dashboard (R2) · 17 Reports & Export (R2) · 18 System/Health.

---

## 1. Backend Tasks

### Module 0 — Foundation & Core (blocks all modules)

- [ ] **BE-TF.1 [L]** — Scaffold FastAPI backend project (MVP)
      **Description:** Create the backend project skeleton per Plan §2.2 (`core/`, `modules/`, `migrations/`, `tests/`) with the modular-monolith layering `routers → services → repositories → models` and Pydantic schemas at the boundary.
      **Files / Components:** `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/main.py`, `backend/app/core/`, `backend/app/modules/`, `backend/app/tests/`.
      **Implementation Notes:** Pin FastAPI, SQLAlchemy 2.x, Pydantic v2, Alembic, uvicorn, argon2/bcrypt, python-jose/pyjwt, boto3/minio, httpx (tests). Configure ruff (lint) and mypy (typing). No business logic in routers; no SQL outside repositories.
      **Acceptance Criteria:** App boots with `uvicorn`; `ruff` and `mypy` run clean on the skeleton; folder structure matches Plan §2.2.

- [ ] **BE-TF.2 [M]** — Environment-driven configuration (MVP)
      **Description:** Implement `core/config.py` with a Pydantic `Settings` object reading all config from environment (DB URL, JWT secret + access/refresh TTLs, S3/MinIO creds + bucket, CORS origin, upload max size, allowed MIME types, rate-limit toggles).
      **Files / Components:** `backend/app/core/config.py`, `backend/.env.example`.
      **Implementation Notes:** No secrets in code or VCS (SAD §10). Provide sane dev defaults but require secrets via env. Expose typed settings singleton.
      **Acceptance Criteria:** Settings load from env; missing required secret fails fast at startup; `.env.example` documents every key with no real secret.

- [ ] **BE-TF.3 [M]** — Database session & engine (MVP)
      **Description:** Implement `core/db.py` — SQLAlchemy 2.x engine, session factory, FastAPI `get_db` dependency, `Base` declarative class. `echo=False` in prod (SAD §10.1 control #5).
      **Files / Components:** `backend/app/core/db.py`.
      **Implementation Notes:** Use a request-scoped session with proper commit/rollback/close; connection pool sized for ~15–30 concurrent users.
      **Acceptance Criteria:** A test endpoint can open a session, run a parameterized query, and close cleanly; `echo` is driven by env and off in prod profile.

- [ ] **BE-TF.4 [L]** — Security primitives (MVP)
      **Description:** Implement `core/security.py` — password hashing (argon2/bcrypt), JWT issue/verify for access + refresh, refresh-token rotation, `jti` generation, claims builder per API spec §2.2.
      **Files / Components:** `backend/app/core/security.py`.
      **Implementation Notes:** Access TTL ~15 min, refresh ~8 h (configurable). Claims: `sub, username, roles[], permissions[], is_doctor, type, iat, exp, jti`. Keep a post-password extensibility seam for future MFA (Plan §8).
      **Acceptance Criteria:** Hash/verify round-trips; tokens encode/decode with expected claims; expired/invalid tokens rejected; refresh rotation returns a new `jti`.

- [ ] **BE-TF.5 [L]** — Auth & RBAC dependencies (MVP)
      **Description:** Implement `core/dependencies.py` — `get_current_user`, `require_active`, `require_permission(...)`, and record-level guard helpers. Deny-by-default.
      **Files / Components:** `backend/app/core/dependencies.py`, `backend/app/core/permissions.py` (static permission→role map).
      **Implementation Notes:** Central enforcement per endpoint + per record (SAD §11.3). Permission constants from API spec §2.3. Disabled/locked user with valid token → `403 AUTH_ACCOUNT_DISABLED`.
      **Acceptance Criteria:** Endpoint declaring `require_permission("x")` returns 403 for users lacking `x`; 401 for no/expired token; permission map matches SAD §11.2.

- [ ] **BE-TF.6 [M]** — Structured logging + redaction filter (MVP)
      **Description:** Implement `core/logging.py` — JSON structured logging with an allow-listed field set and a central redaction filter (SAD §10.1).
      **Files / Components:** `backend/app/core/logging.py`.
      **Implementation Notes:** Allow-list only `request_id, user_id, role, method, route_template, status, latency`. Redact `name, mobile, email, address, dob, op_number, q` and clinical keys to `***REDACTED***`. Never serialize request/response bodies or ORM instances.
      **Acceptance Criteria:** Logging an object containing PII emits redacted output; route template (`/patients/{id}`) logged, not the resolved id. (Covered by LOG tests.)

- [ ] **BE-TF.7 [M]** — Reusable audit-write helper (MVP)
      **Description:** Implement `core/audit.py` — a service callable that writes an `audit_log` row with user, role snapshot, action, entity type/id, affected patient, old/new JSON, IP, user agent, `request_id`.
      **Files / Components:** `backend/app/core/audit.py`, `backend/app/modules/audit/`.
      **Implementation Notes:** Append-only; must participate in the caller's transaction so audit + change commit atomically. Old/new captured as JSON diffs.
      **Acceptance Criteria:** Calling the helper inside a service transaction persists one append-only row with the correct `request_id`; rollback of the business txn also rolls back the audit row.

- [ ] **BE-TF.8 [M]** — Global error handling & response envelope (MVP)
      **Description:** Implement `core/errors.py` — exception handlers producing the consistent envelope `{ "error": { code, message, details, request_id } }` mapped to HTTP codes (400/401/403/404/409/413/415/422/429/500/503).
      **Files / Components:** `backend/app/core/errors.py`, domain exception classes.
      **Implementation Notes:** Map app error codes per API spec §6.2. Generic 500 with `request_id` only — never leak internals/stack to client (SAD §10.1 control #6). 422 returns `details[]` of `{field, code, message}`.
      **Acceptance Criteria:** Each domain exception maps to the documented HTTP status + `error.code`; validation errors surface field-level detail; 500 leaks nothing.

- [ ] **BE-TF.9 [M]** — Request-ID & pagination/middleware plumbing (MVP)
      **Description:** Add `X-Request-ID` correlation middleware (honor inbound or generate), echo header in responses, and shared pagination/sort/filter helpers returning the `{items,total,page,page_size}` envelope.
      **Files / Components:** `backend/app/core/middleware.py`, `backend/app/core/pagination.py`.
      **Implementation Notes:** `page` default 1, `page_size` default 20 / max 100; `sort`+`order` validated against an allow-list per resource.
      **Acceptance Criteria:** Every response carries `X-Request-ID`; list endpoints return the paginated envelope; `page_size>100` rejected.

### Module 1 — User & Access / RBAC

- [ ] **BE-T1.1 [M]** — Auth domain models & schemas (MVP)
      **Description:** SQLAlchemy models for `users`, `roles`, `user_roles`; Pydantic schemas `LoginRequest`, `RefreshRequest`, `TokenResponse`, `UserProfile`, `PermissionSet`, `User`, `UserCreateRequest`, `UserUpdateRequest`, `UserStatusUpdateRequest`, `PasswordResetRequest`, `Role`.
      **Files / Components:** `backend/app/modules/auth/models.py`, `.../auth/schemas.py`, `.../users/schemas.py`.
      **Implementation Notes:** `users` carries `status, failed_login_attempts, locked_until, password_changed_at, is_doctor, last_login_at, version`. Snake_case fields.
      **Acceptance Criteria:** Models map to DDL; schemas reject unknown fields; password never present in any response schema.

- [ ] **BE-T1.2 [L]** — Login service with lockout & no-enumeration (MVP)
      **Description:** Implement login: verify credentials against ACTIVE users; increment `failed_login_attempts`; set `locked_until` past threshold; reset counters on success; stamp `last_login_at`; issue tokens.
      **Files / Components:** `backend/app/modules/auth/service.py`, `.../auth/repository.py`.
      **Implementation Notes:** Always return generic `AUTH_INVALID_CREDENTIALS` for bad user OR password (UC-01). Locked → `AUTH_ACCOUNT_LOCKED`; disabled → `AUTH_ACCOUNT_DISABLED`. Audit login success + failure (LOG-T1.1).
      **Acceptance Criteria:** Wrong username and wrong password yield identical generic error; N failures lock the account; locked/disabled cannot authenticate; all attempts audited.

- [ ] **BE-T1.3 [M]** — Token refresh & logout services (MVP)
      **Description:** Implement refresh-token rotation and logout (optional Redis denylist of `jti`).
      **Files / Components:** `backend/app/modules/auth/service.py`.
      **Implementation Notes:** Refresh validates token type + signature + expiry, rotates refresh, returns new pair. Logout adds `jti` to denylist if Redis enabled; otherwise relies on short TTL.
      **Acceptance Criteria:** Used/expired refresh rejected; rotated token differs; denylisted access token rejected when Redis on.

- [ ] **BE-T1.4 [M]** — Current-user & permissions services (MVP)
      **Description:** Implement `GET /me` profile assembly and `GET /me/permissions` effective permission resolution from roles.
      **Files / Components:** `backend/app/modules/auth/service.py`.
      **Implementation Notes:** Effective permissions computed from `user_roles` → static permission map; include `is_doctor`. Frontend reads these (never hard-codes the matrix).
      **Acceptance Criteria:** `/me` returns identity + roles + permissions + `is_doctor`; `/me/permissions` matches the role mapping exactly.

- [ ] **BE-T1.5 [L]** — User management service (MVP)
      **Description:** Implement user CRUD: create (with roles), update (version-checked, role change audited per UC-02 BR4), list/search (`?is_doctor=`, `?status=`, `?q=`), enable/disable status toggle, password reset (new hash + `password_changed_at` + clear lockout).
      **Files / Components:** `backend/app/modules/users/service.py`, `.../users/repository.py`, `.../users/router.py`.
      **Implementation Notes:** Admin-only (`manage_users`). Duplicate username/email → `409 RESOURCE_CONFLICT`. Disabling/locking immediately blocks auth. All three lifecycle actions audited.
      **Acceptance Criteria:** Create/edit/disable/reset all enforce `manage_users`; role changes + status + reset each write an audit row; version conflicts return 409.

### Module 2 — Master Data

- [ ] **BE-T2.1 [M]** — Master-data model, schemas, service (MVP)
      **Description:** Model `master_data` (typed lookup) + schemas `MasterDataItem`, `MasterDataCreateRequest`, `MasterDataUpdateRequest`; service for list (`?active=`), create, update/deactivate by `{type}`.
      **Files / Components:** `backend/app/modules/masterdata/models.py`, `.../schemas.py`, `.../service.py`, `.../repository.py`.
      **Implementation Notes:** `{type}` constrained to the `master_data.type` CHECK list (API spec §8.5). Read = authenticated; write = `manage_master_data` (Admin), audited. Inactive values hidden from new records but preserved on old.
      **Acceptance Criteria:** Unknown type → 404; duplicate `type+code` → 409; deactivation does not break existing references; writes audited.

- [ ] **BE-T2.2 [M]** — OP-sequence management service (MVP)
      **Description:** Model `op_sequence` + schemas `OpSequence`, `OpSequenceUpdateRequest`; service to list sequences and update prefix/padding/reset policy (Admin, audited). `last_sequence` not client-settable except controlled correction.
      **Files / Components:** `backend/app/modules/masterdata/op_sequence_service.py`.
      **Implementation Notes:** `reset_policy ∈ {NEVER, YEARLY}`. Changing format must not retroactively alter issued numbers.
      **Acceptance Criteria:** Admin can edit prefix/padding/reset; `last_sequence` not writable via this path; changes audited.

### Module 3 — Patient Registration & Profile

- [ ] **BE-T3.1 [M]** — Patient model & schemas (MVP)
      **Description:** Models `patients`, `patient_aliases`; schemas `Patient`, `PatientCreateRequest`, `PatientUpdateRequest`, `PatientAlias`, `PatientSearchResult`, `PatientTimeline`.
      **Files / Components:** `backend/app/modules/patients/models.py`, `.../schemas.py`.
      **Implementation Notes:** `patients` includes `op_number, op_category, status, merged_into, is_historical, version`. `op_number` server-generated, immutable on update. Min-identity rule fields.
      **Acceptance Criteria:** Schemas enforce min-identity (BE-TF / SEC validation); `op_number` not accepted on create/update; field set matches DDL.

- [ ] **BE-T3.2 [L]** — Patient registration service (MVP)
      **Description:** Implement `POST /patients` flow: validate min-identity & lookup codes, run inline duplicate check, generate OP number within the row-locked transaction (Module 4), persist patient `version=1`, audit CREATE.
      **Files / Components:** `backend/app/modules/patients/service.py`, `.../repository.py`.
      **Implementation Notes:** Duplicate suspicion returns advisory `409 DUPLICATE_PATIENT_SUSPECTED` with suggestions in `error.details`; `confirm_create=true` overrides. OP numbering and patient insert are one atomic transaction.
      **Acceptance Criteria:** Valid registration returns `201` with generated `op_number`; missing identity → `422 MIN_IDENTITY_REQUIRED`; bad lookup → `422 INVALID_LOOKUP_CODE`; duplicate advisory overridable.

- [ ] **BE-T3.3 [M]** — Patient profile read/update service (MVP)
      **Description:** Implement `GET /patients/{id}` (role-filtered fields, access audited), `PUT /patients/{id}` (version-checked, audited old/new), `GET /patients/{id}/aliases`.
      **Files / Components:** `backend/app/modules/patients/service.py`.
      **Implementation Notes:** Receptionist/Data-Entry get reduced medical view (response filtering). Profile view writes an audit VIEW row. `op_number` immutable; stale `version` → `409 VERSION_CONFLICT`.
      **Acceptance Criteria:** Limited roles see filtered fields; every profile open audited; concurrent edit returns 409; old/new captured.

- [ ] **BE-T3.4 [S]** — OP-number correction service (R2, candidate)
      **Description:** Implement Admin-only `POST /patients/{id}/op-correction`: validate uniqueness, write `patient_aliases(source='CORRECTION')`, update `op_number`, audit old/new — pending confirmation of OP-correction rules (API spec §7.4).
      **Files / Components:** `backend/app/modules/patients/service.py`.
      **Implementation Notes:** Single transaction; non-admin → 403; new number in use → 409; version-checked.
      **Acceptance Criteria:** Old number preserved as alias; new number unique; fully audited; admin-only.

### Module 4 — OP Numbering

- [ ] **BE-T4.1 [L]** — Transaction-safe OP number generator (MVP)
      **Description:** Implement the OP-number service used inside registration: `SELECT … FROM op_sequence WHERE category_code=:c FOR UPDATE`, increment `last_sequence`, format `prefix + zero-pad(padding_width)`, honor reset policy, return number.
      **Files / Components:** `backend/app/modules/patients/op_number.py` (or `modules/masterdata`).
      **Implementation Notes:** Must run inside the caller's registration transaction (no separate commit). Guarantees no duplicates / no reuse under concurrency (UC-04/UC-29). YEARLY reset checks year boundary.
      **Acceptance Criteria:** Sequential calls yield contiguous unique numbers; concurrent registrations never collide (verified by TST concurrency test); format matches configured prefix/padding.

### Module 5 — Search & Retrieval

- [ ] **BE-T5.1 [L]** — Patient search service (MVP)
      **Description:** Implement `GET /patients/search` over OP/mobile/name (exact + partial), ranked exact OP/mobile first then name relevance; paginated; returns minimal identifiers only (no clinical fields); masks mobile.
      **Files / Components:** `backend/app/modules/search/service.py`, `.../repository.py`.
      **Implementation Notes:** Use Postgres FTS (`tsvector`+GIN) + `pg_trgm` for partial/typo tolerance (DB-T5.1). Query params `q, op_number, mobile, name, op_category, status`. Search terms never logged in plaintext (SAD §10.1 #4).
      **Acceptance Criteria:** Exact OP/mobile ranks first; partial name matches via trigram; results contain no clinical data; results paginated; search terms absent from non-audit logs.

### Module 6 — Visit & Consultation

- [ ] **BE-T6.1 [M]** — Visit model, schemas, service (MVP)
      **Description:** Model `visits`; schemas `Visit`, `VisitCreateRequest`, `VisitUpdateRequest`; service for create, list-by-patient, get, update (version-checked).
      **Files / Components:** `backend/app/modules/visits/`.
      **Implementation Notes:** Non-scheduled visit cannot be future-dated (UC-08 BR4) → 422. `visit_type_code`, `consultation_category`, `doctor_id` validated against master data / doctor list. `status ∈ {OPEN, COMPLETED, CANCELLED}`.
      **Acceptance Criteria:** Create returns 201; future non-scheduled date rejected; invalid lookup → 422; update version-checked.

- [ ] **BE-T6.2 [M]** — Case sheet upsert service (MVP)
      **Description:** Implement `PUT /visits/{id}/case-sheet` upsert (one per visit via `uq_case_sheets_visit`), version-checked, audited; `GET` read (`view_medical_history`).
      **Files / Components:** `backend/app/modules/visits/case_sheet_service.py`.
      **Implementation Notes:** Singleton sub-resource → idempotent PUT (API spec §7.6 deviation). All clinical free-text fields from DDL. Permission `add_consultation` to write.
      **Acceptance Criteria:** First save creates, second updates (no spurious 409); concurrent edit → 409; read gated by `view_medical_history`.

- [ ] **BE-T6.3 [M]** — Consultation notes service (MVP)
      **Description:** Implement append-only `POST /visits/{id}/consultation-notes` and list `GET`; corrections are new amended entries, never overwrite.
      **Files / Components:** `backend/app/modules/visits/consultation_service.py`.
      **Implementation Notes:** Fields: complaints, diagnosis, observations, treatment_advice, diet_advice, review_date, doctor_id. Write `add_consultation`; read `view_medical_history`. Audited.
      **Acceptance Criteria:** Notes append (history preserved); list returns chronological notes; write/read permission-gated.

### Module 7 — Prescriptions

- [ ] **BE-T7.1 [M]** — Prescription model, schemas, service (MVP)
      **Description:** Models `prescriptions`, `prescription_items`; schemas `Prescription`, `PrescriptionItem`, `PrescriptionCreateRequest`; service for create (structured items + free-text), list-by-visit, get-with-items.
      **Files / Components:** `backend/app/modules/clinical/prescriptions/`.
      **Implementation Notes:** `PrescriptionItem`: `line_no?, medicine_name, dosage?, timing?, duration?, usage_instruction?, application_route ∈ {INTERNAL, EXTERNAL}`. Write `add_prescription`; read `view_medical_history`. Scanned prescriptions may instead be attached via Documents.
      **Acceptance Criteria:** Create persists header + items atomically; list/get return items; permissions enforced; audited.

### Module 8 — Discharge Summaries

- [ ] **BE-T8.1 [L]** — Discharge summary service with finalize/amend (MVP)
      **Description:** Model `discharge_summaries`; implement create draft, update draft (blocked if finalized), finalize (`is_finalized`, `finalized_at/by`), amend (new row via `amends_id`), get current-effective, get history.
      **Files / Components:** `backend/app/modules/clinical/discharge/`.
      **Implementation Notes:** `discharge_date ≥ admission_date` (UC-13 BR2) → 422. Edit finalized → `409 DISCHARGE_ALREADY_FINALIZED`. Current-effective = latest non-superseded row in `amends_id` chain; expose `is_superseded`, `superseded_by`. `404` only when visit has none.
      **Acceptance Criteria:** Finalize blocks further PUT; amendment chain resolves to one current row; history returns ordered versions; date rule enforced.

### Module 9 — Documents

- [ ] **BE-T9.1 [L]** — Document upload service (MVP)
      **Description:** Implement `POST /patients/{id}/documents` (multipart): validate type/size + content sniff, store binary in MinIO/S3, persist `documents` metadata (no binary in DB).
      **Files / Components:** `backend/app/modules/documents/service.py`, `.../repository.py`, `.../storage.py`.
      **Implementation Notes:** Allow-list pdf/jpeg/png; max size (≈10 MB). Parts: `file, document_type_code, visit_id?, title?, document_date?, is_historical?, remarks?`. `415 INVALID_FILE_TYPE`, `413 FILE_TOO_LARGE`. Store object key in `storage_ref` (never exposed to non-admin). Upload audited (metadata only).
      **Acceptance Criteria:** Valid upload → 201 metadata; bad type → 415; oversized → 413; binary lands in object store; log captures metadata only, never filename/content in plaintext.

- [ ] **BE-T9.2 [L]** — Secure document download service (MVP)
      **Description:** Implement `GET /documents/{id}` (metadata), `GET /documents/{id}/content` (permission-checked proxied stream, access audited), `GET /documents/{id}/download-url` (short-lived pre-signed URL), `PUT /documents/{id}` (metadata update / soft-delete via status).
      **Files / Components:** `backend/app/modules/documents/service.py`, `.../storage.py`.
      **Implementation Notes:** Permission check before streaming (UC-30); never expose object-store URL; pre-signed URL short TTL. Soft-delete only (`status ∈ {ACTIVE, ARCHIVED, DELETED}`). Each content access writes audit.
      **Acceptance Criteria:** Unauthorized download → 403; content streamed via proxy; pre-signed URL expires; access audited; no public URL leaked.

### Module 10 — Patient Timeline

- [ ] **BE-T10.1 [L]** — Timeline aggregation service (MVP)
      **Description:** Implement `GET /patients/{id}/timeline` aggregating visits, case sheets, consultation notes, prescriptions, discharge summaries, documents, follow-ups into one chronological, most-recent-first event list (UC-17).
      **Files / Components:** `backend/app/modules/patients/timeline_service.py`, `.../timeline_repository.py`.
      **Implementation Notes:** Event shape `{type, occurred_on, ref_id, summary, ...}`. Medical content respects field-level visibility. Use indexed reads (DB-T10.1). Permission `view_patient`.
      **Acceptance Criteria:** Events from all clinical/document/follow-up sources merge in correct order; limited roles see filtered medical summaries; performant on a seeded patient.

### Module 11 — Follow-Up Tracking

- [ ] **BE-T11.1 [M]** — Follow-up service with status lifecycle (MVP)
      **Description:** Model `follow_ups`; implement create, list-by-patient, queue list (`?status=`, `?from=&to=`, `?assigned_to=`), update (version-checked, audited) with enforced status lifecycle.
      **Files / Components:** `backend/app/modules/followups/`.
      **Implementation Notes:** Lifecycle `PENDING → CONTACTED | NOT_REACHABLE → COMPLETED | RESCHEDULED`; `RESCHEDULED` may chain via `next_followup_id`. Invalid transition → `409 INVALID_STATE_TRANSITION`. Not deletable by normal users. `manage_followups`.
      **Acceptance Criteria:** Valid transitions succeed; invalid → 409; queue filters work; updates audited; no hard delete.

### Module 12 — Audit Trail

- [ ] **BE-T12.1 [M]** — Audit read service (MVP)
      **Description:** Implement `GET /audit-logs` (filterable: `user_id, patient_id, action, entity_type, entity_id, from, to`; paginated) and `GET /audit-logs/{id}` (single, with old/new JSON). Admin read-only.
      **Files / Components:** `backend/app/modules/audit/service.py`, `.../repository.py`, `.../router.py`.
      **Implementation Notes:** No create/update/delete endpoints — append-only table written only via `core/audit.py`. `view_audit` permission.
      **Acceptance Criteria:** Filters narrow results; non-admin → 403; only GET exposed; old/new JSON visible to admin.

### Module 13 — Backup & Recovery

- [ ] **BE-T13.1 [M]** — Backup status read service (MVP)
      **Description:** Model `backup_log`; implement `GET /backup/status` returning latest + last-N runs with outcomes. No restore/trigger API (out-of-band ops).
      **Files / Components:** `backend/app/modules/backup/service.py`, `.../router.py`.
      **Implementation Notes:** `backup_type ∈ {DATABASE, DOCUMENTS, FULL}`, `status ∈ {STARTED, SUCCESS, FAILED}`. `backup_control` (Admin). Cron scripts (INT-T13.1) write rows.
      **Acceptance Criteria:** Returns most-recent run + history; admin-only; no restore endpoint exists.

### Module 14 — Concurrency Handling (cross-cutting)

- [ ] **BE-T14.1 [M]** — Optimistic concurrency framework (MVP)
      **Description:** Implement a reusable version-check pattern: services compare client `version` to stored row, raise `VERSION_CONFLICT` on mismatch, increment `version` on successful update.
      **Files / Components:** `backend/app/core/concurrency.py`, applied in patients/visits/case-sheet/discharge/follow-up/user services.
      **Implementation Notes:** Pair with row-locked OP sequence (BE-T4.1). Every mutable record carries `version`.
      **Acceptance Criteria:** Concurrent edit of same record → one succeeds, other gets 409; `version` increments on each update; OP numbers never duplicate under load.

### Module 15 — Duplicate Detection & Merge (R2)

- [ ] **BE-T15.1 [L]** — Duplicate detection service (R2)
      **Description:** Implement `GET /patients/duplicates`: mobile exact = high confidence; name (`pg_trgm` similarity) + DOB/gender = possible. Returns suggestions only — never auto-merges.
      **Files / Components:** `backend/app/modules/duplicates/detection_service.py`.
      **Implementation Notes:** Scoring per Plan §4.3. Read `view_patient`.
      **Acceptance Criteria:** Mobile match flagged high; fuzzy name+DOB flagged possible; no mutation performed.

- [ ] **BE-T15.2 [L]** — Merge-request workflow service (R2)
      **Description:** Model `merge_requests`; implement request create (`PENDING`), list/queue (`?status=`), get, approve (executes merge), reject (`decision_remarks`), cancel (requester).
      **Files / Components:** `backend/app/modules/duplicates/merge_service.py`.
      **Implementation Notes:** States `PENDING → APPROVED | REJECTED | CANCELLED`. `request_merge` to create/cancel-own; `merge_records` (Admin) to approve/reject. `MERGE_SAME_PATIENT` (422), `MERGE_INVALID_STATE` (409). Both request and decision audited.
      **Acceptance Criteria:** Staff can request; admin queue shows pending; approve/reject/cancel enforce permissions + state; primary==duplicate rejected.

- [ ] **BE-T15.3 [L]** — Merge execution (on approval) (R2)
      **Description:** Implement single-transaction merge on approve: reassign `visits`/`documents`/`follow_ups` to primary, set duplicate `status='MERGED'` + `merged_into`, copy old OP to `patient_aliases(source='MERGE')`, stamp `merged_at`, full before/after audit.
      **Files / Components:** `backend/app/modules/duplicates/merge_service.py`.
      **Implementation Notes:** Never physical delete; irreversible via normal UI. Admin-only. Atomic — partial merge impossible.
      **Acceptance Criteria:** All child records repoint to primary; duplicate soft-inactivated with alias retained; before/after audited; transaction atomic.

### Module 16 — Dashboard (R2)

- [ ] **BE-T16.1 [M]** — Dashboard summary service (R2)
      **Description:** Implement `GET /dashboard/summary` — role-filtered counts + small recent lists: recent registrations, today's visits, pending/upcoming follow-ups, recent uploads, patient count by OP category (UC-22).
      **Files / Components:** `backend/app/modules/reports/dashboard_service.py`.
      **Implementation Notes:** Doctors see their clinical follow-ups; receptionists operational; admins overall (SAD §17). Back with SQL views (DB-T16.1).
      **Acceptance Criteria:** Widgets vary by role; counts accurate against seed; loads within NFR (p95 < 2 s).

### Module 17 — Reports & Export (R2)

- [ ] **BE-T17.1 [L]** — Operational reports service (R2)
      **Description:** Implement `GET /reports/{type}` for `registration, visit, follow_up, op_category, document_upload` with mandatory `from`/`to`, optional `op_category, doctor_id, status, format(json|csv|xlsx)`.
      **Files / Components:** `backend/app/modules/reports/service.py`.
      **Implementation Notes:** JSON returns aggregated rows; csv/xlsx returns file stream with generated-by/date metadata. Missing date range → 422; unknown type → 404. `view_reports`.
      **Acceptance Criteria:** Each report type returns correct aggregates; date range required; file export carries metadata; permission-gated.

- [ ] **BE-T17.2 [M]** — Patient record export service (R2)
      **Description:** Implement `POST /patients/{id}/export` (CSV/Excel; PDF optional); audited (`action=EXPORT`).
      **Files / Components:** `backend/app/modules/reports/export_service.py`.
      **Implementation Notes:** `export` permission; patient-level export always audited. PDF deferred decision (SAD §27 #12).
      **Acceptance Criteria:** Export produces requested format; export event audited; permission enforced.

### Module 18 — System / Health

- [ ] **BE-T18.1 [S]** — Health & readiness endpoints (MVP)
      **Description:** Implement `GET /health` (liveness) and `GET /ready` (DB + object-storage connectivity → `503 SERVICE_UNAVAILABLE` if a dependency is down). Public, no auth.
      **Files / Components:** `backend/app/modules/system/router.py`.
      **Acceptance Criteria:** `/health` returns 200 when process up; `/ready` returns 503 when DB or storage unreachable, 200 otherwise.

---

## 2. API Tasks

> Routers expose the services above. Each router declares `require_permission(...)`, validates with Pydantic schemas, returns documented envelopes, and registers OpenAPI metadata. All list routes accept `page,page_size,sort,order`.

- [ ] **API-T1.1 [M]** — Auth & session routes (MVP)
      **Description:** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` (204), `GET /me`, `GET /me/permissions`.
      **Files / Components:** `backend/app/modules/auth/router.py`.
      **Implementation Notes:** login/refresh `security: []` (public); generic 401 on bad creds; `429` when rate-limited (SEC-T1.2).
      **Acceptance Criteria:** Matches API spec §7.1; tokens issued; logout returns 204; protected `/me` requires bearer.

- [ ] **API-T1.2 [M]** — User & role routes (MVP)
      **Description:** `GET/POST /users`, `GET/PUT /users/{id}`, `PUT /users/{id}/status`, `POST /users/{id}/reset-password`, `GET /roles`.
      **Files / Components:** `backend/app/modules/users/router.py`.
      **Implementation Notes:** Admin `manage_users` except `GET /roles` (authenticated). `?is_doctor=true` powers the doctor picker (no separate doctor table).
      **Acceptance Criteria:** Matches API spec §7.2; duplicate → 409; version conflict → 409; `is_doctor` filter works.

- [ ] **API-T2.1 [M]** — Master-data & OP-sequence routes (MVP)
      **Description:** `GET/POST /master-data/{type}`, `PUT /master-data/{type}/{id}`, `GET /op-sequences`, `PUT /op-sequences/{id}`.
      **Files / Components:** `backend/app/modules/masterdata/router.py`.
      **Implementation Notes:** `{type}` path enum constrained; write admin-only.
      **Acceptance Criteria:** Matches API spec §7.3; unknown type → 404; duplicate code → 409.

- [ ] **API-T3.1 [M]** — Patient routes (MVP)
      **Description:** `POST /patients` (with `?confirm_create=`), `GET/PUT /patients/{id}`, `GET /patients/{id}/aliases`, `POST /patients/{id}/op-correction` (R2 candidate).
      **Files / Components:** `backend/app/modules/patients/router.py`.
      **Implementation Notes:** Permissions `create_patient/view_patient/edit_patient`; min-identity & duplicate behaviors surfaced as documented codes.
      **Acceptance Criteria:** Matches API spec §7.4; advisory duplicate flow works; immutable `op_number`.

- [ ] **API-T3.2 [S]** — Patient timeline route (MVP)
      **Description:** `GET /patients/{id}/timeline` (UC-17).
      **Files / Components:** `backend/app/modules/patients/router.py`.
      **Acceptance Criteria:** Returns ordered `PatientTimeline`; `view_patient` enforced; field visibility respected.

- [ ] **API-T5.1 [S]** — Search route (MVP)
      **Description:** `GET /patients/search?q=&op_number=&mobile=&name=&op_category=&status=` paginated.
      **Files / Components:** `backend/app/modules/search/router.py`.
      **Acceptance Criteria:** Matches API spec §7.5; minimal-identifier results; ranked; search terms not logged.

- [ ] **API-T6.1 [M]** — Visit & consultation routes (MVP)
      **Description:** `POST/GET /patients/{id}/visits`, `GET/PUT /visits/{id}`, `PUT/GET /visits/{id}/case-sheet`, `POST/GET /visits/{id}/consultation-notes`.
      **Files / Components:** `backend/app/modules/visits/router.py`.
      **Implementation Notes:** Case sheet uses idempotent `PUT` upsert (documented deviation).
      **Acceptance Criteria:** Matches API spec §7.6; clinical RBAC enforced; future non-scheduled date → 422.

- [ ] **API-T7.1 [S]** — Prescription routes (MVP)
      **Description:** `POST/GET /visits/{id}/prescriptions`, `GET /prescriptions/{id}`.
      **Files / Components:** `backend/app/modules/clinical/prescriptions/router.py`.
      **Acceptance Criteria:** Matches API spec §7.7; items returned; `add_prescription`/`view_medical_history` enforced.

- [ ] **API-T8.1 [M]** — Discharge summary routes (MVP)
      **Description:** `POST/GET /visits/{id}/discharge-summary`, `GET /visits/{id}/discharge-summary/history`, `PUT /discharge-summaries/{id}`, `PUT /discharge-summaries/{id}/finalize`, `POST /discharge-summaries/{id}/amend`.
      **Files / Components:** `backend/app/modules/clinical/discharge/router.py`.
      **Acceptance Criteria:** Matches API spec §7.8; finalize blocks edits (409); current-effective vs history correct.

- [ ] **API-T9.1 [M]** — Document routes (MVP)
      **Description:** `POST/GET /patients/{id}/documents`, `GET /documents/{id}`, `GET /documents/{id}/content`, `GET /documents/{id}/download-url`, `PUT /documents/{id}`.
      **Files / Components:** `backend/app/modules/documents/router.py`.
      **Implementation Notes:** Multipart upload; proxied/pre-signed download; metadata/binary split (documented deviation).
      **Acceptance Criteria:** Matches API spec §7.9; 413/415 enforced; download permission-checked + audited.

- [ ] **API-T11.1 [S]** — Follow-up routes (MVP)
      **Description:** `POST/GET /patients/{id}/follow-ups`, `PUT /follow-ups/{id}`, `GET /follow-ups`.
      **Files / Components:** `backend/app/modules/followups/router.py`.
      **Acceptance Criteria:** Matches API spec §7.10; lifecycle transitions enforced; queue filters work.

- [ ] **API-T12.1 [S]** — Audit routes (MVP)
      **Description:** `GET /audit-logs`, `GET /audit-logs/{id}` (admin read-only).
      **Files / Components:** `backend/app/modules/audit/router.py`.
      **Acceptance Criteria:** Matches API spec §7.14; GET-only; `view_audit` enforced.

- [ ] **API-T13.1 [S]** — Backup status route (MVP)
      **Description:** `GET /backup/status` (admin).
      **Files / Components:** `backend/app/modules/backup/router.py`.
      **Acceptance Criteria:** Matches API spec §7.15; admin-only; no restore endpoint.

- [ ] **API-T15.1 [M]** — Duplicate & merge routes (R2)
      **Description:** `GET /patients/duplicates`, `POST/GET /merge-requests`, `GET /merge-requests/{id}`, `POST /merge-requests/{id}/approve|reject|cancel`.
      **Files / Components:** `backend/app/modules/duplicates/router.py`.
      **Acceptance Criteria:** Matches API spec §7.11; request/approve/reject/cancel permissioned; merge atomic.

- [ ] **API-T16.1 [S]** — Dashboard route (R2)
      **Description:** `GET /dashboard/summary` (role-filtered).
      **Files / Components:** `backend/app/modules/reports/dashboard_router.py`.
      **Acceptance Criteria:** Matches API spec §7.12; role-specific widgets.

- [ ] **API-T17.1 [M]** — Reports & export routes (R2)
      **Description:** `GET /reports/{type}`, `POST /patients/{id}/export`.
      **Files / Components:** `backend/app/modules/reports/router.py`.
      **Acceptance Criteria:** Matches API spec §7.13; date range required; exports audited.

- [ ] **API-T0.1 [M]** — API conventions & envelope conformance (MVP)
      **Description:** Enforce global conventions across all routers: `/api/v1` prefix, snake_case JSON, ISO-8601, UUID ids, paginated envelope, error envelope, `X-Request-ID`, `Idempotency-Key` (optional) on non-idempotent creates.
      **Files / Components:** `backend/app/main.py` (router registration), shared deps.
      **Acceptance Criteria:** All endpoints mounted under `/api/v1`; responses conform to §5 envelopes; conventions verified by integration tests.

---

## 3. Database Tasks

- [ ] **DB-T0.1 [L]** — Alembic baseline migration from DDL (MVP)
      **Description:** Convert `Docs/DDL_DATAMODEL.sql` into the initial Alembic revision: extensions (`pg_trgm`, etc.), all tables, constraints, indexes, `set_updated_at()` trigger, and seed lookups.
      **Files / Components:** `backend/app/migrations/versions/0001_baseline.py`, `backend/alembic.ini`, `backend/app/migrations/env.py`.
      **Implementation Notes:** DDL file remains the human-readable reference; Alembic is source of truth. Up/down both provided.
      **Acceptance Criteria:** `alembic upgrade head` on a clean DB reproduces the DDL schema; `downgrade` reverses cleanly (migration test).

- [ ] **DB-T0.2 [M]** — Seed data migration (MVP)
      **Description:** Seed roles; master_data for consultation categories, visit/document types, follow-up statuses, blood groups, dietary prefs, marital status, gender, discharge conditions; `op_sequence` (OPN/OPV/FC).
      **Files / Components:** `backend/app/migrations/versions/0002_seed.py`.
      **Implementation Notes:** Codes/values per API spec §8.5 enum defaults.
      **Acceptance Criteria:** All lookups present after migrate; codes match spec; idempotent.

- [ ] **DB-T0.3 [S]** — First-admin seed script (MVP)
      **Description:** Separate, non-committed script to create the first Administrator with a securely hashed password.
      **Files / Components:** `backend/scripts/create_admin.py`.
      **Implementation Notes:** Password supplied via env/prompt, hashed (argon2/bcrypt); never commit credentials.
      **Acceptance Criteria:** Running the script yields a working admin login; no secret in VCS.

- [ ] **DB-T5.1 [M]** — Search indexes (FTS + trigram) (MVP)
      **Description:** Ensure `pg_trgm` GIN on `patients.full_name` and GIN on generated `search_vector`; tune ranking (exact OP/mobile first, then name).
      **Files / Components:** migration revision, `backend/app/modules/search/repository.py`.
      **Acceptance Criteria:** Search query uses the indexes (EXPLAIN); p95 < 1 s on ~50k seeded patients (perf test PERF).

- [ ] **DB-T3.1 [S]** — Patient/alias constraints & version columns (MVP)
      **Description:** Verify unique `op_number`, `patient_aliases` FK, `merged_into` FK, `version` default, status CHECK; B-tree indexes on `op_number`, `mobile`.
      **Files / Components:** baseline migration.
      **Acceptance Criteria:** Duplicate OP rejected at DB level; indexes present.

- [ ] **DB-T4.1 [S]** — OP-sequence row-lock readiness (MVP)
      **Description:** Confirm `op_sequence` schema supports `SELECT … FOR UPDATE` per category (PK/unique on category, `last_sequence`, `prefix`, `number_format`/`padding_width`, `reset_policy`, `active`).
      **Files / Components:** baseline migration.
      **Acceptance Criteria:** Locking query runs; concurrent test (TST-T4.1) passes.

- [ ] **DB-T10.1 [M]** — Hot-path indexes for timeline & follow-ups (MVP)
      **Description:** Confirm indexes backing timeline reads and the pending-follow-up composite `idx_follow_ups_status_date`, plus audit lookup indexes.
      **Files / Components:** baseline migration.
      **Acceptance Criteria:** Timeline and follow-up queries index-backed (EXPLAIN); pending-follow-up query fast.

- [ ] **DB-T16.1 [M]** — Reporting/dashboard SQL views (R2)
      **Description:** Create SQL views for dashboard/report aggregations; promote to materialized views only if a report is slow.
      **Files / Components:** migration revision, `backend/app/modules/reports/`.
      **Acceptance Criteria:** Views return correct aggregates; dashboard/report services consume them; materialize only on measured need.

- [ ] **DB-T14.1 [S]** — Soft-delete & no-physical-delete guards (MVP)
      **Description:** Ensure patients/clinical/documents use `status`/`is_active` flags; no destructive deletes in schema or repositories.
      **Files / Components:** repositories across modules.
      **Acceptance Criteria:** No `DELETE` on patient/clinical/document tables in code; status transitions used instead.

- [ ] **DB-T0.4 [S]** — Migration discipline & multi-branch readiness (MVP)
      **Description:** Establish reviewed up/down per change; keep services/repositories free of hard-coded single-branch assumptions (no `branch_id` now, but no blockers later).
      **Files / Components:** repo conventions doc, repositories.
      **Acceptance Criteria:** Every schema change is a reviewed revision; code review confirms no single-branch hard-coding.

---

## 4. Integration Tasks

> Phase 1 has **no external system integrations** (ABDM/ABHA, lab, pharmacy deferred — SAD §15). Integration work is internal infrastructure.

- [ ] **INT-T9.1 [M]** — Object storage (MinIO/S3) client & bucket provisioning (MVP)
      **Description:** Implement an S3-compatible storage client (upload, stream/proxy, pre-signed URL, soft-delete), provision the documents bucket, configure lifecycle/versioning.
      **Files / Components:** `backend/app/modules/documents/storage.py`, infra/compose config.
      **Implementation Notes:** Swappable MinIO↔S3 with no code change. Credentials server-side only; URLs never exposed.
      **Acceptance Criteria:** Upload/download/pre-sign work against MinIO in dev; bucket auto-provisioned; creds not leaked.

- [ ] **INT-T13.1 [M]** — Backup cron scripts + `backup_log` writes (MVP)
      **Description:** Implement nightly `pg_dump` + MinIO/document backup to off-server/offsite target via cron; record each run (`STARTED/SUCCESS/FAILED`) in `backup_log`.
      **Files / Components:** `ops/backup/pg_backup.sh`, `ops/backup/docs_backup.sh`, cron config.
      **Acceptance Criteria:** Scheduled run produces backup artifacts and a `backup_log` row; surfaced by `GET /backup/status`.

- [ ] **INT-T13.2 [S]** — SMTP backup-alert hook (optional) (MVP)
      **Description:** Send backup success/failure alert email to Administrator via SMTP.
      **Files / Components:** `backend/app/core/notify.py` or `ops/backup/notify.sh`.
      **Implementation Notes:** Optional; SMTP details are an open question (SAD §27 #8). Backup notification recorded in `backup_log`.
      **Acceptance Criteria:** Failure triggers an alert email when SMTP configured; no-op when disabled.

- [ ] **INT-T13.3 [M]** — Restore runbook & restore test (MVP)
      **Description:** Document and test the out-of-band restore procedure (no API). Schedule a restore drill before R1 go-live.
      **Files / Components:** `ops/backup/RESTORE_RUNBOOK.md`.
      **Acceptance Criteria:** A documented restore from backup succeeds on a clean target in a drill; runbook reviewed.

- [ ] **INT-T9.2 [S]** — Optional AV scan hook (MVP)
      **Description:** Provide an optional malware-scan hook in the upload pipeline (enabled by config).
      **Files / Components:** `backend/app/modules/documents/service.py`.
      **Acceptance Criteria:** When enabled, infected file rejected; when disabled, pipeline unaffected.

- [ ] **INT-T17.1 [L]** — Bulk historical import utility (R2, Could-Have)
      **Description:** Internal admin batch utility (CSV/Excel template) for migrated records: mark `is_historical=TRUE`, preserve old OP numbers as `patient_aliases`, validate against template.
      **Files / Components:** `backend/app/modules/admin/historical_import.py`, candidate routes `POST/GET /admin/historical-imports`.
      **Implementation Notes:** Candidate endpoints (API spec §9.5); Admin/Data-Entry only; audited; async `202` + job status.
      **Acceptance Criteria:** Valid template imports with historical flag + aliases; invalid rows reported; audited.

---

## 5. Security Tasks

- [ ] **SEC-T1.1 [M]** — Deny-by-default RBAC enforcement across endpoints (MVP)
      **Description:** Ensure every endpoint declares a required permission + record-level rule; no endpoint is implicitly open (except documented public ones).
      **Files / Components:** all routers, `core/dependencies.py`, `core/permissions.py`.
      **Implementation Notes:** Map permissions from SAD §11.2 / API spec §2.3. Field-level visibility filtering for limited roles.
      **Acceptance Criteria:** Negative RBAC tests (no token/expired/wrong role/disabled) all blocked; permission map matches matrix.

- [ ] **SEC-T1.2 [S]** — Auth rate limiting (optional Redis) (MVP-light)
      **Description:** Implement login throttling (`429 RATE_LIMITED` + `Retry-After`) via Redis when enabled.
      **Files / Components:** `backend/app/core/ratelimit.py`, `auth/router.py`.
      **Acceptance Criteria:** Excess login attempts throttled with 429 when Redis on; disabled cleanly when off.

- [ ] **SEC-T9.1 [M]** — File upload hardening (MVP)
      **Description:** Enforce content-type sniffing + extension allow-list + max size; store outside web root in object storage; never expose object URLs.
      **Files / Components:** `documents/service.py`, `documents/storage.py`.
      **Acceptance Criteria:** Disguised file type rejected (sniff mismatch); oversized → 413; stored object not publicly reachable.

- [ ] **SEC-T0.1 [M]** — Input validation & SQL-safety baseline (MVP)
      **Description:** Pydantic v2 strict schemas at every boundary (reject unknown fields where appropriate); SQLAlchemy parameterized queries only — no string-built SQL.
      **Files / Components:** all schemas + repositories.
      **Acceptance Criteria:** SQL-injection attempt tests fail to inject; unknown-field payloads rejected on strict schemas.

- [ ] **SEC-T0.2 [S]** — CORS, secure headers & TLS posture (MVP)
      **Description:** Lock CORS to the SPA origin per env (no wildcard outside dev); ensure secure headers and HTTPS-only via proxy; debug off in prod.
      **Files / Components:** `core/config.py`, proxy config (`ops/proxy/`).
      **Acceptance Criteria:** Cross-origin request from non-SPA origin blocked in non-dev; debug disabled in prod profile.

- [ ] **SEC-T0.3 [S]** — Secrets management (MVP)
      **Description:** All secrets via env/Docker secrets; least-privilege DB user; no secrets in code or images.
      **Files / Components:** `.env.example`, compose, CI secret scanning.
      **Acceptance Criteria:** Secret scan passes; DB user has least privilege; no secret in repo.

- [ ] **SEC-T9.2 [M]** — Document access authorization & audited download (MVP)
      **Description:** Permission check before any document stream/pre-sign; every access audited; pre-signed URLs short-lived.
      **Files / Components:** `documents/service.py`.
      **Acceptance Criteria:** Unauthorized access → 403; each access logged to `audit_log`; URL expiry enforced.

- [ ] **SEC-T0.4 [S]** — OWASP Top 10 alignment checklist (MVP)
      **Description:** Verify implementation targets injection, broken auth, broken access control, sensitive-data exposure, security misconfiguration; track via the security test suite.
      **Files / Components:** `SECURITY_CHECKLIST.md`, security tests.
      **Acceptance Criteria:** Each OWASP item has a corresponding control + test; checklist signed off pre-go-live.

---

## 6. Logging and Audit Tasks

- [ ] **LOG-T1.1 [M]** — Audit writes on all sensitive actions (MVP)
      **Description:** Wire `core/audit.py` into: login (incl. failures), view profile, create/update patient & clinical records, upload, download, export, merge request/decision, user/role/master-data changes, backup events.
      **Files / Components:** services across all modules.
      **Implementation Notes:** Capture user, role snapshot, action, entity type/id, affected patient, old/new JSON, IP, user agent, `request_id`. Append-only.
      **Acceptance Criteria:** Each listed action writes exactly one audit row with required fields; audit is the only store holding clinical/PII detail.

- [ ] **LOG-T0.1 [M]** — PII/PHI-safe application logging (MVP)
      **Description:** Apply the redaction filter + allow-listed structured fields everywhere; no request/response bodies on clinical/patient endpoints; uploads log metadata only; search terms omitted/hashed; `echo=False`, debug off in prod; exception handler logs type+stack+`request_id` only.
      **Files / Components:** `core/logging.py`, `core/errors.py`, all routers.
      **Acceptance Criteria:** Representative clinical request logs contain no PII; route templates logged not resolved ids; covered by CI log-privacy guard (TST-T0.2).

- [ ] **LOG-T0.2 [S]** — Reverse-proxy query-string redaction (MVP)
      **Description:** Configure proxy access-log format to drop/anonymize query strings on patient/search routes.
      **Files / Components:** `ops/proxy/nginx.conf` (or Caddy/Traefik).
      **Acceptance Criteria:** Proxy logs for `/patients/search` contain no query params; path logged without query string.

- [ ] **LOG-T13.1 [S]** — Backup notification send-log (MVP)
      **Description:** Record backup notification outcomes in `backup_log`; basic send log for alerts.
      **Files / Components:** `backup/service.py`, `ops/backup/`.
      **Acceptance Criteria:** Each alert send recorded; status visible via backup status API.

- [ ] **LOG-T0.3 [S]** — Log storage, access & retention policy (MVP)
      **Description:** Restrict OS/file permissions on logs; retain ≥1 year then rotate/purge (SAD §10.1 #9); audit-log retention per org policy (open question).
      **Files / Components:** `ops/logging/`, compose volumes.
      **Acceptance Criteria:** Log files have restricted perms; rotation configured; retention documented.

---

## 7. Testing Tasks

- [ ] **TST-T0.1 [L]** — Test harness & CI test pipeline (MVP)
      **Description:** Set up pytest + httpx, ephemeral PostgreSQL (testcontainers/CI service), fixtures, factories, coverage reporting.
      **Files / Components:** `backend/app/tests/conftest.py`, CI workflow.
      **Acceptance Criteria:** `pytest` runs green in CI against ephemeral DB; coverage reported.

- [ ] **TST-T1.1 [M]** — Auth & RBAC unit/integration tests (MVP)
      **Description:** Cover login lockout, no-enumeration, refresh rotation, logout, permission-map enforcement.
      **Files / Components:** `tests/auth/`.
      **Acceptance Criteria:** Wrong-user/wrong-password identical errors; lockout triggers; RBAC denies unauthorized; explicit RBAC coverage.

- [ ] **TST-T4.1 [M]** — OP-numbering & concurrency tests (MVP)
      **Description:** Simultaneous registrations produce unique OP numbers; concurrent edits raise 409 (UC-29).
      **Files / Components:** `tests/concurrency/`.
      **Acceptance Criteria:** Parallel registrations → all unique; concurrent record edits → exactly one 409.

- [ ] **TST-T3.1 [M]** — Patient lifecycle integration tests (MVP)
      **Description:** registration → OP → search → timeline; min-identity, duplicate advisory, version conflict, role field-filtering.
      **Files / Components:** `tests/patients/`.
      **Acceptance Criteria:** Full vertical slice passes; limited-role responses filtered.

- [ ] **TST-T6.1 [M]** — Clinical workflow tests (MVP)
      **Description:** visit → case-sheet upsert → consultation notes → prescription → discharge finalize/amend; date rules; finalize-blocks-edit.
      **Files / Components:** `tests/clinical/`.
      **Acceptance Criteria:** Lifecycle correct; `DISCHARGE_ALREADY_FINALIZED` on finalized edit; date validation enforced.

- [ ] **TST-T9.1 [M]** — Document upload/secure-download tests (MVP)
      **Description:** upload validation (type/size) → secure proxied download → access denial → audit.
      **Files / Components:** `tests/documents/`.
      **Acceptance Criteria:** 413/415 enforced; unauthorized download → 403; access audited.

- [ ] **TST-T11.1 [S]** — Follow-up lifecycle tests (MVP)
      **Description:** Status transitions valid/invalid; queue filters; no hard delete.
      **Files / Components:** `tests/followups/`.
      **Acceptance Criteria:** Invalid transition → 409; queue filters correct.

- [ ] **TST-T15.1 [M]** — Merge request/approval & execution tests (R2)
      **Description:** request → admin approve/reject/cancel → atomic merge; same-patient guard; non-admin denial; before/after audit.
      **Files / Components:** `tests/duplicates/`.
      **Acceptance Criteria:** Merge reassigns children, soft-inactivates duplicate, retains alias, audits; explicit coverage required.

- [ ] **TST-T1.2 [M]** — Security negative test suite (MVP)
      **Description:** AuthN/Z negatives (no token/expired/wrong role/disabled), no-enumeration, document access denial, SQL-injection attempts.
      **Files / Components:** `tests/security/`.
      **Acceptance Criteria:** All negative cases blocked with documented codes; injection attempts fail.

- [ ] **TST-T0.2 [M]** — Log-privacy CI guard (MVP)
      **Description:** Scan representative clinical/patient request logs; fail if seeded PII (name/mobile) appears in non-audit streams.
      **Files / Components:** `tests/log_privacy/`, CI step.
      **Acceptance Criteria:** Seeded PII never appears in non-audit logs; test fails if it does.

- [ ] **TST-T0.3 [M]** — Migration up/down & seed-integrity test (MVP)
      **Description:** Alembic upgrade/downgrade on a clean DB; verify seed integrity.
      **Files / Components:** `tests/migrations/`.
      **Acceptance Criteria:** `upgrade head` then `downgrade base` clean; seeds present and correct.

- [ ] **TST-T0.4 [M]** — Performance / load tests (MVP, pre-go-live)
      **Description:** Validate NFRs against a ~50k-patient seeded dataset: search p95 < 1 s, dashboard p95 < 2 s, stable at 15–20 concurrent (peak 30).
      **Files / Components:** `tests/perf/` (k6/Locust scripts), seed generator.
      **Acceptance Criteria:** Targets met on UAT; tune indexes/materialized views only if missed.

- [ ] **TST-T0.5 [S]** — Coverage gates for critical paths (MVP)
      **Description:** Ensure OP numbering, merge request/approval, RBAC, and audit have explicit tests; enforce coverage on business-rule/security paths.
      **Files / Components:** CI coverage config.
      **Acceptance Criteria:** Named critical paths covered; CI fails below threshold on those paths.

---

## 8. Documentation Tasks

- [ ] **DOC-T0.1 [M]** — OpenAPI/Swagger publishing & contract upkeep (MVP)
      **Description:** Ensure FastAPI auto-publishes OpenAPI/Swagger; keep it in sync with `Docs/API_SPECIFICATION_OPENAPI.md`; optionally generate the TS client for the frontend.
      **Files / Components:** `backend/app/main.py` (OpenAPI metadata), CI export step.
      **Acceptance Criteria:** Swagger UI reachable; published contract matches the spec; (optional) TS client generated.

- [ ] **DOC-T0.2 [S]** — Backend README & module conventions (MVP)
      **Description:** Document project structure, layering rules (`routers→services→repositories→models`), how to add a module, env setup.
      **Files / Components:** `backend/README.md`, `CONTRIBUTING.md`.
      **Acceptance Criteria:** A new dev can scaffold a module and run the app from the docs alone.

- [ ] **DOC-T0.3 [S]** — Migration & release notes process (MVP)
      **Description:** Document Alembic workflow (up/down, forward-fix preference) and a `CHANGELOG` capturing per-release migration/ops steps (SAD §19).
      **Files / Components:** `CHANGELOG.md`, `Docs/MIGRATIONS.md`.
      **Acceptance Criteria:** Each release records its migration notes + manual steps.

- [ ] **DOC-T13.1 [S]** — Backup/restore & ops runbooks (MVP)
      **Description:** Document backup schedule, retention, offsite target, and the tested restore runbook; deployment & rollback steps.
      **Files / Components:** `ops/backup/RESTORE_RUNBOOK.md`, `ops/DEPLOYMENT.md`.
      **Acceptance Criteria:** Runbooks complete and validated by a drill (INT-T13.3).

- [ ] **DOC-T0.4 [S]** — Security & log-privacy documentation (MVP)
      **Description:** Document RBAC matrix, permission codes, log-privacy controls (SAD §10.1), and the OWASP alignment checklist.
      **Files / Components:** `SECURITY_CHECKLIST.md`, `Docs/LOG_PRIVACY.md`.
      **Acceptance Criteria:** Controls documented and mapped to tests; reviewed by security reviewer.

- [ ] **DOC-T0.5 [S]** — Open-questions tracker resolution log (MVP)
      **Description:** Track resolution of SAD §27 open questions affecting config (OP format, retention, hosting, upload limit, SMTP, etc.) before build lock.
      **Files / Components:** `Docs/OPEN_QUESTIONS_LOG.md`.
      **Acceptance Criteria:** Each open question has an owner + decision before R1 config is frozen.

---

*End of Phase 1 API / Backend Task Checklist — ArogyaM PMS.*
