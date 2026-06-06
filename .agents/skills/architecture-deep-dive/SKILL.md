---
name: architecture-deep-dive
description: Use for system architecture, module boundaries, scalability, search design, AI/RAG readiness, storage separation, async/event-driven workflows, Redis strategy, and platform evolution decisions.
---

# Architecture Deep Dive

Use this skill when the task involves:
- Module boundaries, platform shape, or deployment evolution
- PostgreSQL FTS, trigram search, or future semantic search decisions
- Redis, caching, rate limiting, background work, or queue choices
- Storage separation between PostgreSQL and MinIO/S3
- Scalability, performance thresholds, or production hardening

## Project Architecture Baseline

ArogyaM PMS is a modular-monolith internal clinic system for doctors, receptionists, data-entry staff, and administrators. Phase 1 is deliberately simple: one React SPA, one FastAPI API, PostgreSQL, MinIO/S3, Nginx, Docker Compose, and optional Redis on a single modest VM.

Core capabilities:
- Patient registration, category-wise OP numbering, search, profile, and timeline
- Visits, case sheets, consultation notes, prescriptions, discharge summaries, documents, follow-ups, audit, backup, duplicate review, and reports

Core principle:
See `AGENTS.md -> Principles` for cross-cutting constraints.

## Core Architecture

### Transaction System
Use PostgreSQL 16 as the source of truth for:
- Users, roles, user-role mappings, permissions, audit logs, and backup logs
- Patients, aliases, OP sequences, visits, clinical records, follow-ups, merge requests, master data, and document metadata

OP numbers are generated only inside the registration transaction by locking the `op_sequence` row with `SELECT ... FOR UPDATE`, incrementing `last_sequence`, formatting prefix plus padding, and committing the patient insert with the sequence update.

Mutable records use optimistic concurrency through `version`; stale writes return `409 Conflict` and the UI prompts reload. Patients, clinical records, and documents are soft-deleted or statused, not physically deleted through normal workflows.

### Search System
PostgreSQL is the only Phase 1 search backend. Use generated `patients.search_vector` with a GIN index for full-text search, `pg_trgm` GIN on `patients.full_name` for partial and fuzzy names, and B-tree indexes on exact lookup fields such as `op_number` and `mobile`.

Search ranking is exact OP/mobile first, then name relevance. Search result rows contain minimal identifiers only; clinical details require opening the patient profile, which is audited.

This is the canonical storage-separation rule: Phase 1 has no Elasticsearch/OpenSearch, no separate vector database, and no pgvector extension. If future semantic search is approved, pgvector extends the existing PostgreSQL instance; vectors do not move to a separate store unless the architecture is revised.

### AI / Semantic Layer
AI/OCR/RAG is future scope. The model keeps document binaries in MinIO/S3 and structured metadata/text-ready fields in PostgreSQL so future OCR extraction, embeddings, and summarization can be added without redesigning Phase 1.

### Document / Content Lifecycle
Documents use metadata rows in PostgreSQL and binary objects in a private MinIO/S3 bucket. Access is through permission-checked proxy streaming or short-lived pre-signed URLs, and every content access is audited.

Discharge summaries flow draft -> finalized immutable; amendments create a new row linked by `amends_id`. Duplicate merging is request -> admin approve/reject -> single-transaction reassignment, alias preservation, duplicate status update, and audit.

### Object Storage
Use MinIO locally/on-prem or AWS S3-compatible storage for PDF/JPG/JPEG/PNG document binaries, including case sheets, prescriptions, discharge summaries, and historical scanned records. The default bucket is `arogyam-documents` and remains private.

### Cache / Queue
This is the canonical Redis rule. Redis is optional in Phase 1 and has no fixed DB-slot partitioning; use the DB selected by `REDIS_URL` and do not invent multiple logical Redis DB slots.

When Redis is configured, use it only for:
- Login rate-limit counters with short TTLs keyed by route and actor/IP
- Optional JWT `jti` denylist for logout/revocation with TTL no longer than token expiry

Do not store source-of-truth data, patient records, document metadata, workflow state, or session state in Redis. When Redis is absent, token denylist behavior falls back to the existing in-process store.

### Event / Async Layer
Phase 1 uses FastAPI background tasks for lightweight fire-and-forget work such as backup alerts. No Celery, Kafka, or transactional outbox is part of Phase 1. Redis RQ is the documented Full-Scope/Future upgrade path for PDF generation, OCR, and embedding jobs.

Use async/background flows for: backup alerts, future PDF generation, future OCR extraction, future embedding generation, and bulk historical import utilities.

## Architecture Principles

### Minimal Infrastructure
Favor PostgreSQL, MinIO/S3, Nginx, Docker Compose, and optional Redis before adding services. Elasticsearch, Kafka, Kubernetes, and public integrations are out of Phase 1.

### Security By Design
Preserve JWT auth, deny-by-default RBAC, record-level checks, document access control, redacted non-audit logs, and append-only audit records for sensitive actions.

### API-First Modular Monolith
Expose versioned REST APIs under `/api/v1`; keep modules organized by domain with routers, services, repositories, models, and schemas.

### Future-Ready Without Overbuilding
Keep seams for multi-branch, AI/OCR, RQ workers, reports, and integrations, but do not implement deferred features until the checklist reaches the relevant tier.

## Preferred Patterns

### CQRS-Lite
Writes go through transactional PostgreSQL services and repositories. Search/discovery reads use the FTS/trigram query path, still inside PostgreSQL.

### Proxied Document Access
Permission check -> stream bytes through API or generate a short-lived pre-signed URL -> write audit row. Never expose public object-store URLs.

## Canonical Workflows

### Patient Registration
Check duplicates -> validate demographics -> lock `op_sequence` -> generate OP number -> insert patient -> write audit -> commit.

### Document Upload
Permission check -> validate type and size -> upload binary to MinIO/S3 -> insert `documents` metadata -> write audit -> commit.

### Follow-Up Lifecycle
Create PENDING -> CONTACTED or NOT_REACHABLE -> COMPLETED or RESCHEDULED; normal users do not hard-delete follow-ups.

### Duplicate Merge
Staff requests merge -> admin reviews -> approval performs single transaction to reassign visits, documents, and follow-ups, set duplicate `MERGED`, add alias, and audit.

## Scalability Thresholds

| Component | Phase 1 posture | Upgrade trigger |
| --- | --- | --- |
| API | Single FastAPI service with multiple workers | Sustained peak above 30 users or latency regression |
| PostgreSQL | Single tuned Postgres 16 container | More than about 100k patients or slow reports/search |
| Search | PostgreSQL FTS + trigram | Search p95 above 1s on seeded data after index tuning |
| MinIO/S3 | Single private bucket | Document volume above about 50 GB or HA requirement |
| Redis | Optional single node | Production login throttling or token denylist required |
| Reports | Direct SQL/views | Slow dashboard/report queries; then materialized views |

## When Giving Architecture Advice

Always:
- Validate against the minimal hardware and cost-conscious constraint.
- Preserve RBAC, audit, document security, and log privacy.
- Distinguish MVP, Full-Scope, and Future scope.
- Prefer the simplest viable Phase 1 option and name the evolution path.
- Reference `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` and `Docs/PHASE1_IMPLEMENTATION_PLAN.md` for decisions.

## Output Style

Prefer module breakdowns, component interactions, sequence steps, evolution plans, and risks/tradeoffs/recommendations.
