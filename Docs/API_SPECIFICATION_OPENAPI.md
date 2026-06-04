# ArogyaM Patient Management System — API Specification (OpenAPI / Swagger)

**Document Type:** API Specification (OpenAPI 3.1)
**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Version:** 1.0
**Date:** 2026-06-04
**Status:** For Review

**Source References:**
- `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` — System Architecture Document (SAD v1.0)
- `Docs/PHASE1_IMPLEMENTATION_PLAN.md` — Phase 1 Implementation Plan v1.0
- `Docs/DDL_DATAMODEL.sql` — Phase 1 Database DDL / Data Model

**Intended Audience:** Backend Developers · Frontend Developers · QA / API Testers · Tech Lead · Client Reviewers

> This document defines the complete REST API contract for ArogyaM PMS Phase 1. It is derived strictly from the approved architecture, implementation plan, and data model. No endpoints outside those documents have been invented; where a detail was not explicitly specified it is inferred logically and flagged with **Assumption:**. The machine-readable contract lives in **Section 11 (OpenAPI YAML)**; Sections 1–10 are the human-readable companion.

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Authentication and Authorization](#2-authentication-and-authorization)
3. [Common API Standards](#3-common-api-standards)
4. [Common Headers](#4-common-headers)
5. [Common Response Structure](#5-common-response-structure)
6. [Error Code Design](#6-error-code-design)
7. [API Endpoint Specification](#7-api-endpoint-specification)
8. [Data Schemas](#8-data-schemas)
9. [Integration APIs](#9-integration-apis)
10. [Security Considerations](#10-security-considerations)
11. [OpenAPI YAML](#11-openapi-yaml)

---

## 1. API Overview

| Attribute | Value |
|-----------|-------|
| **Application name** | ArogyaM Patient Management System (PMS) |
| **API purpose** | Expose all Phase 1 internal-operations functionality — authentication & RBAC, patient registration with transaction-safe OP numbering, search, patient profile & timeline, visits/case sheets/consultation notes, prescriptions, discharge summaries, document upload/download, follow-up tracking, duplicate detection & merge workflow, dashboard, reports/export, audit trail, master data, and backup status — as a versioned REST contract consumed by the React SPA. |
| **API consumers** | (1) **ArogyaM React SPA** (primary, internal staff: Administrator, Doctor, Receptionist, Data Entry Staff); (2) **QA / automated test suites** (pytest, Playwright, k6); (3) **internal admin tooling** (bulk historical import utility — Full-Scope). No public/external consumers in Phase 1. |
| **API style** | REST over HTTPS, JSON request/response. Auto-generated OpenAPI/Swagger from FastAPI (SAD §9.1). |
| **Identifier convention** | UUID v4 for business/transactional entities; integer/smallint for static lookups (roles, master_data, op_sequence). |
| **Naming convention** | `snake_case` JSON fields; ISO-8601 timestamps (UTC). |

### 1.1 Base URL placeholders

All endpoints are versioned under the `/api/v1` prefix (SAD §9.1, Plan §6).

| Environment | Base URL |
|-------------|----------|
| **Development** | `https://dev.arogyam.local/api/v1` |
| **QA / Test** | `https://qa.arogyam.local/api/v1` |
| **UAT** | `https://uat.arogyam.example.com/api/v1` |
| **Production** | `https://pms.arogyam.example.com/api/v1` |

> **Assumption:** Concrete hostnames are placeholders. Final hosting (cloud vs on-premise) and domains are open questions (SAD §27). The `/api/v1` path prefix and HTTPS-only posture are fixed by the SAD; only the host changes per environment.

---

## 2. Authentication and Authorization

### 2.1 Authentication mechanism
- **JWT bearer authentication** (SAD §10, Plan §8). Stateless access token + refresh token.
- Login (`POST /auth/login`) validates `username` + `password` against an **ACTIVE** user (`status='ACTIVE'`); `DISABLED`/`LOCKED` users are rejected. Passwords are stored only as argon2/bcrypt hashes.
- **Brute-force protection:** failed attempts increment `users.failed_login_attempts`; exceeding the threshold sets `users.locked_until` (temporary lockout). Bad credentials always return a **generic** error — no username enumeration (UC-01, Plan §8).
- **Refresh rotation:** `POST /auth/refresh` exchanges a valid refresh token for a new access token (and rotated refresh token). `POST /auth/logout` revokes the current token (optional Redis denylist).

### 2.2 Token format
- **Type:** JWT (`Authorization: Bearer <access_token>`).
- **Access token TTL:** short-lived. **Assumption:** 15 minutes.
- **Refresh token TTL:** longer-lived, rotated on use. **Assumption:** 8 hours (aligns with an inactivity-timeout session model; SAD §10).
- **Claims (Assumption, aligned to SAD §10 / data model):**
  ```json
  {
    "sub": "<user uuid>",
    "username": "jdoe",
    "roles": ["DOCTOR"],
    "permissions": ["view_medical_history", "add_consultation"],
    "is_doctor": true,
    "type": "access",
    "iat": 1717459200,
    "exp": 1717460100,
    "jti": "<token id for denylist>"
  }
  ```

### 2.3 Role-based access control (RBAC)
- Four roles, seeded in `roles` (DDL §9.1): `ADMIN` (Administrator), `DOCTOR`, `RECEPTION` (Receptionist), `DATA_ENTRY` (Data Entry Staff).
- A user may hold **one or more roles** (`user_roles` is many-to-many).
- Authorization is **deny-by-default** and enforced server-side by a central FastAPI dependency per endpoint **and** per record (SAD §11.3, Plan §8). The SPA additionally hides unauthorized actions, but UI gating never replaces server enforcement.
- **Coarse permissions** (Plan §8) mapped from the UC §4 / SAD §11 matrix: `create_patient`, `edit_patient`, `view_patient`, `view_medical_history`, `add_consultation`, `add_prescription`, `add_discharge_summary`, `upload_document`, `manage_followups`, `request_merge`, `merge_records`, `manage_users`, `manage_master_data`, `view_audit`, `backup_control`, `view_reports`, `export`.
- **Field-level visibility (limited ABAC):** Receptionist / Data Entry receive a reduced medical view; response schemas are filtered by role (Plan §8). Not a full ABAC engine in Phase 1.

#### Role → permission summary (from SAD §11.2)

| Permission | ADMIN | DOCTOR | RECEPTION | DATA_ENTRY |
|------------|:-----:|:------:|:---------:|:----------:|
| manage_users / view_audit / backup_control | ✅ | ❌ | ❌ | ❌ |
| manage_master_data | ✅ | ❌ | ❌ | ❌ |
| create_patient / edit_patient | ✅ | Limited | ✅ | Limited |
| view_patient | ✅ | ✅ | ✅ | ✅ |
| view_medical_history | ✅ (full) | ✅ (full) | Limited | Limited |
| add_consultation / add_prescription / add_discharge_summary | Optional | ✅ | ❌ | ❌ |
| upload_document | ✅ | ✅ | ✅ | ✅ |
| manage_followups | ✅ | ✅ | ✅ | Limited |
| request_merge | ✅ | ❌ | ✅ (request) | ✅ (request) |
| merge_records (approve/execute) | ✅ | ❌ | ❌ | ❌ |
| view_reports / export | ✅ | Limited | Limited | ❌ |

> **Assumption:** "Limited" / "Optional" cells follow the SAD §11.2 matrix; the exact field-level visibility list for Receptionist is an open question (SAD §27 #4). The API exposes the effective permission set per user via `GET /me/permissions` so the frontend never hard-codes the matrix.

### 2.4 Tenant identification
- **Not applicable in Phase 1** — single organization, single branch (SAD §2.6 A1, §11.6). No tenant header is required.
- **Future-readiness:** an `X-Tenant-ID` / `branch_id` scoping seam is documented as future work (SAD §8.1/§24). Clients should **not** send a tenant header in Phase 1.

### 2.5 Common authorization rules
1. **No token / expired / malformed token →** `401 Unauthorized` (`AUTH_REQUIRED` / `AUTH_TOKEN_EXPIRED`).
2. **Valid token but disabled/locked user →** `403 Forbidden` (`AUTH_ACCOUNT_DISABLED`).
3. **Valid active user lacking the required permission →** `403 Forbidden` (`AUTHZ_FORBIDDEN`).
4. **Record-level rule fails** (e.g., role may not view full medical history) → `403 Forbidden` or a field-filtered response, depending on the endpoint.
5. **Every authorized sensitive action** (view profile, create/update clinical record, upload, export, merge, login, user/master-data change) **writes an `audit_log` row** carrying the `request_id` (SAD §11.3, Plan §10.1).

---

## 3. Common API Standards

| Standard | Rule |
|----------|------|
| **URL naming** | Lowercase, plural resource nouns, hyphenated multi-word segments: `/patients`, `/follow-ups`, `/master-data`, `/merge-requests`, `/audit-logs`, `/backup/status`. Nested resources express ownership: `/patients/{patient_id}/visits`, `/visits/{visit_id}/case-sheet`. No verbs in paths except controlled action sub-resources (`/discharge-summary/finalize`, `/merge-requests/{id}/approve`, `/patients/{id}/export`). |
| **HTTP methods** | `GET` (read, safe, idempotent) · `POST` (create / non-idempotent action) · `PUT` (full/controlled update and status changes, e.g. `PUT /users/{id}/status`, idempotent). `PATCH` is **not** used in Phase 1 — partial state changes are modeled as `PUT` on the resource or a dedicated action sub-resource. `DELETE` is **not** used on patient/clinical/document resources (soft-delete only via status). |
| **Request/response format** | `application/json` (UTF-8) for all resource bodies; `multipart/form-data` for file uploads only. Field naming is `snake_case`. Unknown request fields are rejected on strict schemas (Plan §9). |
| **Pagination** | Offset-style: `?page=<1-based>&page_size=<n>`. Defaults: `page=1`, `page_size=20`, `page_size` max **100**. List responses use the **paginated envelope** (§5.4) with `total`, `page`, `page_size`. |
| **Filtering** | Resource-specific query parameters (e.g. `?status=PENDING`, `?document_type=LAB_REPORT`, `?from=&to=`). Search endpoint uses `?q=`, `?op_number=`, `?mobile=`, `?name=`. |
| **Sorting** | `?sort=<field>&order=<asc\|desc>`. Default sort is resource-specific (e.g. most-recent-first by `created_at`/`visit_date`). |
| **Idempotency** | `GET`/`PUT` are idempotent. OP-number generation is transaction-safe server-side (row-locked sequence) so retried registrations cannot duplicate numbers. **Assumption:** mutating non-idempotent endpoints (registration, upload, merge approval) accept an optional `Idempotency-Key` header; a repeated key within a short window returns the original result instead of creating a duplicate (SAD §15 future-readiness pattern, applied defensively). |
| **Date/time format** | **ISO-8601 / RFC 3339, UTC.** Timestamps: `2026-06-04T10:15:30Z` (maps to `TIMESTAMPTZ`). Date-only fields (`visit_date`, `date_of_birth`, `follow_up_date`): `YYYY-MM-DD` (maps to `DATE`). |
| **File upload** | `multipart/form-data` with a `file` part plus metadata fields. Server-side validation: allow-list `application/pdf`, `image/jpeg`, `image/png`; max size enforced (**Assumption:** 10 MB, SAD §2.6 A5). Content-type sniffing in addition to extension check. Optional AV scan hook. |
| **File download** | Permission-checked **proxy** endpoint (`GET /documents/{id}/content`) streaming the binary, **or** a short-lived pre-signed URL (`GET /documents/{id}/download-url`). Object-storage URLs are never exposed directly (SAD §9.1, UC-30). |

---

## 4. Common Headers

### 4.1 Request headers

| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes (all except `/auth/login`, `/auth/refresh`, `/health`, `/ready`) | `Bearer <access_token>`. |
| `Content-Type` | On request bodies | `application/json` for resources; `multipart/form-data` for uploads. |
| `Accept` | Recommended | `application/json` (or `application/pdf`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` for export/download responses). |
| `X-Request-ID` | Optional | Client-supplied correlation ID. If absent, the server generates one. Echoed in responses and stored in `audit_log.request_id` (SAD §10.1). |
| `Idempotency-Key` | Optional | For retry-safe creation/mutation (see §3). **Assumption.** |
| `X-Tenant-ID` | **Not used** | Reserved for future multi-branch; ignored in Phase 1 (§2.4). |

### 4.2 Response headers

| Header | Description |
|--------|-------------|
| `Content-Type` | `application/json` (or file MIME on download/export). |
| `X-Request-ID` | Correlation ID (mirrors request or server-generated); use this when reporting issues — it links to redacted app logs and the audit trail. |
| `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `Retry-After` | Present on rate-limited endpoints (auth) when Redis limiter is enabled (SAD §9.1). **Assumption** on exact header names. |
| `WWW-Authenticate` | `Bearer` on `401` responses. |

---

## 5. Common Response Structure

All responses use one of the four envelopes below for consistency across modules.

### 5.1 Success response (single resource)
The resource object is returned directly (not wrapped), e.g. a `Patient` object. `2xx` status with the entity body.

```json
{
  "id": "8f3b2c1a-0d4e-4a9b-9c2e-1a2b3c4d5e6f",
  "op_number": "OPN0012",
  "full_name": "Asha Rao",
  "status": "ACTIVE",
  "version": 1,
  "created_at": "2026-06-04T10:15:30Z"
}
```

### 5.2 Error response (envelope)
Consistent error envelope across **all** non-2xx responses (SAD §9.1, Plan §9):

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Patient not found.",
    "details": [],
    "request_id": "b7d4f2a0-1c3e-4f5a-9b8c-2d1e0f3a4b5c"
  }
}
```

### 5.3 Validation error format
`422 Unprocessable Entity` with field-level detail (Pydantic v2 boundary validation, Plan §9):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      { "field": "mobile", "code": "invalid_format", "message": "Mobile number is not valid." },
      { "field": "full_name", "code": "required", "message": "Full name is required." }
    ],
    "request_id": "b7d4f2a0-1c3e-4f5a-9b8c-2d1e0f3a4b5c"
  }
}
```

### 5.4 Pagination response (collection)
List endpoints wrap items in a paginated envelope (SAD §9.1):

```json
{
  "items": [ /* array of resource objects */ ],
  "total": 137,
  "page": 1,
  "page_size": 20
}
```

---

## 6. Error Code Design

### 6.1 HTTP status codes

| Status | Meaning / Usage |
|--------|-----------------|
| `200 OK` | Successful read or update. |
| `201 Created` | Resource created (registration, visit, clinical record, upload, follow-up, merge request). |
| `202 Accepted` | Async/queued action accepted (e.g. bulk historical import — Full-Scope). |
| `204 No Content` | Successful action with no body (e.g. logout). |
| `400 Bad Request` | Malformed request, bad query parameters. |
| `401 Unauthorized` | Missing/invalid/expired token. |
| `403 Forbidden` | Authenticated but not permitted (role/record/disabled account). |
| `404 Not Found` | Resource does not exist (or is hidden from caller). |
| `409 Conflict` | Optimistic-concurrency version mismatch (UC-29), duplicate unique key, or invalid state transition (e.g. editing a finalized discharge summary). |
| `413 Payload Too Large` | Upload exceeds size limit. |
| `415 Unsupported Media Type` | Upload type not in allow-list. |
| `422 Unprocessable Entity` | Schema/field validation failure. |
| `429 Too Many Requests` | Rate limit exceeded (auth throttling). |
| `500 Internal Server Error` | Unhandled error — generic envelope with `request_id` only (no internals leaked). |
| `503 Service Unavailable` | Dependency (DB/storage) not ready (`/ready`). |

### 6.2 Application-level error codes (`error.code`)

| Domain | Code | Typical HTTP |
|--------|------|--------------|
| **Validation** | `VALIDATION_ERROR` | 422 |
| | `INVALID_FILE_TYPE` | 415 |
| | `FILE_TOO_LARGE` | 413 |
| **Authentication** | `AUTH_REQUIRED` | 401 |
| | `AUTH_INVALID_CREDENTIALS` | 401 |
| | `AUTH_TOKEN_EXPIRED` | 401 |
| | `AUTH_TOKEN_INVALID` | 401 |
| | `AUTH_ACCOUNT_LOCKED` | 401/403 |
| | `AUTH_ACCOUNT_DISABLED` | 403 |
| **Authorization** | `AUTHZ_FORBIDDEN` | 403 |
| **Resource** | `RESOURCE_NOT_FOUND` | 404 |
| | `RESOURCE_CONFLICT` | 409 (duplicate unique key) |
| **Concurrency** | `VERSION_CONFLICT` | 409 (optimistic lock, UC-29) |
| **Business rule** | `OP_NUMBER_GENERATION_FAILED` | 409/500 |
| | `DUPLICATE_PATIENT_SUSPECTED` | 409 (advisory on create — overridable) |
| | `MERGE_INVALID_STATE` | 409 (request not PENDING) |
| | `MERGE_SAME_PATIENT` | 422 (primary == duplicate) |
| | `DISCHARGE_ALREADY_FINALIZED` | 409 (edit blocked, UC-13) |
| | `MIN_IDENTITY_REQUIRED` | 422 (name + ≥1 contact/ID, UC-03 BR4) |
| | `INVALID_LOOKUP_CODE` | 422 (master_data code not found/inactive) |
| | `INVALID_STATE_TRANSITION` | 409 (e.g. follow-up/visit status) |
| **Rate limit** | `RATE_LIMITED` | 429 |
| **Server** | `INTERNAL_ERROR` | 500 |
| | `SERVICE_UNAVAILABLE` | 503 |

### 6.3 Validation errors
Returned as `422` with `error.code = VALIDATION_ERROR` and a `details[]` array of `{ field, code, message }` (see §5.3). Enforced domain rules (Plan §9): patient minimum identity, non-future visit date unless scheduled, `discharge_date ≥ admission_date`, allow-listed file types/size, and lookup-code existence against `master_data`.

### 6.4 Authentication & authorization errors
Auth failures use the `401` codes in §6.2 with a **generic** message (no username enumeration, UC-01). Authorization failures use `403 AUTHZ_FORBIDDEN`. Disabled/locked accounts that present a valid token still receive `403 AUTH_ACCOUNT_DISABLED`.

### 6.5 Business-rule errors
Mapped to `409` (state/concurrency conflicts) or `422` (semantic validation). Key examples: `VERSION_CONFLICT` (concurrent edit), `DISCHARGE_ALREADY_FINALIZED`, `MERGE_INVALID_STATE`, `DUPLICATE_PATIENT_SUSPECTED` (advisory; the client may resubmit with `confirm_create=true`).

---

## 7. API Endpoint Specification

Endpoints are grouped by module exactly per SAD §9.2 / Plan §3. Each endpoint lists method, path, purpose, required permission, key parameters, and request/response shapes. Full request/response schemas are in **Section 8**; the authoritative machine contract is **Section 11**.

> **Convention:** All paths below are relative to the base URL (`…/api/v1`). All endpoints except `POST /auth/login`, `POST /auth/refresh`, `GET /health`, `GET /ready` require `Authorization: Bearer`. All list endpoints accept `page`, `page_size`, `sort`, `order`. All endpoints can return `401`, `403`, `422`, `429`, `500` per Section 6; only notable per-endpoint errors are called out.

---

### 7.1 Module: Auth & Session (`Auth`)
**Tier:** MVP · **Tables:** `users`, `user_roles`, `roles`, `audit_log`

| # | API | Method & Path | Purpose | Permission |
|---|-----|---------------|---------|------------|
| 1 | Login | `POST /auth/login` | Authenticate, issue access+refresh tokens; audited (incl. failures) | Public |
| 2 | Refresh | `POST /auth/refresh` | Exchange refresh token for new access token (rotation) | Public (valid refresh token) |
| 3 | Logout | `POST /auth/logout` | Revoke current token / denylist | Authenticated |
| 4 | Current user | `GET /me` | Profile of the logged-in user | Authenticated |
| 5 | My permissions | `GET /me/permissions` | Effective permission set for UI gating | Authenticated |

**`POST /auth/login`**
- **Request body:** `LoginRequest` — `{ "username": "jdoe", "password": "•••••" }`
- **Success `200`:** `TokenResponse`
  ```json
  {
    "access_token": "<jwt>",
    "refresh_token": "<jwt>",
    "token_type": "bearer",
    "expires_in": 900
  }
  ```
- **Errors:** `401 AUTH_INVALID_CREDENTIALS` (generic), `401 AUTH_ACCOUNT_LOCKED`, `403 AUTH_ACCOUNT_DISABLED`, `429 RATE_LIMITED`.

**`GET /me`** → `200 UserProfile` (id, username, full_name, email, roles, permissions, is_doctor, last_login_at).
**`GET /me/permissions`** → `200 { "permissions": ["view_patient", "add_consultation"], "roles": ["DOCTOR"] }`.

---

### 7.2 Module: User Management (`Users`)
**Tier:** MVP · **Permission:** `manage_users` (Admin-only) · **Tables:** `users`, `user_roles`, `audit_log`

| # | Method & Path | Purpose | Notes |
|---|---------------|---------|-------|
| 1 | `GET /users` | List/search users; supports `?is_doctor=true` (doctor picker), `?status=`, `?q=` | Admin; `is_doctor=true` listing also used by clinical screens |
| 2 | `POST /users` | Create user (with roles) | Audited |
| 3 | `GET /users/{user_id}` | Get a user | |
| 4 | `PUT /users/{user_id}` | Update user details/roles (version-checked) | Audited; role change audited (UC-02 BR4) |
| 5 | `PUT /users/{user_id}/status` | Enable/disable (toggle `users.status`) | Disabled/locked users cannot authenticate |
| 6 | `POST /users/{user_id}/reset-password` | Set new password hash, stamp `password_changed_at`, clear lockout | Audited |
| 7 | `GET /roles` | List RBAC roles | Permission: authenticated (used by user form) |

> **Note (Plan §3):** The doctor picker is `GET /users?is_doctor=true` — there is **no** separate doctor lookup table.

- **`POST /users` request:** `UserCreateRequest` — `{ username, full_name, email?, mobile?, password, is_doctor?, role_codes: ["DOCTOR"] }`
- **Success `201`:** `User`
- **Errors:** `409 RESOURCE_CONFLICT` (duplicate username/email), `422 VALIDATION_ERROR`.
- **`PUT /users/{id}/status` request:** `{ "status": "DISABLED", "version": 3 }` → `200 User`; `409 VERSION_CONFLICT` on stale version.

---

### 7.3 Module: Master Data (`MasterData`)
**Tier:** MVP (data) / Full-Scope (config UI) · **Permission:** read = authenticated; write = `manage_master_data` (Admin) · **Tables:** `master_data`, `op_sequence`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /master-data/{type}` | List values for a lookup type (e.g. `visit_type`, `document_type`, `follow_up_status`, `blood_group`, `gender`, `consultation_category`, `dietary_preference`, `marital_status`, `condition_at_discharge`); `?active=true` filter |
| 2 | `POST /master-data/{type}` | Add a value (Admin) |
| 3 | `PUT /master-data/{type}/{id}` | Update/deactivate a value (Admin) |
| 4 | `GET /op-sequences` | List OP-number sequences (Admin) |
| 5 | `PUT /op-sequences/{id}` | Update prefix/padding/reset policy (Admin, audited) — `last_sequence` not client-settable except controlled correction |

- `{type}` path enum is constrained to the `master_data.type` CHECK list (§8.5).
- **`GET /master-data/visit_type`** → `200` array of `MasterDataItem` `{ id, type, code, label, sort_order, is_active }`.
- **Errors:** `404 RESOURCE_NOT_FOUND` (unknown type), `409 RESOURCE_CONFLICT` (duplicate `type+code`).

---

### 7.4 Module: Patient Registration & Profile (`Patients`)
**Tier:** MVP · **Tables:** `patients`, `patient_aliases`, `op_sequence`, `audit_log`

| # | Method & Path | Purpose | Permission |
|---|---------------|---------|------------|
| 1 | `POST /patients` | Register a patient; generates OP number in a row-locked transaction; runs inline duplicate check | `create_patient` |
| 2 | `GET /patients/{patient_id}` | Get patient profile (role-filtered fields); **access audited** | `view_patient` |
| 3 | `PUT /patients/{patient_id}` | Update demographics (version-checked, audited old/new) | `edit_patient` |
| 4 | `GET /patients/{patient_id}/timeline` | Chronological timeline: visits, case sheets, consultation notes, prescriptions, discharge summaries, documents, follow-ups (UC-17) | `view_patient` |
| 5 | `GET /patients/{patient_id}/aliases` | List old/legacy OP numbers (merge/historical) | `view_patient` |
| 6 | `POST /patients/{patient_id}/op-correction` | **Candidate (Assumption).** Admin-only controlled OP-number correction; preserves the old number as a `patient_aliases` row (`source='CORRECTION'`) and fully audits old/new | `manage_master_data` (Admin) |

**`POST /patients`**
- **Request body:** `PatientCreateRequest` (§8.2) — requires `full_name`, `op_category_code`, and **at least one** of `mobile`/`email`/`date_of_birth`/`age_years` (min-identity rule, UC-03 BR4). `op_number` is **server-generated** — not accepted from the client.
- **Query:** `confirm_create` (boolean, default false) — set `true` to proceed despite a duplicate suspicion.
- **Success `201`:** `Patient` (includes generated `op_number`, `version=1`).
- **Errors:** `409 DUPLICATE_PATIENT_SUSPECTED` (advisory, returns suggested matches in `error.details`; resubmit with `confirm_create=true`), `422 MIN_IDENTITY_REQUIRED`, `422 INVALID_LOOKUP_CODE`.

**`PUT /patients/{id}`**
- **Request body:** `PatientUpdateRequest` including current `version`.
- **Errors:** `409 VERSION_CONFLICT` (concurrent edit → UI reload, UC-29).
- **Note:** `op_number` is **immutable** on this endpoint.

**`POST /patients/{id}/op-correction`** — *Candidate endpoint (Assumption)*
- **Why it exists:** SAD §7.5 states the OP number is "immutable except controlled admin correction," and the data model reserves `patient_aliases.source='CORRECTION'` for exactly this — but neither the SAD nor the Implementation Plan defines an endpoint. It is therefore specified here as a **candidate**, not a committed contract item, pending confirmation of the OP-format/correction rules (SAD §27 #13).
- **Request body:** `OpCorrectionRequest` — `{ new_op_number, reason, version }`.
- **Behavior:** Admin-only, single transaction: validate uniqueness of `new_op_number`, write a `patient_aliases` row capturing the previous number (`source='CORRECTION'`), update `patients.op_number`, and audit old/new. 
- **Errors:** `403 AUTHZ_FORBIDDEN` (non-admin), `409 RESOURCE_CONFLICT` (new number already in use), `409 VERSION_CONFLICT`, `422 VALIDATION_ERROR`.

**`GET /patients/{id}/timeline`** → `200 PatientTimeline` — `{ patient_id, events: [ { type, occurred_on, ref_id, summary, ... } ] }`, sorted most-recent-first. Medical content respects field-level visibility.

---

### 7.5 Module: Search & Retrieval (`Search`)
**Tier:** MVP · **Permission:** `view_patient` · **Tables:** `patients` (FTS/trgm), `patient_aliases`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /patients/search` | Search by OP number, mobile, exact/partial name; paginated; returns **minimal identifiers only** (no medical data); ranks exact OP/mobile first, then name relevance |

- **Query parameters:** `q` (free text), `op_number`, `mobile`, `name`, `op_category`, `status`, `page`, `page_size`, `sort`, `order`.
- **Success `200`:** `Paginated<PatientSearchResult>` where `PatientSearchResult` = `{ id, op_number, full_name, gender, age_or_dob, mobile_masked, op_category_code, status }` — **no clinical fields** (SAD §7.7).
- **Privacy:** search terms are not logged in plaintext (SAD §10.1); opening a profile from results is audited.

---

### 7.6 Module: Visit & Consultation (`Visits`)
**Tier:** MVP · **Tables:** `visits`, `case_sheets`, `consultation_notes`

| # | Method & Path | Purpose | Permission |
|---|---------------|---------|------------|
| 1 | `POST /patients/{patient_id}/visits` | Create a visit/encounter | `edit_patient` / clinical |
| 2 | `GET /patients/{patient_id}/visits` | List a patient's visits (paginated) | `view_patient` |
| 3 | `GET /visits/{visit_id}` | Get a single visit | `view_patient` |
| 4 | `PUT /visits/{visit_id}` | Update visit (status/doctor/reason; version-checked) | clinical |
| 5 | `PUT /visits/{visit_id}/case-sheet` | Create/update the visit's case sheet (one per visit) | `add_consultation` |
| 6 | `GET /visits/{visit_id}/case-sheet` | Get the case sheet | `view_medical_history` |
| 7 | `POST /visits/{visit_id}/consultation-notes` | Add a doctor consultation note | `add_consultation` |
| 8 | `GET /visits/{visit_id}/consultation-notes` | List consultation notes for the visit | `view_medical_history` |

- **`POST /patients/{id}/visits` request:** `VisitCreateRequest` — `{ visit_date, visit_type_code, consultation_category?, doctor_id?, is_scheduled?, reason? }`. Non-scheduled visits cannot be future-dated (UC-08 BR4) → `422 VALIDATION_ERROR`.
- **Case sheet** uses `PUT` (upsert; unique per visit) — version-checked, audited.
  > **Deviation from SoW (intentional):** SAD §7.8 / Plan §3 name this `POST /visits/{id}/case-sheet`. Because the data model enforces **one case sheet per visit** (`uq_case_sheets_visit`), an idempotent `PUT` upsert is the correct REST verb (create-or-update on a singleton sub-resource) and avoids a spurious `409` on the second save. The path is unchanged; only the verb is refined. Sign-off recommended.
- **Consultation notes** are append-only entries; corrections are amended entries (never silent overwrite).

---

### 7.7 Module: Prescriptions (`Clinical`)
**Tier:** MVP · **Permission:** `add_prescription` (write) / `view_medical_history` (read) · **Tables:** `prescriptions`, `prescription_items`, `documents`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `POST /visits/{visit_id}/prescriptions` | Create a prescription with structured `items[]` (and/or free-text) |
| 2 | `GET /visits/{visit_id}/prescriptions` | List prescriptions for a visit |
| 3 | `GET /prescriptions/{prescription_id}` | Get a prescription with its items |

- **Request:** `PrescriptionCreateRequest` — `{ doctor_id?, prescription_date?, instructions?, review_advice?, medicine_details?, items: [ PrescriptionItem ] }`.
- `PrescriptionItem` = `{ line_no?, medicine_name, dosage?, timing?, duration?, usage_instruction?, application_route? (INTERNAL|EXTERNAL) }`.
- **Assumption:** structured PDF generation of a prescription is Full-Scope; in MVP a scanned prescription can instead be attached via the Documents module (`document_type=PRESCRIPTION`).

---

### 7.8 Module: Discharge Summaries (`Clinical`)
**Tier:** MVP · **Permission:** `add_discharge_summary` (write) / `view_medical_history` (read) · **Tables:** `discharge_summaries`, `documents`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `POST /visits/{visit_id}/discharge-summary` | Create a draft discharge summary |
| 2 | `GET /visits/{visit_id}/discharge-summary` | Get the **current effective** discharge summary for a visit |
| 3 | `GET /visits/{visit_id}/discharge-summary/history` | List all versions for the visit (original + amendments), newest first |
| 4 | `PUT /discharge-summaries/{id}` | Update a **draft** (blocked once finalized) |
| 5 | `PUT /discharge-summaries/{id}/finalize` | Finalize → `is_finalized=true`, stamp `finalized_at/by`; becomes immutable |
| 6 | `POST /discharge-summaries/{id}/amend` | Create an audited amendment (new row, `amends_id` → superseded summary) |

- **Validation:** `discharge_date ≥ admission_date` (UC-13 BR2) → `422`.
- **State:** editing/`PUT` on a finalized summary → `409 DISCHARGE_ALREADY_FINALIZED`. Amendments are the only post-finalization change path.
- **Amendment / version semantics (resolves the multi-row case):** The data model permits **more than one** `discharge_summaries` row per visit — an original plus a chain of amendments linked by `amends_id` (there is no unique-per-visit constraint, unlike `case_sheets`). To make retrieval unambiguous:
  - `GET /visits/{id}/discharge-summary` returns the **single current effective** summary — i.e. the latest row in the amendment chain that has not itself been superseded by a newer amendment. If only a draft/original exists, that row is returned.
  - The response includes `is_superseded` (boolean) and `superseded_by` (UUID, nullable) so a client can detect and walk the chain.
  - `GET …/discharge-summary/history` returns the full ordered list for audit/clinical review.
  - **`404`** is returned only when the visit has **no** discharge summary at all.

---

### 7.9 Module: Documents (`Documents`)
**Tier:** MVP · **Permission:** `upload_document` (write) / `view_patient` (read) · **Tables:** `documents`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `POST /patients/{patient_id}/documents` | Upload a document (multipart); validate type/size; store in MinIO/S3; persist metadata | 
| 2 | `GET /patients/{patient_id}/documents` | List a patient's documents (filter `?document_type=`, `?status=`, `?visit_id=`) |
| 3 | `GET /documents/{document_id}` | Get document **metadata** |
| 4 | `GET /documents/{document_id}/content` | **Proxied** permission-checked binary stream; access audited |
| 5 | `GET /documents/{document_id}/download-url` | Short-lived pre-signed download URL (alternative to proxy) |
| 6 | `PUT /documents/{document_id}` | Update metadata (title/type/remarks) or soft-delete via `status` |

- **Upload (`multipart/form-data`):** parts — `file` (binary) + `document_type_code` + optional `visit_id`, `title`, `document_date`, `is_historical`, `remarks`.
- **Errors:** `415 INVALID_FILE_TYPE` (not PDF/JPG/PNG), `413 FILE_TOO_LARGE`.
- **Success `201`:** `Document` metadata (no public URL; `storage_ref` not exposed to non-admin clients).
  > **Deviation from SoW (intentional):** SAD §7.9 / Plan §3 name a single `GET /documents/{id}` for the "permission-checked download." This spec splits that into **`GET /documents/{id}`** (JSON metadata) and **`GET /documents/{id}/content`** (the audited binary stream), plus an optional **`/download-url`** for the pre-signed-URL strategy. This keeps a JSON resource separate from a binary resource (cleaner client typing and caching) while preserving the same security model. Sign-off recommended.

---

### 7.10 Module: Follow-Up Tracking (`FollowUps`)
**Tier:** MVP · **Permission:** `manage_followups` · **Tables:** `follow_ups`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `POST /patients/{patient_id}/follow-ups` | Create a follow-up task |
| 2 | `GET /patients/{patient_id}/follow-ups` | List a patient's follow-ups |
| 3 | `PUT /follow-ups/{follow_up_id}` | Update status/remarks/assignment (version-checked, audited) |
| 4 | `GET /follow-ups` | List/queue follow-ups (filter `?status=`, `?from=&to=`, `?assigned_to=`) for the Follow-Up Register & dashboard |

- **Status lifecycle (SAD §12.1):** `PENDING → CONTACTED | NOT_REACHABLE → COMPLETED | RESCHEDULED`; `RESCHEDULED` may chain a new follow-up via `next_followup_id`. Invalid transitions → `409 INVALID_STATE_TRANSITION`.
- Follow-ups are **not deletable** by normal users (soft lifecycle only).

---

### 7.11 Module: Duplicate Detection & Merge (`Duplicates`)
**Tier:** Full-Scope · **Tables:** `patients`, `patient_aliases`, `merge_requests`, `audit_log`

| # | Method & Path | Purpose | Permission |
|---|---------------|---------|------------|
| 1 | `GET /patients/duplicates` | Suggest duplicate candidates (mobile exact = high; name trgm + DOB/gender = possible) | `view_patient` |
| 2 | `POST /merge-requests` | Staff **request** a merge (status `PENDING`) | `request_merge` |
| 3 | `GET /merge-requests` | List requests; admin queue via `?status=pending` | `merge_records` (admin) / requester |
| 4 | `GET /merge-requests/{id}` | Get a merge request | `merge_records` / requester |
| 5 | `POST /merge-requests/{id}/approve` | Admin approves → executes merge in one transaction | `merge_records` |
| 6 | `POST /merge-requests/{id}/reject` | Admin rejects with `decision_remarks` | `merge_records` |
| 7 | `POST /merge-requests/{id}/cancel` | Requester cancels a pending request | `request_merge` (own) |

- **Merge execution (on approve, UC-19):** reassign `visits`/`documents`/`follow_ups` to the primary, set duplicate `status='MERGED'` + `merged_into`, copy old OP into `patient_aliases` (`source='MERGE'`), stamp `merged_at`, write full before/after audit. **Never** physical delete; irreversible via normal UI.
- **Errors:** `422 MERGE_SAME_PATIENT` (primary == duplicate), `409 MERGE_INVALID_STATE` (request not `PENDING`).

---

### 7.12 Module: Dashboard (`Dashboard`)
**Tier:** Full-Scope (basic) · **Permission:** authenticated (role-filtered) · **Tables:** aggregates

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /dashboard/summary` | Role-filtered snapshot: recent registrations, today's visits, pending/upcoming follow-ups, recent uploads, patient count by OP category (UC-22) |

- **Success `200`:** `DashboardSummary` — counts + small recent lists. Doctors see their clinical follow-ups; receptionists see operational follow-ups; admins see overall stats (SAD §17).

---

### 7.13 Module: Reports & Export (`Reports`)
**Tier:** Full-Scope · **Permission:** `view_reports` / `export` · **Tables:** SQL views + `audit_log`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /reports/{type}` | Operational report by type with **mandatory** date range: `registration`, `visit`, `follow_up`, `op_category`, `document_upload` (UC-24) |
| 2 | `POST /patients/{patient_id}/export` | Export a patient record (CSV/Excel; PDF optional); **audited** |

- **`GET /reports/{type}`** query: `from` (required), `to` (required), plus optional `op_category`, `doctor_id`, `status`, `format` (`json`|`csv`|`xlsx`). JSON returns aggregated rows; `csv`/`xlsx` returns a file stream with generated-by/date metadata.
- **Errors:** `422 VALIDATION_ERROR` (missing/invalid date range), `404 RESOURCE_NOT_FOUND` (unknown report type).
- Exports of patient-level data are audited (`action=EXPORT`).

---

### 7.14 Module: Audit Trail (`Audit`)
**Tier:** MVP · **Permission:** `view_audit` (Admin read-only) · **Tables:** `audit_log`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /audit-logs` | Filterable, paginated audit trail (admin). Filters: `user_id`, `patient_id`, `action`, `entity_type`, `entity_id`, `from`, `to` |
| 2 | `GET /audit-logs/{id}` | Get a single audit entry (with old/new JSON) |

- Append-only; **no** create/update/delete endpoints. `GET` only.

---

### 7.15 Module: Backup & Recovery (`Backup`)
**Tier:** MVP · **Permission:** `backup_control` (Admin) · **Tables:** `backup_log`

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /backup/status` | Latest/last-N backup runs + outcomes (UC-26) |

- **Success `200`:** `Paginated<BackupLogEntry>` or `{ latest: BackupLogEntry, history: [...] }`.
- **Note:** Backups run via cron/ops scripts and **restore is performed out-of-band** by authorized technical personnel — there is **no** restore API endpoint (SAD §7.14, Plan §13).

---

### 7.16 Module: System / Health (`System`)
**Tier:** MVP · **Permission:** Public (no auth) · **Tables:** none

| # | Method & Path | Purpose |
|---|---------------|---------|
| 1 | `GET /health` | Liveness probe |
| 2 | `GET /ready` | Readiness probe (DB + object-storage connectivity) → `503 SERVICE_UNAVAILABLE` if a dependency is down |

> **Assumption:** Health endpoints are exposed at the service root rather than under `/api/v1` in many FastAPI setups; this spec documents them under the versioned prefix for a single consistent server base. Either placement is acceptable operationally.

---

## 8. Data Schemas

This section summarizes the DTOs; the complete JSON Schema definitions are in **Section 11 (`components/schemas`)**. All field names are `snake_case`. Schemas are designed for reuse: `*CreateRequest` / `*UpdateRequest` for input, the bare entity name for output, and shared `Error*`/`Paginated*` envelopes.

### 8.1 Common / shared DTOs

| Schema | Fields |
|--------|--------|
| `ErrorResponse` | `error: { code: string, message: string, details: ValidationErrorItem[], request_id: string }` |
| `ValidationErrorItem` | `field: string, code: string, message: string` |
| `PaginationMeta` | `total: int, page: int, page_size: int` |
| `Paginated<T>` | `items: T[], total, page, page_size` |
| `AuditStamp` (embedded) | `created_at, created_by, updated_at, updated_by, version` |

### 8.2 Request DTOs (selected)

| Schema | Required fields | Notes |
|--------|-----------------|-------|
| `LoginRequest` | `username`, `password` | |
| `UserCreateRequest` | `username`, `full_name`, `password`, `role_codes[]` | `email`, `mobile`, `is_doctor` optional |
| `UserUpdateRequest` | `version` | partial fields + `role_codes[]`; `version` for optimistic lock |
| `UserStatusUpdateRequest` | `status`, `version` | `status ∈ {ACTIVE, DISABLED, LOCKED}` |
| `PasswordResetRequest` | `new_password` | clears lockout, stamps `password_changed_at` |
| `MasterDataCreateRequest` | `code`, `label` | `sort_order`, `is_active` optional; `type` from path |
| `MasterDataUpdateRequest` | — | `label`, `sort_order`, `is_active` |
| `OpSequenceUpdateRequest` | — | `prefix`, `padding_width`, `reset_policy`, `is_active` |
| `PatientCreateRequest` | `full_name`, `op_category_code` + **≥1 of** `mobile`/`email`/`date_of_birth`/`age_years` | `op_number` NOT accepted |
| `PatientUpdateRequest` | `version` | demographics; `op_number` immutable |
| `VisitCreateRequest` | `visit_date`, `visit_type_code` | `consultation_category`, `doctor_id`, `is_scheduled`, `reason` |
| `VisitUpdateRequest` | `version` | `status`, `doctor_id`, `reason` |
| `CaseSheetUpsertRequest` | — (`version` if updating) | all clinical free-text fields |
| `ConsultationNoteCreateRequest` | — | `doctor_id`, complaints, diagnosis, advice, `review_date` |
| `PrescriptionCreateRequest` | — | `items[]: PrescriptionItem`, free-text fallback |
| `DischargeSummaryCreateRequest` | — | dates validated `discharge ≥ admission` |
| `DischargeSummaryUpdateRequest` | `version` | blocked if finalized |
| `DocumentUploadRequest` (multipart) | `file`, `document_type_code` | `visit_id`, `title`, `document_date`, `is_historical`, `remarks` |
| `FollowUpCreateRequest` | `follow_up_date` | `visit_id`, `reason`, `assigned_to`, `status_code` |
| `FollowUpUpdateRequest` | `version` | `status_code`, `remarks`, `follow_up_date`, `assigned_to` |
| `MergeRequestCreateRequest` | `primary_patient_id`, `duplicate_patient_id` | `reason`; primary ≠ duplicate |
| `MergeDecisionRequest` | — | `decision_remarks` |

### 8.3 Response DTOs (selected)

`TokenResponse`, `UserProfile`, `User`, `Role`, `MasterDataItem`, `OpSequence`, `Patient`, `PatientSearchResult`, `PatientTimeline`, `PatientAlias`, `Visit`, `CaseSheet`, `ConsultationNote`, `Prescription`, `PrescriptionItem`, `DischargeSummary`, `Document`, `FollowUp`, `MergeRequest`, `DashboardSummary`, `ReportResult`, `AuditLogEntry`, `BackupLogEntry`. Full field lists in §11.

### 8.4 Common DTOs reused across modules
`Paginated<T>`, `ErrorResponse`, `ValidationErrorItem`, `MasterDataItem` (used by visit/document/follow-up forms), `UserSummary` (embedded in audit, visits via `doctor_id`, follow-ups via `assigned_to`).

### 8.5 Enum definitions (from DDL CHECK constraints + seed data)

| Enum | Values | Source |
|------|--------|--------|
| `RoleCode` | `ADMIN`, `DOCTOR`, `RECEPTION`, `DATA_ENTRY` | `roles` seed |
| `UserStatus` | `ACTIVE`, `DISABLED`, `LOCKED` | `users.status` |
| `PatientStatus` | `ACTIVE`, `INACTIVE`, `MERGED` | `patients.status` |
| `PatientAliasSource` | `MERGE`, `HISTORICAL`, `CORRECTION` | `patient_aliases.source` |
| `MergeRequestStatus` | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED` | `merge_requests.status` |
| `VisitStatus` | `OPEN`, `COMPLETED`, `CANCELLED` | `visits.status` |
| `ApplicationRoute` | `INTERNAL`, `EXTERNAL` | `prescription_items.application_route` |
| `DocumentStatus` | `ACTIVE`, `ARCHIVED`, `DELETED` | `documents.status` |
| `MasterDataType` | `consultation_category`, `document_type`, `visit_type`, `follow_up_status`, `blood_group`, `dietary_preference`, `marital_status`, `gender`, `condition_at_discharge` | `master_data.type` |
| `OpResetPolicy` | `NEVER`, `YEARLY` | `op_sequence.reset_policy` |
| `BackupType` | `DATABASE`, `DOCUMENTS`, `FULL` | `backup_log.backup_type` |
| `BackupStatus` | `STARTED`, `SUCCESS`, `FAILED` | `backup_log.status` |
| `AuditAction` | `LOGIN`, `VIEW`, `CREATE`, `UPDATE`, `UPLOAD`, `EXPORT`, `MERGE` (+ others) | `audit_log.action` |
| `FollowUpStatusCode` | `PENDING`, `CONTACTED`, `COMPLETED`, `RESCHEDULED`, `NOT_REACHABLE` | `master_data` seed (`follow_up_status`) |
| `ConsultationCategoryCode` | `REGULAR`, `VILLAGE`, `CAMP` | `master_data` seed |
| `VisitTypeCode` | `NEW`, `REVIEW`, `ONLINE`, `INPERSON`, `CAMP` | `master_data` seed |
| `DocumentTypeCode` | `LAB_REPORT`, `PHOTOGRAPH`, `INVESTIGATION`, `CASE_SHEET`, `PRESCRIPTION`, `DISCHARGE_SUMMARY`, `OTHER` | `master_data` seed |
| `BloodGroupCode` | `A_POS`, `A_NEG`, `B_POS`, `B_NEG`, `AB_POS`, `AB_NEG`, `O_POS`, `O_NEG` | `master_data` seed |
| `DietaryPreferenceCode` | `VEG`, `NONVEG`, `VEGAN`, `EGGETARIAN` | `master_data` seed |
| `MaritalStatusCode` | `SINGLE`, `MARRIED`, `DIVORCED`, `WIDOWED` | `master_data` seed |
| `GenderCode` | `MALE`, `FEMALE`, `OTHER` | `master_data` seed |
| `ConditionAtDischargeCode` | `IMPROVED`, `STABLE`, `UNCHANGED`, `REFERRED`, `LAMA` | `master_data` seed |

> **Note:** Lookup *codes* (follow-up status, visit type, etc.) are stored as `master_data` rows, not DB enum types — so they are extensible at runtime by an Administrator. The values above are the seeded defaults; clients should fetch live values from `GET /master-data/{type}` rather than hard-coding them. Hard enums (status/route columns) are DB CHECK-constrained and fixed.

### 8.6 Validation rules (enforced at API boundary; mirrors DB CHECKs)
- **Patient minimum identity:** `full_name` + at least one of `mobile`/`email`/`date_of_birth`/`age_years` (UC-03 BR4).
- **Age:** `age_years ∈ [0,150]`; `height_cm > 0`; `weight_kg > 0` when present.
- **Visit date:** `visit_date ≤ today` unless `is_scheduled=true` (UC-08 BR4).
- **Discharge dates:** `discharge_date ≥ admission_date` (UC-13 BR2).
- **File upload:** content-type ∈ {pdf, jpeg, png}; size ≤ limit (Assumption 10 MB); extension + sniff check.
- **Lookup codes:** every `*_code` must exist (and be active for new records) in the corresponding `master_data` type.
- **Merge:** `primary_patient_id ≠ duplicate_patient_id`.
- **Optimistic concurrency:** `version` must match the stored row on `PUT`; mismatch → `409 VERSION_CONFLICT`.
- **Pagination:** `page ≥ 1`, `1 ≤ page_size ≤ 100`.

---

## 9. Integration APIs

Per **SAD §15** and **Plan §11**, **Phase 1 has no external system integrations** (ABDM/ABHA, lab, pharmacy explicitly deferred). The "integration-like" surfaces are internal:

### 9.1 External system APIs
**None in Phase 1.** Adapter-layer, OAuth2/API-key secrets, retry/backoff/idempotency patterns are documented in SAD §15 as future-readiness only — no endpoints are exposed now.

### 9.2 Callback / webhook APIs
**None in Phase 1.** No inbound webhooks; no event subscriptions exposed externally.

### 9.3 Background job APIs
- **Backup jobs** run via **cron / ops scripts** (not an API trigger). Their outcomes are surfaced read-only via `GET /backup/status` (§7.15) and recorded in `backup_log`.
- **Restore** is an out-of-band operations procedure (no API).
- **Assumption:** if a manual backup trigger is later desired, it would be `POST /backup/run` (Admin, `backup_control`) writing a `backup_log` row with `triggered_by` — **documented as a candidate, not part of the Phase 1 contract.**

### 9.4 Event-driven APIs
**None in Phase 1** (no Kafka/broker; SAD §2.7). Optional async jobs (PDF generation, future OCR) use in-process FastAPI background tasks or Redis RQ internally and expose no public event API.

### 9.5 Internal integration surfaces (within the API/app)
- **Object storage (MinIO/S3):** consumed internally by the Documents module; surfaced to clients only via the proxied download (`GET /documents/{id}/content`) or short-lived pre-signed URL (`GET /documents/{id}/download-url`). Object-storage credentials/URLs are never exposed to clients.
- **SMTP (optional):** backup success/failure alert email to the Administrator — internal, no API.
- **Bulk historical import (Full-Scope, UC-16):** an internal admin batch utility for migrated records (`is_historical=TRUE`, old OP numbers preserved as aliases).
  - **Assumption (candidate endpoints, Full-Scope):** `POST /admin/historical-imports` (multipart CSV/Excel upload → `202 Accepted` with a job id) and `GET /admin/historical-imports/{job_id}` (status). Admin/`DATA_ENTRY` only, audited. Marked as a candidate because the plan describes it as an internal tool rather than a committed API.

---

## 10. Security Considerations

| Area | Approach (SAD §10 / Plan §8–§10) |
|------|----------------------------------|
| **Input validation** | Pydantic v2 strict schemas at every boundary; reject unknown fields; parameterized SQLAlchemy queries only (no string SQL) — OWASP injection defense. |
| **Authentication** | JWT access+refresh, argon2/bcrypt hashing, active-only login, failed-attempt lockout, no username enumeration. |
| **Authorization** | Deny-by-default central RBAC dependency; per-endpoint + per-record checks; field-level visibility filtering for limited roles. |
| **Rate limiting** | Optional Redis-backed throttling, primarily on `POST /auth/login`; `429 RATE_LIMITED` with `Retry-After`. |
| **CORS** | Locked to the SPA origin only (per environment); no wildcard in non-dev (SAD §10). |
| **Audit logging** | All sensitive actions (login, view profile, create/update clinical, upload, export, merge, user/master-data change, backup) write append-only `audit_log` with `request_id`, role snapshot, old/new JSON, IP, user agent. Admin-read-only via `GET /audit-logs`. |
| **Sensitive data masking** | Search results return masked mobile and no clinical data; non-audit application logs are PII/PHI-redacted (allow-listed fields only, route templates not resolved IDs, no request/response bodies on clinical endpoints, search terms not logged in plaintext — SAD §10.1); `error.code`-based generic messages avoid leaking internals. |
| **Document security** | No public URLs; permission-checked proxy/pre-signed download; type/size allow-list; stored outside web root in object storage; optional AV scan; access audited. |
| **Transport / at rest** | TLS 1.2+ at reverse proxy; DB volume + object-store encryption at rest. |
| **API versioning** | URL prefix `/api/v1`; backward-incompatible changes go to a new version path. |
| **Access control rules** | See §2.5. Disabled/locked accounts blocked even with a valid token; OP-number correction and merges are Admin-only and audited; follow-ups/clinical records are never hard-deleted. |
| **Concurrency safety** | Optimistic `version` checks (`409 VERSION_CONFLICT`); row-locked `op_sequence` guarantees unique OP numbers under concurrency (UC-29). |
| **Secrets** | Env vars / Docker secrets; never in code or client; object-store creds server-side only. |
| **OWASP Top 10** | Explicitly targeted: injection, broken auth, broken access control, sensitive-data exposure, security misconfiguration (Plan §8). |

---

## 11. OpenAPI YAML

The following is the OpenAPI **3.1.0** contract. It is syntactically valid and covers `info`, `servers`, `securitySchemes`, `tags`, `paths`, and reusable `components` (`schemas`, `responses`, `parameters`, `securitySchemes`). Representative endpoints from every module are fully specified; repetitive CRUD siblings reuse the shared components and parameters.

```yaml
openapi: 3.1.0
info:
  title: ArogyaM Patient Management System API
  description: >
    REST API for the ArogyaM PMS Phase 1 (internal operational system).
    Covers authentication & RBAC, patient registration with transaction-safe OP
    numbering, search, profile & timeline, visits/case sheets/consultation notes,
    prescriptions, discharge summaries, documents, follow-ups, duplicate merge
    workflow, dashboard, reports/export, audit trail, master data, and backup status.
    Consumed by the internal React SPA. No public/external consumers in Phase 1.
  version: "1.0.0"
  contact:
    name: ArogyaM Engineering
  license:
    name: Proprietary

servers:
  - url: https://dev.arogyam.local/api/v1
    description: Development
  - url: https://qa.arogyam.local/api/v1
    description: QA / Test
  - url: https://uat.arogyam.example.com/api/v1
    description: UAT
  - url: https://pms.arogyam.example.com/api/v1
    description: Production

security:
  - bearerAuth: []

tags:
  - name: Auth
    description: Login, token refresh, logout, current-user context.
  - name: Users
    description: User management (Admin) and role listing.
  - name: MasterData
    description: Configurable lookup values and OP-number sequences.
  - name: Patients
    description: Patient registration, profile, timeline, aliases.
  - name: Search
    description: Patient search & retrieval (minimal identifiers).
  - name: Visits
    description: Visits, case sheets, consultation notes.
  - name: Clinical
    description: Prescriptions and discharge summaries.
  - name: Documents
    description: Document upload, metadata, secure download.
  - name: FollowUps
    description: Follow-up task tracking.
  - name: Duplicates
    description: Duplicate detection and the merge-request workflow.
  - name: Dashboard
    description: Role-filtered operational summary.
  - name: Reports
    description: Operational reports and exports.
  - name: Audit
    description: Append-only audit trail (Admin read-only).
  - name: Backup
    description: Backup run status (Admin).
  - name: System
    description: Health and readiness probes.

paths:

  /auth/login:
    post:
      tags: [Auth]
      summary: Authenticate and obtain tokens
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/LoginRequest' }
      responses:
        '200':
          description: Authentication successful
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TokenResponse' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '422': { $ref: '#/components/responses/ValidationError' }
        '429': { $ref: '#/components/responses/RateLimited' }

  /auth/refresh:
    post:
      tags: [Auth]
      summary: Refresh access token
      security: []
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/RefreshRequest' }
      responses:
        '200':
          description: New tokens issued
          content:
            application/json:
              schema: { $ref: '#/components/schemas/TokenResponse' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /auth/logout:
    post:
      tags: [Auth]
      summary: Revoke the current token
      responses:
        '204': { description: Logged out }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /me:
    get:
      tags: [Auth]
      summary: Get the current user's profile
      responses:
        '200':
          description: Current user
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserProfile' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /me/permissions:
    get:
      tags: [Auth]
      summary: Get the current user's effective permissions
      responses:
        '200':
          description: Effective permissions and roles
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PermissionSet' }
        '401': { $ref: '#/components/responses/Unauthorized' }

  /users:
    get:
      tags: [Users]
      summary: List users (Admin); doctor picker via is_doctor=true
      parameters:
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
        - { $ref: '#/components/parameters/Sort' }
        - { $ref: '#/components/parameters/Order' }
        - name: is_doctor
          in: query
          schema: { type: boolean }
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/UserStatus' }
        - name: q
          in: query
          schema: { type: string }
      responses:
        '200':
          description: Paginated users
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedUsers' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      tags: [Users]
      summary: Create a user (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UserCreateRequest' }
      responses:
        '201':
          description: User created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /users/{user_id}:
    parameters:
      - { $ref: '#/components/parameters/UserId' }
    get:
      tags: [Users]
      summary: Get a user (Admin)
      responses:
        '200':
          description: User
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      tags: [Users]
      summary: Update a user (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UserUpdateRequest' }
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /users/{user_id}/status:
    parameters:
      - { $ref: '#/components/parameters/UserId' }
    put:
      tags: [Users]
      summary: Enable/disable a user (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UserStatusUpdateRequest' }
      responses:
        '200':
          description: Updated user
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
        '409': { $ref: '#/components/responses/Conflict' }

  /users/{user_id}/reset-password:
    parameters:
      - { $ref: '#/components/parameters/UserId' }
    post:
      tags: [Users]
      summary: Reset a user's password (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PasswordResetRequest' }
      responses:
        '204': { description: Password reset }
        '404': { $ref: '#/components/responses/NotFound' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /roles:
    get:
      tags: [Users]
      summary: List RBAC roles
      responses:
        '200':
          description: Roles
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Role' }

  /master-data/{type}:
    parameters:
      - { $ref: '#/components/parameters/MasterDataType' }
    get:
      tags: [MasterData]
      summary: List lookup values for a type
      parameters:
        - name: active
          in: query
          schema: { type: boolean }
      responses:
        '200':
          description: Lookup values
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/MasterDataItem' }
        '404': { $ref: '#/components/responses/NotFound' }
    post:
      tags: [MasterData]
      summary: Add a lookup value (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MasterDataCreateRequest' }
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MasterDataItem' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  /master-data/{type}/{id}:
    parameters:
      - { $ref: '#/components/parameters/MasterDataType' }
      - name: id
        in: path
        required: true
        schema: { type: integer }
    put:
      tags: [MasterData]
      summary: Update/deactivate a lookup value (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MasterDataUpdateRequest' }
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MasterDataItem' }
        '404': { $ref: '#/components/responses/NotFound' }

  /op-sequences:
    get:
      tags: [MasterData]
      summary: List OP-number sequences (Admin)
      responses:
        '200':
          description: OP sequences
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/OpSequence' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /op-sequences/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer }
    put:
      tags: [MasterData]
      summary: Update an OP sequence (Admin, audited)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/OpSequenceUpdateRequest' }
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/OpSequence' }
        '404': { $ref: '#/components/responses/NotFound' }

  /patients:
    post:
      tags: [Patients]
      summary: Register a patient (server-generated OP number)
      parameters:
        - name: confirm_create
          in: query
          description: Set true to proceed despite a duplicate suspicion.
          schema: { type: boolean, default: false }
        - { $ref: '#/components/parameters/IdempotencyKey' }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PatientCreateRequest' }
      responses:
        '201':
          description: Patient registered
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Patient' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409':
          description: Duplicate patient suspected (resubmit with confirm_create=true)
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ErrorResponse' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /patients/{patient_id}:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [Patients]
      summary: Get a patient profile (role-filtered; access audited)
      responses:
        '200':
          description: Patient
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Patient' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      tags: [Patients]
      summary: Update patient demographics (version-checked)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PatientUpdateRequest' }
      responses:
        '200':
          description: Updated patient
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Patient' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /patients/{patient_id}/timeline:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [Patients]
      summary: Get the patient's chronological timeline
      responses:
        '200':
          description: Timeline
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PatientTimeline' }
        '404': { $ref: '#/components/responses/NotFound' }

  /patients/{patient_id}/aliases:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [Patients]
      summary: List old/legacy OP numbers for a patient
      responses:
        '200':
          description: Aliases
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/PatientAlias' }

  /patients/{patient_id}/op-correction:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    post:
      tags: [Patients]
      summary: Controlled OP-number correction (Admin) — candidate/Assumption
      description: >
        Admin-only. Updates patients.op_number, retains the previous number as a
        patient_aliases row (source=CORRECTION), and audits old/new. Specified as a
        candidate pending confirmation of OP-format/correction rules (SAD §27 #13).
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/OpCorrectionRequest' }
      responses:
        '200':
          description: OP number corrected
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Patient' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /patients/search:
    get:
      tags: [Search]
      summary: Search patients (minimal identifiers only)
      parameters:
        - { name: q, in: query, schema: { type: string } }
        - { name: op_number, in: query, schema: { type: string } }
        - { name: mobile, in: query, schema: { type: string } }
        - { name: name, in: query, schema: { type: string } }
        - { name: op_category, in: query, schema: { type: string } }
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/PatientStatus' }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
        - { $ref: '#/components/parameters/Sort' }
        - { $ref: '#/components/parameters/Order' }
      responses:
        '200':
          description: Paginated search results
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedPatientSearch' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /patients/duplicates:
    get:
      tags: [Duplicates]
      summary: Suggest duplicate-patient candidates
      parameters:
        - { name: patient_id, in: query, schema: { type: string, format: uuid } }
        - { name: mobile, in: query, schema: { type: string } }
        - { name: name, in: query, schema: { type: string } }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Duplicate candidates with confidence
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/DuplicateCandidate' }

  /patients/{patient_id}/visits:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [Visits]
      summary: List a patient's visits
      parameters:
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Paginated visits
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedVisits' }
    post:
      tags: [Visits]
      summary: Create a visit
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/VisitCreateRequest' }
      responses:
        '201':
          description: Visit created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Visit' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /visits/{visit_id}:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Visits]
      summary: Get a visit
      responses:
        '200':
          description: Visit
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Visit' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      tags: [Visits]
      summary: Update a visit (version-checked)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/VisitUpdateRequest' }
      responses:
        '200':
          description: Updated visit
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Visit' }
        '409': { $ref: '#/components/responses/Conflict' }

  /visits/{visit_id}/case-sheet:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Visits]
      summary: Get the visit's case sheet
      responses:
        '200':
          description: Case sheet
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CaseSheet' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      tags: [Visits]
      summary: Create or update the case sheet (one per visit)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CaseSheetUpsertRequest' }
      responses:
        '200':
          description: Saved case sheet
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CaseSheet' }
        '409': { $ref: '#/components/responses/Conflict' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /visits/{visit_id}/consultation-notes:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Visits]
      summary: List consultation notes for a visit
      responses:
        '200':
          description: Consultation notes
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/ConsultationNote' }
        '403': { $ref: '#/components/responses/Forbidden' }
    post:
      tags: [Visits]
      summary: Add a consultation note
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/ConsultationNoteCreateRequest' }
      responses:
        '201':
          description: Note created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ConsultationNote' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /visits/{visit_id}/prescriptions:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Clinical]
      summary: List prescriptions for a visit
      responses:
        '200':
          description: Prescriptions
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/Prescription' }
    post:
      tags: [Clinical]
      summary: Create a prescription with structured items
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PrescriptionCreateRequest' }
      responses:
        '201':
          description: Prescription created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Prescription' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /prescriptions/{prescription_id}:
    parameters:
      - name: prescription_id
        in: path
        required: true
        schema: { type: string, format: uuid }
    get:
      tags: [Clinical]
      summary: Get a prescription with its items
      responses:
        '200':
          description: Prescription
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Prescription' }
        '404': { $ref: '#/components/responses/NotFound' }

  /visits/{visit_id}/discharge-summary:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Clinical]
      summary: Get the visit's current effective discharge summary
      description: >
        Returns the latest non-superseded row in the amendment chain. 404 only when
        the visit has no discharge summary at all.
      responses:
        '200':
          description: Current effective discharge summary
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DischargeSummary' }
        '404': { $ref: '#/components/responses/NotFound' }
    post:
      tags: [Clinical]
      summary: Create a draft discharge summary
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DischargeSummaryCreateRequest' }
      responses:
        '201':
          description: Draft created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DischargeSummary' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /visits/{visit_id}/discharge-summary/history:
    parameters:
      - { $ref: '#/components/parameters/VisitId' }
    get:
      tags: [Clinical]
      summary: List all discharge-summary versions for the visit (newest first)
      responses:
        '200':
          description: Original plus amendment chain
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/DischargeSummary' }
        '404': { $ref: '#/components/responses/NotFound' }

  /discharge-summaries/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string, format: uuid }
    put:
      tags: [Clinical]
      summary: Update a draft discharge summary (blocked if finalized)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DischargeSummaryUpdateRequest' }
      responses:
        '200':
          description: Updated
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DischargeSummary' }
        '409':
          description: Already finalized or version conflict
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ErrorResponse' }

  /discharge-summaries/{id}/finalize:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string, format: uuid }
    put:
      tags: [Clinical]
      summary: Finalize a discharge summary (becomes immutable)
      responses:
        '200':
          description: Finalized
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DischargeSummary' }
        '409': { $ref: '#/components/responses/Conflict' }

  /discharge-summaries/{id}/amend:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: string, format: uuid }
    post:
      tags: [Clinical]
      summary: Create an audited amendment of a finalized summary
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DischargeSummaryCreateRequest' }
      responses:
        '201':
          description: Amendment created (linked via amends_id)
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DischargeSummary' }

  /patients/{patient_id}/documents:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [Documents]
      summary: List a patient's documents
      parameters:
        - { name: document_type, in: query, schema: { type: string } }
        - { name: visit_id, in: query, schema: { type: string, format: uuid } }
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/DocumentStatus' }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Paginated documents
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedDocuments' }
    post:
      tags: [Documents]
      summary: Upload a document (multipart)
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema: { $ref: '#/components/schemas/DocumentUploadRequest' }
      responses:
        '201':
          description: Document uploaded
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Document' }
        '413': { $ref: '#/components/responses/PayloadTooLarge' }
        '415': { $ref: '#/components/responses/UnsupportedMediaType' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /documents/{document_id}:
    parameters:
      - { $ref: '#/components/parameters/DocumentId' }
    get:
      tags: [Documents]
      summary: Get document metadata
      responses:
        '200':
          description: Document metadata
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Document' }
        '404': { $ref: '#/components/responses/NotFound' }
    put:
      tags: [Documents]
      summary: Update document metadata or soft-delete
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/DocumentUpdateRequest' }
      responses:
        '200':
          description: Updated document
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Document' }

  /documents/{document_id}/content:
    parameters:
      - { $ref: '#/components/parameters/DocumentId' }
    get:
      tags: [Documents]
      summary: Stream the document binary (permission-checked proxy; access audited)
      responses:
        '200':
          description: Binary stream
          content:
            application/pdf:
              schema: { type: string, format: binary }
            image/jpeg:
              schema: { type: string, format: binary }
            image/png:
              schema: { type: string, format: binary }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /documents/{document_id}/download-url:
    parameters:
      - { $ref: '#/components/parameters/DocumentId' }
    get:
      tags: [Documents]
      summary: Get a short-lived pre-signed download URL
      responses:
        '200':
          description: Pre-signed URL
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PresignedUrlResponse' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /patients/{patient_id}/follow-ups:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    get:
      tags: [FollowUps]
      summary: List a patient's follow-ups
      responses:
        '200':
          description: Follow-ups
          content:
            application/json:
              schema:
                type: array
                items: { $ref: '#/components/schemas/FollowUp' }
    post:
      tags: [FollowUps]
      summary: Create a follow-up
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FollowUpCreateRequest' }
      responses:
        '201':
          description: Follow-up created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FollowUp' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /follow-ups:
    get:
      tags: [FollowUps]
      summary: List/queue follow-ups (register & dashboard)
      parameters:
        - name: status
          in: query
          schema: { type: string }
        - { name: from, in: query, schema: { type: string, format: date } }
        - { name: to, in: query, schema: { type: string, format: date } }
        - { name: assigned_to, in: query, schema: { type: string, format: uuid } }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Paginated follow-ups
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedFollowUps' }

  /follow-ups/{follow_up_id}:
    parameters:
      - name: follow_up_id
        in: path
        required: true
        schema: { type: string, format: uuid }
    put:
      tags: [FollowUps]
      summary: Update a follow-up (status/remarks; version-checked)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/FollowUpUpdateRequest' }
      responses:
        '200':
          description: Updated follow-up
          content:
            application/json:
              schema: { $ref: '#/components/schemas/FollowUp' }
        '409': { $ref: '#/components/responses/Conflict' }

  /merge-requests:
    get:
      tags: [Duplicates]
      summary: List merge requests (admin queue via status=pending)
      parameters:
        - name: status
          in: query
          schema: { $ref: '#/components/schemas/MergeRequestStatus' }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Paginated merge requests
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedMergeRequests' }
    post:
      tags: [Duplicates]
      summary: Request a merge (staff)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MergeRequestCreateRequest' }
      responses:
        '201':
          description: Merge request created
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MergeRequest' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /merge-requests/{id}:
    parameters:
      - { $ref: '#/components/parameters/MergeRequestId' }
    get:
      tags: [Duplicates]
      summary: Get a merge request
      responses:
        '200':
          description: Merge request
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MergeRequest' }
        '404': { $ref: '#/components/responses/NotFound' }

  /merge-requests/{id}/approve:
    parameters:
      - { $ref: '#/components/parameters/MergeRequestId' }
    post:
      tags: [Duplicates]
      summary: Approve and execute a merge (Admin)
      requestBody:
        required: false
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MergeDecisionRequest' }
      responses:
        '200':
          description: Merge executed
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MergeRequest' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '409': { $ref: '#/components/responses/Conflict' }

  /merge-requests/{id}/reject:
    parameters:
      - { $ref: '#/components/parameters/MergeRequestId' }
    post:
      tags: [Duplicates]
      summary: Reject a merge request (Admin)
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/MergeDecisionRequest' }
      responses:
        '200':
          description: Rejected
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MergeRequest' }
        '409': { $ref: '#/components/responses/Conflict' }

  /merge-requests/{id}/cancel:
    parameters:
      - { $ref: '#/components/parameters/MergeRequestId' }
    post:
      tags: [Duplicates]
      summary: Cancel a pending merge request (requester)
      responses:
        '200':
          description: Cancelled
          content:
            application/json:
              schema: { $ref: '#/components/schemas/MergeRequest' }
        '409': { $ref: '#/components/responses/Conflict' }

  /dashboard/summary:
    get:
      tags: [Dashboard]
      summary: Role-filtered operational summary
      responses:
        '200':
          description: Dashboard summary
          content:
            application/json:
              schema: { $ref: '#/components/schemas/DashboardSummary' }

  /reports/{type}:
    parameters:
      - name: type
        in: path
        required: true
        schema:
          type: string
          enum: [registration, visit, follow_up, op_category, document_upload]
    get:
      tags: [Reports]
      summary: Operational report with mandatory date range
      parameters:
        - { name: from, in: query, required: true, schema: { type: string, format: date } }
        - { name: to, in: query, required: true, schema: { type: string, format: date } }
        - { name: op_category, in: query, schema: { type: string } }
        - { name: doctor_id, in: query, schema: { type: string, format: uuid } }
        - { name: status, in: query, schema: { type: string } }
        - name: format
          in: query
          schema: { type: string, enum: [json, csv, xlsx], default: json }
      responses:
        '200':
          description: Report (JSON or file stream)
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ReportResult' }
            text/csv:
              schema: { type: string, format: binary }
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
              schema: { type: string, format: binary }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '422': { $ref: '#/components/responses/ValidationError' }

  /patients/{patient_id}/export:
    parameters:
      - { $ref: '#/components/parameters/PatientId' }
    post:
      tags: [Reports]
      summary: Export a patient record (audited)
      requestBody:
        required: false
        content:
          application/json:
            schema: { $ref: '#/components/schemas/PatientExportRequest' }
      responses:
        '200':
          description: Export file
          content:
            application/pdf:
              schema: { type: string, format: binary }
            text/csv:
              schema: { type: string, format: binary }
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
              schema: { type: string, format: binary }
        '403': { $ref: '#/components/responses/Forbidden' }

  /audit-logs:
    get:
      tags: [Audit]
      summary: List audit entries (Admin read-only)
      parameters:
        - { name: user_id, in: query, schema: { type: string, format: uuid } }
        - { name: patient_id, in: query, schema: { type: string, format: uuid } }
        - { name: action, in: query, schema: { type: string } }
        - { name: entity_type, in: query, schema: { type: string } }
        - { name: entity_id, in: query, schema: { type: string } }
        - { name: from, in: query, schema: { type: string, format: date-time } }
        - { name: to, in: query, schema: { type: string, format: date-time } }
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Paginated audit log
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedAuditLog' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /audit-logs/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema: { type: integer, format: int64 }
    get:
      tags: [Audit]
      summary: Get a single audit entry
      responses:
        '200':
          description: Audit entry
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuditLogEntry' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }

  /backup/status:
    get:
      tags: [Backup]
      summary: Backup run status (Admin)
      parameters:
        - { $ref: '#/components/parameters/Page' }
        - { $ref: '#/components/parameters/PageSize' }
      responses:
        '200':
          description: Backup history
          content:
            application/json:
              schema: { $ref: '#/components/schemas/PaginatedBackupLog' }
        '403': { $ref: '#/components/responses/Forbidden' }

  /health:
    get:
      tags: [System]
      summary: Liveness probe
      security: []
      responses:
        '200':
          description: Service is alive
          content:
            application/json:
              schema: { $ref: '#/components/schemas/HealthStatus' }

  /ready:
    get:
      tags: [System]
      summary: Readiness probe (DB + storage)
      security: []
      responses:
        '200':
          description: Ready
          content:
            application/json:
              schema: { $ref: '#/components/schemas/HealthStatus' }
        '503': { $ref: '#/components/responses/ServiceUnavailable' }

components:

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
      description: JWT access token issued by POST /auth/login.

  parameters:
    Page:
      name: page
      in: query
      schema: { type: integer, minimum: 1, default: 1 }
    PageSize:
      name: page_size
      in: query
      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
    Sort:
      name: sort
      in: query
      schema: { type: string }
    Order:
      name: order
      in: query
      schema: { type: string, enum: [asc, desc], default: desc }
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: false
      schema: { type: string }
    UserId:
      name: user_id
      in: path
      required: true
      schema: { type: string, format: uuid }
    PatientId:
      name: patient_id
      in: path
      required: true
      schema: { type: string, format: uuid }
    VisitId:
      name: visit_id
      in: path
      required: true
      schema: { type: string, format: uuid }
    DocumentId:
      name: document_id
      in: path
      required: true
      schema: { type: string, format: uuid }
    MergeRequestId:
      name: id
      in: path
      required: true
      schema: { type: string, format: uuid }
    MasterDataType:
      name: type
      in: path
      required: true
      schema:
        type: string
        enum:
          - consultation_category
          - document_type
          - visit_type
          - follow_up_status
          - blood_group
          - dietary_preference
          - marital_status
          - gender
          - condition_at_discharge

  responses:
    Unauthorized:
      description: Missing or invalid authentication
      headers:
        WWW-Authenticate:
          schema: { type: string }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    Forbidden:
      description: Authenticated but not permitted
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    Conflict:
      description: Version conflict, duplicate, or invalid state transition
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    ValidationError:
      description: Field validation failure
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    RateLimited:
      description: Too many requests
      headers:
        Retry-After:
          schema: { type: integer }
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    PayloadTooLarge:
      description: Upload exceeds the size limit
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    UnsupportedMediaType:
      description: File type not allowed
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }
    ServiceUnavailable:
      description: A dependency is not ready
      content:
        application/json:
          schema: { $ref: '#/components/schemas/ErrorResponse' }

  schemas:

    # ---- Common / shared ----
    ErrorResponse:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string, example: VALIDATION_ERROR }
            message: { type: string }
            details:
              type: array
              items: { $ref: '#/components/schemas/ValidationErrorItem' }
            request_id: { type: string }
    ValidationErrorItem:
      type: object
      properties:
        field: { type: string }
        code: { type: string }
        message: { type: string }
    PaginationMeta:
      type: object
      properties:
        total: { type: integer }
        page: { type: integer }
        page_size: { type: integer }

    # ---- Enums ----
    UserStatus: { type: string, enum: [ACTIVE, DISABLED, LOCKED] }
    PatientStatus: { type: string, enum: [ACTIVE, INACTIVE, MERGED] }
    PatientAliasSource: { type: string, enum: [MERGE, HISTORICAL, CORRECTION] }
    MergeRequestStatus: { type: string, enum: [PENDING, APPROVED, REJECTED, CANCELLED] }
    VisitStatus: { type: string, enum: [OPEN, COMPLETED, CANCELLED] }
    ApplicationRoute: { type: string, enum: [INTERNAL, EXTERNAL] }
    DocumentStatus: { type: string, enum: [ACTIVE, ARCHIVED, DELETED] }
    OpResetPolicy: { type: string, enum: [NEVER, YEARLY] }
    BackupType: { type: string, enum: [DATABASE, DOCUMENTS, FULL] }
    BackupStatus: { type: string, enum: [STARTED, SUCCESS, FAILED] }

    # ---- Auth ----
    LoginRequest:
      type: object
      required: [username, password]
      properties:
        username: { type: string }
        password: { type: string, format: password }
    RefreshRequest:
      type: object
      required: [refresh_token]
      properties:
        refresh_token: { type: string }
    TokenResponse:
      type: object
      properties:
        access_token: { type: string }
        refresh_token: { type: string }
        token_type: { type: string, example: bearer }
        expires_in: { type: integer, example: 900 }
    PermissionSet:
      type: object
      properties:
        roles:
          type: array
          items: { type: string }
        permissions:
          type: array
          items: { type: string }
    UserProfile:
      type: object
      properties:
        id: { type: string, format: uuid }
        username: { type: string }
        full_name: { type: string }
        email: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        is_doctor: { type: boolean }
        roles:
          type: array
          items: { type: string }
        permissions:
          type: array
          items: { type: string }
        last_login_at: { type: string, format: date-time, nullable: true }

    # ---- Users / roles ----
    Role:
      type: object
      properties:
        id: { type: integer }
        code: { type: string }
        name: { type: string }
        description: { type: string, nullable: true }
        is_active: { type: boolean }
    User:
      type: object
      properties:
        id: { type: string, format: uuid }
        username: { type: string }
        full_name: { type: string }
        email: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        status: { $ref: '#/components/schemas/UserStatus' }
        is_doctor: { type: boolean }
        roles:
          type: array
          items: { type: string }
        last_login_at: { type: string, format: date-time, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    UserCreateRequest:
      type: object
      required: [username, full_name, password, role_codes]
      properties:
        username: { type: string }
        full_name: { type: string }
        email: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        password: { type: string, format: password }
        is_doctor: { type: boolean, default: false }
        role_codes:
          type: array
          items: { type: string }
    UserUpdateRequest:
      type: object
      required: [version]
      properties:
        full_name: { type: string }
        email: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        is_doctor: { type: boolean }
        role_codes:
          type: array
          items: { type: string }
        version: { type: integer }
    UserStatusUpdateRequest:
      type: object
      required: [status, version]
      properties:
        status: { $ref: '#/components/schemas/UserStatus' }
        version: { type: integer }
    PasswordResetRequest:
      type: object
      required: [new_password]
      properties:
        new_password: { type: string, format: password }
    PaginatedUsers:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/User' }

    # ---- Master data ----
    MasterDataItem:
      type: object
      properties:
        id: { type: integer }
        type: { type: string }
        code: { type: string }
        label: { type: string }
        sort_order: { type: integer }
        is_active: { type: boolean }
    MasterDataCreateRequest:
      type: object
      required: [code, label]
      properties:
        code: { type: string }
        label: { type: string }
        sort_order: { type: integer, default: 0 }
        is_active: { type: boolean, default: true }
    MasterDataUpdateRequest:
      type: object
      properties:
        label: { type: string }
        sort_order: { type: integer }
        is_active: { type: boolean }
    OpSequence:
      type: object
      properties:
        id: { type: integer }
        category_code: { type: string }
        prefix: { type: string }
        last_sequence: { type: integer, format: int64 }
        padding_width: { type: integer }
        number_format: { type: string }
        reset_policy: { $ref: '#/components/schemas/OpResetPolicy' }
        is_active: { type: boolean }
    OpSequenceUpdateRequest:
      type: object
      properties:
        prefix: { type: string }
        padding_width: { type: integer, minimum: 1, maximum: 12 }
        reset_policy: { $ref: '#/components/schemas/OpResetPolicy' }
        is_active: { type: boolean }

    # ---- Patient ----
    Patient:
      type: object
      properties:
        id: { type: string, format: uuid }
        op_number: { type: string }
        op_category_code: { type: string }
        full_name: { type: string }
        date_of_birth: { type: string, format: date, nullable: true }
        age_years: { type: integer, nullable: true }
        gender: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        email: { type: string, nullable: true }
        address_line: { type: string, nullable: true }
        city: { type: string, nullable: true }
        state: { type: string, nullable: true }
        pincode: { type: string, nullable: true }
        marital_status: { type: string, nullable: true }
        profession: { type: string, nullable: true }
        dietary_preference: { type: string, nullable: true }
        blood_group: { type: string, nullable: true }
        height_cm: { type: number, nullable: true }
        weight_kg: { type: number, nullable: true }
        status: { $ref: '#/components/schemas/PatientStatus' }
        merged_into: { type: string, format: uuid, nullable: true }
        is_historical: { type: boolean }
        registration_date: { type: string, format: date }
        remarks: { type: string, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    PatientCreateRequest:
      type: object
      required: [full_name, op_category_code]
      description: >
        Requires full_name plus at least one of mobile/email/date_of_birth/age_years
        (minimum-identity rule, UC-03 BR4). op_number is server-generated.
      properties:
        full_name: { type: string }
        op_category_code: { type: string }
        date_of_birth: { type: string, format: date, nullable: true }
        age_years: { type: integer, minimum: 0, maximum: 150, nullable: true }
        gender: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        email: { type: string, nullable: true }
        address_line: { type: string, nullable: true }
        city: { type: string, nullable: true }
        state: { type: string, nullable: true }
        pincode: { type: string, nullable: true }
        marital_status: { type: string, nullable: true }
        profession: { type: string, nullable: true }
        dietary_preference: { type: string, nullable: true }
        blood_group: { type: string, nullable: true }
        height_cm: { type: number, nullable: true }
        weight_kg: { type: number, nullable: true }
        is_historical: { type: boolean, default: false }
        remarks: { type: string, nullable: true }
    PatientUpdateRequest:
      type: object
      required: [version]
      properties:
        full_name: { type: string }
        date_of_birth: { type: string, format: date, nullable: true }
        age_years: { type: integer, nullable: true }
        gender: { type: string, nullable: true }
        mobile: { type: string, nullable: true }
        email: { type: string, nullable: true }
        address_line: { type: string, nullable: true }
        city: { type: string, nullable: true }
        state: { type: string, nullable: true }
        pincode: { type: string, nullable: true }
        marital_status: { type: string, nullable: true }
        profession: { type: string, nullable: true }
        dietary_preference: { type: string, nullable: true }
        blood_group: { type: string, nullable: true }
        height_cm: { type: number, nullable: true }
        weight_kg: { type: number, nullable: true }
        remarks: { type: string, nullable: true }
        version: { type: integer }
    OpCorrectionRequest:
      type: object
      required: [new_op_number, reason, version]
      description: >
        Candidate (Assumption) — Admin-only controlled OP-number correction.
        The previous number is retained as a patient_aliases row (source=CORRECTION).
      properties:
        new_op_number: { type: string }
        reason: { type: string }
        version: { type: integer }
    PatientSearchResult:
      type: object
      description: Minimal identifiers only — no clinical data (SAD §7.7).
      properties:
        id: { type: string, format: uuid }
        op_number: { type: string }
        full_name: { type: string }
        gender: { type: string, nullable: true }
        age_or_dob: { type: string, nullable: true }
        mobile_masked: { type: string, nullable: true }
        op_category_code: { type: string }
        status: { $ref: '#/components/schemas/PatientStatus' }
    PaginatedPatientSearch:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/PatientSearchResult' }
    PatientAlias:
      type: object
      properties:
        id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        old_op_number: { type: string }
        source: { $ref: '#/components/schemas/PatientAliasSource' }
        remarks: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
    PatientTimeline:
      type: object
      properties:
        patient_id: { type: string, format: uuid }
        events:
          type: array
          items:
            type: object
            properties:
              type:
                type: string
                enum: [VISIT, CASE_SHEET, CONSULTATION_NOTE, PRESCRIPTION, DISCHARGE_SUMMARY, DOCUMENT, FOLLOW_UP]
              occurred_on: { type: string, format: date }
              ref_id: { type: string, format: uuid }
              summary: { type: string }
    DuplicateCandidate:
      type: object
      properties:
        patient: { $ref: '#/components/schemas/PatientSearchResult' }
        confidence: { type: string, enum: [HIGH, POSSIBLE] }
        matched_on:
          type: array
          items: { type: string, enum: [mobile, name, dob, gender] }

    # ---- Visits & clinical ----
    Visit:
      type: object
      properties:
        id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        visit_date: { type: string, format: date }
        visit_type_code: { type: string }
        consultation_category: { type: string, nullable: true }
        doctor_id: { type: string, format: uuid, nullable: true }
        is_scheduled: { type: boolean }
        status: { $ref: '#/components/schemas/VisitStatus' }
        reason: { type: string, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    VisitCreateRequest:
      type: object
      required: [visit_date, visit_type_code]
      properties:
        visit_date: { type: string, format: date }
        visit_type_code: { type: string }
        consultation_category: { type: string, nullable: true }
        doctor_id: { type: string, format: uuid, nullable: true }
        is_scheduled: { type: boolean, default: false }
        reason: { type: string, nullable: true }
    VisitUpdateRequest:
      type: object
      required: [version]
      properties:
        status: { $ref: '#/components/schemas/VisitStatus' }
        doctor_id: { type: string, format: uuid, nullable: true }
        reason: { type: string, nullable: true }
        version: { type: integer }
    PaginatedVisits:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/Visit' }
    CaseSheet:
      type: object
      properties:
        id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        appetite: { type: string, nullable: true }
        sleep: { type: string, nullable: true }
        motion: { type: string, nullable: true }
        energy_level: { type: string, nullable: true }
        hereditary_diseases: { type: string, nullable: true }
        past_ailments: { type: string, nullable: true }
        surgeries: { type: string, nullable: true }
        exercise_routine: { type: string, nullable: true }
        deliveries: { type: string, nullable: true }
        present_complaints: { type: string, nullable: true }
        other_observations: { type: string, nullable: true }
        remarks: { type: string, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    CaseSheetUpsertRequest:
      type: object
      properties:
        appetite: { type: string, nullable: true }
        sleep: { type: string, nullable: true }
        motion: { type: string, nullable: true }
        energy_level: { type: string, nullable: true }
        hereditary_diseases: { type: string, nullable: true }
        past_ailments: { type: string, nullable: true }
        surgeries: { type: string, nullable: true }
        exercise_routine: { type: string, nullable: true }
        deliveries: { type: string, nullable: true }
        present_complaints: { type: string, nullable: true }
        other_observations: { type: string, nullable: true }
        remarks: { type: string, nullable: true }
        version: { type: integer, nullable: true }
    ConsultationNote:
      type: object
      properties:
        id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        doctor_id: { type: string, format: uuid, nullable: true }
        presenting_complaints: { type: string, nullable: true }
        diagnosis: { type: string, nullable: true }
        observations: { type: string, nullable: true }
        treatment_advice: { type: string, nullable: true }
        diet_advice: { type: string, nullable: true }
        yoga_advice: { type: string, nullable: true }
        review_date: { type: string, format: date, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    ConsultationNoteCreateRequest:
      type: object
      properties:
        doctor_id: { type: string, format: uuid, nullable: true }
        presenting_complaints: { type: string, nullable: true }
        diagnosis: { type: string, nullable: true }
        observations: { type: string, nullable: true }
        treatment_advice: { type: string, nullable: true }
        diet_advice: { type: string, nullable: true }
        yoga_advice: { type: string, nullable: true }
        review_date: { type: string, format: date, nullable: true }
    Prescription:
      type: object
      properties:
        id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        doctor_id: { type: string, format: uuid, nullable: true }
        prescription_date: { type: string, format: date }
        instructions: { type: string, nullable: true }
        review_advice: { type: string, nullable: true }
        medicine_details: { type: string, nullable: true }
        items:
          type: array
          items: { $ref: '#/components/schemas/PrescriptionItem' }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    PrescriptionItem:
      type: object
      required: [medicine_name]
      properties:
        line_no: { type: integer, default: 1 }
        medicine_name: { type: string }
        dosage: { type: string, nullable: true }
        timing: { type: string, nullable: true }
        duration: { type: string, nullable: true }
        usage_instruction: { type: string, nullable: true }
        application_route: { $ref: '#/components/schemas/ApplicationRoute' }
    PrescriptionCreateRequest:
      type: object
      properties:
        doctor_id: { type: string, format: uuid, nullable: true }
        prescription_date: { type: string, format: date, nullable: true }
        instructions: { type: string, nullable: true }
        review_advice: { type: string, nullable: true }
        medicine_details: { type: string, nullable: true }
        items:
          type: array
          items: { $ref: '#/components/schemas/PrescriptionItem' }
    DischargeSummary:
      type: object
      properties:
        id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        doctor_id: { type: string, format: uuid, nullable: true }
        admission_date: { type: string, format: date, nullable: true }
        discharge_date: { type: string, format: date, nullable: true }
        diagnosis: { type: string, nullable: true }
        presenting_complaints: { type: string, nullable: true }
        investigations_admission: { type: string, nullable: true }
        treatments: { type: string, nullable: true }
        condition_at_discharge: { type: string, nullable: true }
        follow_up_period: { type: string, nullable: true }
        discharge_advice: { type: string, nullable: true }
        medications: { type: string, nullable: true }
        yoga_guidance: { type: string, nullable: true }
        is_finalized: { type: boolean }
        finalized_at: { type: string, format: date-time, nullable: true }
        finalized_by: { type: string, format: uuid, nullable: true }
        amends_id: { type: string, format: uuid, nullable: true }
        is_superseded: { type: boolean, description: True when a later amendment supersedes this row. }
        superseded_by: { type: string, format: uuid, nullable: true, description: The amendment that supersedes this row, if any. }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    DischargeSummaryCreateRequest:
      type: object
      properties:
        doctor_id: { type: string, format: uuid, nullable: true }
        admission_date: { type: string, format: date, nullable: true }
        discharge_date: { type: string, format: date, nullable: true }
        diagnosis: { type: string, nullable: true }
        presenting_complaints: { type: string, nullable: true }
        investigations_admission: { type: string, nullable: true }
        treatments: { type: string, nullable: true }
        condition_at_discharge: { type: string, nullable: true }
        follow_up_period: { type: string, nullable: true }
        discharge_advice: { type: string, nullable: true }
        medications: { type: string, nullable: true }
        yoga_guidance: { type: string, nullable: true }
    DischargeSummaryUpdateRequest:
      type: object
      required: [version]
      properties:
        admission_date: { type: string, format: date, nullable: true }
        discharge_date: { type: string, format: date, nullable: true }
        diagnosis: { type: string, nullable: true }
        presenting_complaints: { type: string, nullable: true }
        investigations_admission: { type: string, nullable: true }
        treatments: { type: string, nullable: true }
        condition_at_discharge: { type: string, nullable: true }
        follow_up_period: { type: string, nullable: true }
        discharge_advice: { type: string, nullable: true }
        medications: { type: string, nullable: true }
        yoga_guidance: { type: string, nullable: true }
        version: { type: integer }

    # ---- Documents ----
    Document:
      type: object
      properties:
        id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid, nullable: true }
        document_type_code: { type: string }
        title: { type: string, nullable: true }
        file_name: { type: string }
        content_type: { type: string, nullable: true }
        file_size_bytes: { type: integer, format: int64, nullable: true }
        document_date: { type: string, format: date, nullable: true }
        is_historical: { type: boolean }
        status: { $ref: '#/components/schemas/DocumentStatus' }
        remarks: { type: string, nullable: true }
        uploaded_by: { type: string, format: uuid, nullable: true }
        uploaded_at: { type: string, format: date-time }
    DocumentUploadRequest:
      type: object
      required: [file, document_type_code]
      properties:
        file: { type: string, format: binary }
        document_type_code: { type: string }
        visit_id: { type: string, format: uuid, nullable: true }
        title: { type: string, nullable: true }
        document_date: { type: string, format: date, nullable: true }
        is_historical: { type: boolean, default: false }
        remarks: { type: string, nullable: true }
    DocumentUpdateRequest:
      type: object
      properties:
        title: { type: string, nullable: true }
        document_type_code: { type: string }
        status: { $ref: '#/components/schemas/DocumentStatus' }
        remarks: { type: string, nullable: true }
    PresignedUrlResponse:
      type: object
      properties:
        url: { type: string, format: uri }
        expires_at: { type: string, format: date-time }
    PaginatedDocuments:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/Document' }

    # ---- Follow-ups ----
    FollowUp:
      type: object
      properties:
        id: { type: string, format: uuid }
        patient_id: { type: string, format: uuid }
        visit_id: { type: string, format: uuid, nullable: true }
        follow_up_date: { type: string, format: date }
        reason: { type: string, nullable: true }
        assigned_to: { type: string, format: uuid, nullable: true }
        status_code: { type: string }
        next_followup_id: { type: string, format: uuid, nullable: true }
        remarks: { type: string, nullable: true }
        version: { type: integer }
        created_at: { type: string, format: date-time }
    FollowUpCreateRequest:
      type: object
      required: [follow_up_date]
      properties:
        visit_id: { type: string, format: uuid, nullable: true }
        follow_up_date: { type: string, format: date }
        reason: { type: string, nullable: true }
        assigned_to: { type: string, format: uuid, nullable: true }
        status_code: { type: string, default: PENDING }
    FollowUpUpdateRequest:
      type: object
      required: [version]
      properties:
        follow_up_date: { type: string, format: date }
        reason: { type: string, nullable: true }
        assigned_to: { type: string, format: uuid, nullable: true }
        status_code: { type: string }
        remarks: { type: string, nullable: true }
        version: { type: integer }
    PaginatedFollowUps:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/FollowUp' }

    # ---- Merge requests ----
    MergeRequest:
      type: object
      properties:
        id: { type: string, format: uuid }
        primary_patient_id: { type: string, format: uuid }
        duplicate_patient_id: { type: string, format: uuid }
        status: { $ref: '#/components/schemas/MergeRequestStatus' }
        reason: { type: string, nullable: true }
        decision_remarks: { type: string, nullable: true }
        requested_by: { type: string, format: uuid }
        requested_at: { type: string, format: date-time }
        reviewed_by: { type: string, format: uuid, nullable: true }
        reviewed_at: { type: string, format: date-time, nullable: true }
        merged_at: { type: string, format: date-time, nullable: true }
        version: { type: integer }
    MergeRequestCreateRequest:
      type: object
      required: [primary_patient_id, duplicate_patient_id]
      properties:
        primary_patient_id: { type: string, format: uuid }
        duplicate_patient_id: { type: string, format: uuid }
        reason: { type: string, nullable: true }
    MergeDecisionRequest:
      type: object
      properties:
        decision_remarks: { type: string, nullable: true }
    PaginatedMergeRequests:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/MergeRequest' }

    # ---- Dashboard / reports ----
    DashboardSummary:
      type: object
      properties:
        recent_registrations:
          type: array
          items: { $ref: '#/components/schemas/PatientSearchResult' }
        todays_visits_count: { type: integer }
        pending_follow_ups_count: { type: integer }
        upcoming_follow_ups:
          type: array
          items: { $ref: '#/components/schemas/FollowUp' }
        recent_uploads:
          type: array
          items: { $ref: '#/components/schemas/Document' }
        patient_count_by_category:
          type: array
          items:
            type: object
            properties:
              op_category_code: { type: string }
              count: { type: integer }
    ReportResult:
      type: object
      properties:
        report_type: { type: string }
        from: { type: string, format: date }
        to: { type: string, format: date }
        generated_by: { type: string }
        generated_at: { type: string, format: date-time }
        rows:
          type: array
          items:
            type: object
            additionalProperties: true
    PatientExportRequest:
      type: object
      properties:
        format: { type: string, enum: [pdf, csv, xlsx], default: pdf }
        include_documents: { type: boolean, default: false }

    # ---- Audit / backup / system ----
    AuditLogEntry:
      type: object
      properties:
        id: { type: integer, format: int64 }
        user_id: { type: string, format: uuid, nullable: true }
        user_role: { type: string, nullable: true }
        action: { type: string }
        entity_type: { type: string, nullable: true }
        entity_id: { type: string, nullable: true }
        patient_id: { type: string, format: uuid, nullable: true }
        old_value: { type: object, nullable: true, additionalProperties: true }
        new_value: { type: object, nullable: true, additionalProperties: true }
        description: { type: string, nullable: true }
        ip_address: { type: string, nullable: true }
        user_agent: { type: string, nullable: true }
        request_id: { type: string, nullable: true }
        created_at: { type: string, format: date-time }
    PaginatedAuditLog:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/AuditLogEntry' }
    BackupLogEntry:
      type: object
      properties:
        id: { type: integer, format: int64 }
        backup_type: { $ref: '#/components/schemas/BackupType' }
        status: { $ref: '#/components/schemas/BackupStatus' }
        location_ref: { type: string, nullable: true }
        size_bytes: { type: integer, format: int64, nullable: true }
        message: { type: string, nullable: true }
        triggered_by: { type: string, format: uuid, nullable: true }
        started_at: { type: string, format: date-time }
        completed_at: { type: string, format: date-time, nullable: true }
    PaginatedBackupLog:
      allOf:
        - $ref: '#/components/schemas/PaginationMeta'
        - type: object
          properties:
            items:
              type: array
              items: { $ref: '#/components/schemas/BackupLogEntry' }
    HealthStatus:
      type: object
      properties:
        status: { type: string, example: ok }
        checks:
          type: object
          additionalProperties: { type: string }
```

---

## Validation & Coverage Summary

| Implementation-plan module (Plan §3) | Covered in this spec |
|--------------------------------------|----------------------|
| 1. User & Access / RBAC | §7.1, §7.2 (auth, users, roles, me, permissions) |
| 2. Master Data | §7.3 (master-data, op-sequences) |
| 3. Patient Registration & Profile | §7.4 (patients, timeline, aliases) |
| 4. OP Numbering | Internal to `POST /patients` (row-locked) — §7.4, §3 idempotency |
| 5. Search & Retrieval | §7.5 (`/patients/search`) |
| 6. Visit & Consultation | §7.6 (visits, case-sheet, consultation-notes) |
| 7. Prescriptions | §7.7 |
| 8. Discharge Summaries | §7.8 (create/finalize/amend; current-effective + history retrieval) |
| 9. Documents | §7.9 (upload, metadata, content, download-url) |
| 10. Patient Timeline | §7.4 (`/patients/{id}/timeline`) |
| 11. Follow-Up Tracking | §7.10 |
| 12. Audit Trail | §7.14 |
| 13. Backup & Recovery | §7.15 (status; restore is out-of-band) |
| 14. Concurrency Handling | Cross-cutting: `version` + `409 VERSION_CONFLICT` (§6, §8.6) |
| 15. Duplicate Detection & Merge | §7.11 (duplicates, merge-requests workflow) |
| 16. Dashboard | §7.12 |
| 17. Reports & Export | §7.13 |

**Validation notes:**
- All endpoints listed in Plan §3 and SAD §9.2 are present; no endpoints outside those documents were invented. Candidate/Assumption endpoints (`POST /patients/{id}/op-correction`, `POST /backup/run`, historical-import endpoints) are explicitly flagged as **candidates**, not part of the committed contract.
- Naming is consistent and RESTful (plural nouns, nested ownership, controlled action sub-resources).
- Schemas are reused via `$ref`; shared envelopes (`ErrorResponse`, `PaginationMeta`, `Paginated*`) and parameters (`Page`, `PageSize`, path IDs) are factored into `components`.
- Enums and field shapes are derived directly from `DDL_DATAMODEL.sql` CHECK constraints and seed data.
- The OpenAPI YAML is 3.1.0-compliant and self-consistent (every `$ref` resolves to a defined component).

**Conscious deviations from the literal SoW wording (recommended for sign-off):**
- **Case sheet:** `PUT /visits/{id}/case-sheet` (SoW names `POST`) — idempotent upsert on a one-per-visit singleton (`uq_case_sheets_visit`). Path unchanged; verb refined. See §7.6.
- **Document download:** the SoW's single `GET /documents/{id}` is split into `GET /documents/{id}` (metadata) + `GET /documents/{id}/content` (audited binary stream) + optional `/download-url`. Same security model. See §7.9.
- **Discharge multi-row resolution:** because the data model allows an original + amendment chain per visit, `GET /visits/{id}/discharge-summary` is defined to return the **current effective** version (with `is_superseded`/`superseded_by`), and `…/discharge-summary/history` lists all versions. See §7.8.

**Open items inherited from SAD §27 that affect concrete values (not structure):** token TTLs, upload size limit, exact OP-number prefixes/padding/reset rules, receptionist field-level visibility list, and final hostnames. These are flagged inline as **Assumption** and do not change the API surface.

---

*End of API Specification — ArogyaM Patient Management System (Phase 1), v1.0.*
