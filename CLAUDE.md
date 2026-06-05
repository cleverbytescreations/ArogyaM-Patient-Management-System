# CLAUDE.md

## Project Summary
ArogyaM PMS is a secure, web-based internal patient record management system for ArogyaM
clinic staff and doctors. It replaces paper-based case-sheet handling with structured digital
records covering registration, consultations, prescriptions, discharge summaries, document
uploads, follow-up tracking, and full audit trail.

Core goals:
- Transaction-safe, category-wise OP number generation (row-locked sequence)
- Fast patient search via PostgreSQL FTS + pg_trgm (no separate search engine)
- Role-based access control: Administrator, Doctor, Receptionist, Data Entry Staff
- Append-only audit trail for every sensitive action; no PII/PHI in non-audit logs
- Secure document storage (MinIO/S3) — all access permission-checked, never public URLs
- Optimistic concurrency (`version` column) on all mutable clinical records
- Modular monolith with clean module seams that can split into services later

Principles:
- No PII/PHI in application or proxy logs — only `audit_log` may hold patient-identifying detail
- Deny-by-default RBAC: every endpoint declares required permission; backend enforces authoritatively
- No SQL outside repositories; no business logic in routers or endpoints
- All document downloads are permission-checked proxied or short-lived pre-signed URLs

## Tech Stack
Frontend: React 18 + Vite + TypeScript, Radix UI primitives, Tailwind CSS,
  TanStack Query v5, Zustand, React Hook Form + Zod, Axios, MSW v2, Vitest + RTL
Backend: FastAPI + SQLAlchemy 2.x (sync) + Pydantic v2 + Alembic, psycopg3, ruff, mypy
Data: PostgreSQL 16 (FTS + pg_trgm; no separate search engine)
Storage: MinIO / S3-compatible (document binaries only; metadata in PostgreSQL)
Infra: Redis (optional — rate limiting / token denylist), Nginx, Docker Compose

## Skill Routing
Use `architecture-deep-dive` for system architecture, module boundaries, search design,
  scalability, storage layout, Redis strategy, and async/event workflows.
Use `frontend-guidelines` for all work inside `frontend/`, including React, TypeScript,
  Radix UI, Tailwind, forms, state, mocks, API contracts, and routing.
Use `backend-patterns` for FastAPI backend design, module structure, services, repositories,
  background tasks, caching, and integration patterns.

## Key Rules
- Module layout: `backend/app/modules/<domain>/router.py|service.py|repository.py|models.py|schemas.py`
- Session flow: router injects `db: Session = Depends(get_db)` → passes to service → service passes to repo; service calls `db.commit()`
- OP numbering: `SELECT … FROM op_sequence WHERE category_code=:c FOR UPDATE` inside the registration transaction — never generate outside a DB transaction
- Search/retrieval: PostgreSQL FTS + pg_trgm only; exact OP/mobile ranked first, then name relevance
- Heavy work (PDF, backup, future OCR) via FastAPI background tasks; Redis RQ deferred to Full-Scope
- Tests run inside Docker: `docker compose exec api pytest tests/ -x -q --tb=short`
- Migrations run inside Docker: `docker compose exec api alembic …`; never edit DB schema directly
- All sensitive actions (login, view-profile, create/update, upload, export, merge, user changes) write to `audit_log`
- `SQL_ECHO=false` in all environments — SQL parameter logging would expose PHI (SAD §10.1)

## Code navigation policy
Prefer LSP for `.py`, `.ts`, `.tsx` symbol lookup; use Grep only as fallback for config
strings, comments, or non-symbol literals.
