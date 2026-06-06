# AGENTS.md

## Project Summary
ArogyaM PMS is a secure, web-based internal patient record system for ArogyaM clinic staff and doctors. It replaces paper case-sheet handling with structured digital workflows for registration, visits, consultations, prescriptions, discharge summaries, document uploads, follow-ups, audit, and backup. Phase 1 is a single-clinic, low-concurrency operational system.

Core goals:
- Transaction-safe OP number generation by category
- Fast patient retrieval without exposing clinical details in search results
- Secure document handling with audited, permission-checked access
- Minimal single-VM Docker deployment that can evolve later

Principles:
- Only `audit_log` may hold patient-identifying or clinical detail from sensitive actions.
- Deny-by-default RBAC is enforced by the backend on every protected endpoint.
- No SQLAlchemy query construction outside repositories.
- Keep MVP, Full-Scope, and Future features separate.

## Tech Stack
Frontend: React 18, Vite, TypeScript, React Router, Radix UI, Tailwind CSS, TanStack Query, Zustand, Axios, React Hook Form, Zod, MSW, Vitest/RTL/jest-axe.
Backend: FastAPI, SQLAlchemy 2.x sync `Session`, Pydantic v2, Alembic, psycopg3, python-jose JWT, passlib bcrypt, ruff, mypy, pytest.
Data: PostgreSQL 16 with FTS, `pg_trgm`, `citext`; MinIO/S3-compatible object storage for document binaries.
Infra: Docker Compose, Nginx, optional Redis for login rate limiting and token denylist.

## Skill Routing
Use `architecture-deep-dive` for architecture, workflows, scalability, search/RAG readiness, storage, caching strategy, and platform evolution.
Use `frontend-guidelines` for all work inside `frontend/`, including UI, forms, state, mocks, API contracts, routing, and tests.
Use `backend-patterns` for FastAPI backend design, services, repositories, sessions, migrations, background tasks, and integration patterns.
Use `testing-quality-gates` for lint, typecheck, tests, coverage, CI, migration verification, and Codex-safe Python execution.

## Key Rules
- Backend modules follow `backend/app/modules/<domain>/router.py|service.py|repository.py|models.py|schemas.py`.
- Routers inject `db: Session = Depends(get_db)`; services own business logic, commits, and audit writes.
- Repositories own `select()`, `insert()`, `update()`, `delete()`, joins, filters, ordering, pagination, and aggregates.
- OP numbering uses a row-locked `op_sequence` update inside the patient registration transaction.
- Search/retrieval uses PostgreSQL FTS + `pg_trgm`; exact OP/mobile ranks first, then name relevance.
- Document binaries live in MinIO/S3; PostgreSQL stores metadata only.
- Redis is optional; see `architecture-deep-dive` for the canonical cache/queue rule.
- Heavy work uses FastAPI background tasks in Phase 1; Redis RQ is deferred.
- Migrations are Alembic-owned and verified against PostgreSQL, not SQLite.
- `SQL_ECHO=false`; non-audit logs must not include PII/PHI.

## Code Navigation Policy
Prefer LSP for `.py`, `.ts`, and `.tsx` symbol lookup; use Grep only as fallback for config strings, comments, TODOs, and non-symbol literals.
