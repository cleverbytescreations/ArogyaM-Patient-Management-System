---
name: architecture-deep-dive
description: Use for system architecture, module boundaries, scalability, search design,
  storage separation, async/event-driven workflows, Redis strategy, and platform evolution.
---

# Architecture Deep Dive

Use this skill when the task involves:
- Designing or reviewing module boundaries and layering
- Search, indexing, or FTS strategy questions
- Redis usage, caching strategy, or rate-limiting design
- Storage separation (PostgreSQL vs MinIO)
- Async or background-task workflow design
- Scalability, infrastructure evolution, or production hardening
- Data model decisions (ER relationships, versioning, soft-delete, audit)

## Project Architecture Baseline

ArogyaM PMS is a modular-monolith web application serving internal clinic staff (doctors,
receptionists, data-entry, admin) with secure patient record management. Phase 1 is a
single-clinic, low-concurrency system (≤15–20 concurrent users) running on a single VM.

Core capabilities:
- Patient registration with transaction-safe category-wise OP number generation
- Clinical record lifecycle: visits, case sheets, consultation notes, prescriptions, discharge summaries
- Document upload/download via MinIO (permission-gated, no public URLs)
- Full-text and trigram patient search
- Follow-up lifecycle tracking (Pending → Contacted/Rescheduled/Completed)
- Append-only audit trail for all sensitive actions

Core principle:
See **CLAUDE.md → Principles** for cross-cutting constraints (log privacy, deny-by-default RBAC,
no SQL outside repositories, secured documents).

## Core Architecture

### Transaction System
Use PostgreSQL as the single source of truth for all structured data:
- Users, roles, permissions
- Patient demographics (`patients`), OP sequences (`op_sequence`), aliases (`patient_aliases`)
- Visit, case sheet, consultation notes, prescriptions, discharge summaries
- Documents metadata (file reference, type, uploader — binary lives in MinIO)
- Follow-ups, merge requests, audit log, backup log, master data

**OP number safety:** `SELECT … FROM op_sequence WHERE category_code=:c FOR UPDATE` inside the
patient-registration transaction — the only correct pattern; never generate outside a DB transaction.

**Optimistic concurrency:** `version` column on all mutable clinical records. Service compares
client-supplied `version`; on mismatch return `409 Conflict` → UI forces a reload before save.

**Soft delete:** `status`/`is_active` flags only — no physical deletes of patients, clinical
records, or documents.

### Search System
Use **PostgreSQL full-text search + pg_trgm** for all patient retrieval:
- GIN index on generated `search_vector` (tsvector) for full-text name search
- GIN trigram index on `patients.full_name` for partial-name and typo-tolerant queries
- B-tree index on `op_number` and `mobile` for exact lookups
- Result ranking: exact OP/mobile match first, then name relevance score
- Search result list returns minimal identifiers only; full medical data requires opening the profile (logged)

No separate search engine (Elasticsearch/OpenSearch) is deployed. PostgreSQL FTS is sufficient
at Phase 1 scale and keeps infrastructure minimal.

**pgvector / semantic search** is a future option only — not deployed in Phase 1. There is no
separate vector database; if pgvector is added later it will extend the existing PostgreSQL
instance.

### AI / Semantic Layer
Not in Phase 1 scope. The data model (structured documents, text fields, MinIO binary store) is
kept AI-ready: future OCR/RAG can add a text-extraction worker + pgvector extension to PostgreSQL
without restructuring the core schema. See `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md §14` for the
planned future direction.

### Document / Content Lifecycle
Documents are stored as binaries in MinIO; only metadata (storage_ref, file_name, document_type,
uploader, date, is_historical, status) lives in PostgreSQL.

Access: always through a permission-checked proxy endpoint or a short-lived pre-signed URL.
No public object-store URLs are ever exposed.

Soft-delete: documents use a `status` field (`ACTIVE` / `SOFT_DELETED`).

Discharge summaries have a finalize lifecycle: Draft → Finalized (immutable). Amendments create
a new row linked via `amends_id`.

### Object Storage
Use MinIO (S3-compatible) for: all uploaded documents (PDF, JPG, JPEG, PNG — case sheets,
prescriptions, discharge summaries, scanned records). MinIO can be swapped for AWS S3 with no
code change (S3-compatible API).

Bucket `arogyam-documents` is private. Files are streamed through the API, never served directly.

### Cache / Queue
**Redis is optional in Phase 1** (enabled via Docker Compose `--profile cache`).

When Redis is available, use it for:
- Rate-limit counters on `POST /auth/login` (sliding window)
- Optional JWT `jti` denylist for token revocation on logout

No fixed DB-slot assignments are defined for Phase 1. When Redis is absent, token denylist
falls back to an in-process store (`core/tokens.py`). Do not rely on Redis for any data
that must survive a process restart.

**Redis RQ / heavy async queues** are deferred to Full-Scope (Stage 8). Phase 1 async work
(backup trigger, optional email alerts) uses FastAPI background tasks only.

### Event / Async Layer
Phase 1 uses **FastAPI background tasks** for lightweight fire-and-forget work (backup
completion email alerts, optional async hooks). No transactional outbox pattern; no Celery;
no Kafka. Redis RQ is the planned upgrade path for heavier workloads (PDF generation, future
OCR) in Full-Scope.

Heavy async operations to move off the request path:
- Nightly backup trigger and backup log writes
- Future: PDF generation, OCR text extraction, embedding generation

## Architecture Principles

### Modular Monolith
Single deployable unit organized into clear domain modules
(`auth`, `patients`, `visits`, `clinical`, `documents`, `followups`, `masterdata`,
`duplicates`, `reports`, `audit`, `backup`), each with its own
`router / service / repository / models / schemas`. Clear seams allow future extraction
into separate services without rewriting the core.

### Security by Design
JWT auth (access + refresh rotation), RBAC, hashed passwords (argon2/bcrypt), HTTPS
termination at Nginx, access-controlled documents, input validation (Pydantic), audit
logging of sensitive actions, and a strict log-redaction filter (SAD §10.1).

### API-First
All functionality exposed through versioned REST endpoints (`/api/v1/…`). FastAPI
auto-generates OpenAPI docs. React SPA consumes documented APIs only.

### Cost-Conscious
Single VM + Docker Compose. No Elasticsearch, no Kafka, no Kubernetes in Phase 1.
Vertical scale first; horizontal API scaling is a future step (stateless API makes it easy).

### AI-Readiness
Data model and document store are structured for future OCR/RAG: document binaries in
MinIO, structured metadata in PostgreSQL, pgvector-ready DB, no redesign required to add
semantic search later.

## Preferred Patterns

### CQRS-lite
Writes go through the transactional PostgreSQL path (service → repository → `db.commit()`).
Reads for search/discovery use the FTS/trgm query path. No separate read replica in Phase 1.

### Optimistic Concurrency
`version` column on mutable records; `409 Conflict` on mismatch; UI shows reload prompt.
OP sequence uses pessimistic locking (`SELECT … FOR UPDATE`) as the single exception because
uniqueness is non-negotiable.

### Proxied Document Access
Documents are never publicly served. Access: permission check → stream bytes via proxy endpoint
OR generate a short-lived pre-signed URL. Every document access is logged in `audit_log`.

## Canonical Workflows

### Patient Registration
Search for duplicates inline → collect demographics → lock OP sequence row → generate OP number → insert patient → commit → write audit

### Document Upload
Permission check → validate type (PDF/JPG/JPEG/PNG) + size → stream to MinIO → write `documents` row (metadata only) → commit → log audit

### Follow-Up Lifecycle
Create (Pending) → Contacted | Not Reachable → Rescheduled (new date) | Completed → terminal; never deleted by normal users

### Duplicate Merge (Full-Scope, Stage 8)
Staff requests merge (`PENDING`) → Admin reviews queue → Admin approves/rejects → On approval: single-transaction reassign visits/docs/follow-ups to primary, set duplicate `status=MERGED`, copy old OP to `patient_aliases`, write full before/after audit

### Discharge Summary Finalize
Entry (Draft) → Finalize (`is_finalized=TRUE`) → Immutable; amendment creates new row linked via `amends_id` + audit

## Scalability Thresholds

| Component | Current (Phase 1) | Upgrade trigger |
|-----------|-------------------|-----------------|
| API | Single Uvicorn container | >30 concurrent users or latency regression |
| PostgreSQL | Single container + volume | >100k patients OR reporting becomes slow |
| MinIO | Single container + volume | >50 GB docs or availability requirement |
| Redis | Optional single node | Rate-limiting or denylist needed in prod |
| Search | PostgreSQL FTS + trgm | p95 search >1s on seeded dataset |
| Reporting | Direct SQL + views | Slow reports → promote to materialized views |
| `audit_log` / append-only tables | BRIN index + monthly retention purge | `pg_total_relation_size` > 2 GB or > 2–5M rows → plan `pg_partman` partitioning |

### Append-Only Table Scale Strategy

Any table that is strictly append-only and time-ordered (`audit_log`, `backup_log`,
future `notification_log`, event tables) follows a dedicated three-phase escalation path.

**Phase A — Index (do immediately on any new append-only table):**
Use a **BRIN** index on `created_at`, not a B-Tree. Rows are always physically appended
in timestamp order, so BRIN stores only min/max per 128-page block range at ~8–12× less
disk/write cost than B-Tree while delivering the same range-scan pruning. Full
implementation rule lives in **backend-patterns skill → Append-Only / Time-Series Table
Patterns**.

**Phase B — Retention policy (implement alongside the table):**
Add a `<TABLE>_RETENTION_DAYS` env var (default 2555 = 7 years for medical records, 0 =
disabled). A monthly cron script (`scripts/purge_<table>.py`) deletes expired rows
atomically with a `PURGE_<TABLE>` audit record. This keeps the table bounded without
partitioning complexity. Full implementation pattern in **backend-patterns skill**.

**Phase C — Declarative partitioning (trigger: 2 GB or 2–5M rows):**
When `pg_total_relation_size('<table>')` exceeds **2 GB** or row count exceeds **2–5M**,
begin planning `pg_partman` monthly range partitioning. Partition drops are O(1) and
lock-free vs. minutes-long `DELETE` at that scale. Outbound FK constraints
(`audit_log.user_id → users`) are fully supported on partitioned tables in PostgreSQL 11+.
See [Docs/audit-log-declarative-table-partitioning.md](../../Docs/audit-log-declarative-table-partitioning.md)
for the full migration plan, `pg_partman` setup, and FK constraint notes.

## When giving architecture advice

Always:
- Validate against the minimal-hardware constraint — no new services unless justified
- Recommend the simplest viable option first, then describe the evolution path
- Check that security invariants (RBAC, audit, document access) are preserved
- Reference the Phase 1 scale assumptions (≤30 concurrent users, tens of thousands of patients)
- Distinguish MVP (R1 must-have) from Full-Scope (R2 should-have) from Future

## Output Style

Prefer: module breakdown, component interaction, sequence steps, deployment evolution plan,
risks/tradeoffs/recommendations. Use tables for comparisons; use numbered steps for sequences.