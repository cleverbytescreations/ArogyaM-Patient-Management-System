# ArogyaM Patient Management System

A secure, web-based patient (care seeker) record management system for the internal
operational use of ArogyaM staff and doctors. It replaces manual, paper-based
case-sheet handling with a structured digital system covering registration, OP number
generation, consultation records, prescriptions, discharge summaries, document uploads,
search, follow-up tracking, audit trail, and backup.

> **Phase 1 — Internal Operational System.** This release is a single-clinic,
> low-concurrency, internal-staff application. The architecture is deliberately kept
> simple, minimal, and cost-conscious. Public registration, appointments, reminders,
> and external integrations are intentionally deferred to later phases.

## Overview

ArogyaM PMS is a **single deployable web application**:

- **Frontend** — React SPA (Vite + TypeScript)
- **Backend** — FastAPI (Python) REST API with Pydantic, SQLAlchemy, and Alembic
- **Database** — PostgreSQL 16 (full-text search via `tsvector`/`pg_trgm`, no separate search engine)
- **Object storage** — MinIO (S3-compatible) for uploaded documents
- **Reverse proxy** — Nginx (single origin for the browser; `/` → SPA, `/api/` → API)
- **Cache / limiter** — Redis (optional, MVP-light)
- **Auth** — JWT (access + refresh) with hashed passwords and role-based access control

The entire stack runs as a small set of Docker containers and is designed to run
identically on a modest cloud VM or an on-premise server.

### Phase 1 modules

User & access management (RBAC) · Patient registration & profile · OP number management
(category-wise, transaction-safe) · Search & retrieval · Visit & consultation management ·
Medical records (prescriptions, discharge summaries, document uploads) · Historical record
digitization · Duplicate detection & controlled merge · Follow-up tracking · Dashboard &
basic reports/export · Audit trail · Backup & recovery · Master data management.

### Documentation

Detailed design and planning documents live in [Docs/](Docs/):

- [System Architecture Document](Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md)
- [Use Cases](Docs/usecases.md)
- [API Specification (OpenAPI)](Docs/API_SPECIFICATION_OPENAPI.md)
- [Data Model DDL](Docs/DDL_DATAMODEL.sql)
- [Docker Deployment Guide](Docs/DOCKER_DEPLOYMENT_GUIDE.md)
- [Phase 1 Implementation Plan](Docs/PHASE1_IMPLEMENTATION_PLAN.md)

## Prerequisites

- **Docker** and the **Docker Compose** plugin (Compose v2 — `docker compose ...`)
- Recommended developer hardware (see the [Docker Deployment Guide](Docs/DOCKER_DEPLOYMENT_GUIDE.md) §2):
  - Minimum: 2 vCPU / 4 GB RAM / 10 GB free disk
  - Recommended: 4 vCPU / 8 GB RAM / 20 GB free disk

> **Note:** The development stack is configured in [docker-compose.dev.yml](docker-compose.dev.yml).
> The `api` and `frontend` services build from [backend/](backend/) and [frontend/](frontend/),
> which currently contain the Stage 0 foundation scaffold (FastAPI health/readiness API and a
> React + Vite shell). Feature modules are layered on per the
> [Phase 1 Implementation Plan](Docs/PHASE1_IMPLEMENTATION_PLAN.md).

## Installation & Startup (Development)

The dev stack is **HTTP-only**, uses default credentials, and exposes ports for local
tooling. It is **development only** — never use it to host real patient data.

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/ArogyaM-Patient-Management-System.git
cd ArogyaM-Patient-Management-System
```

### 2. Create your dev environment file

Copy the template and adjust values if needed (ports, credentials, etc.):

```bash
cp .env.dev.example .env.dev
```

`.env.dev` is gitignored. The defaults are intentionally weak for local convenience and
must never be reused in UAT/production. Generate a real JWT secret with:

```bash
openssl rand -hex 32   # paste into JWT_SECRET_KEY in .env.dev
```

### 3. Start the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build
```

The dev stack starts Redis by default so login rate limiting and JWT token
denylist behavior match production more closely.

Run detached by adding `-d`. To stop:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev down
```

### 4. Open the app

| Service            | URL                          | Notes                                  |
|--------------------|------------------------------|----------------------------------------|
| App (via proxy)    | http://localhost:8080        | Single origin — use this in the browser |
| API (direct)       | http://localhost:8000        | FastAPI                                 |
| API docs (Swagger) | http://localhost:8000/docs   | Auto-generated OpenAPI                  |
| API health         | http://localhost:8000/api/v1/health |                                  |
| Vite dev server    | http://localhost:5173        | HMR (proxied through 8080)              |
| MinIO console      | http://localhost:9001        | Object storage UI                       |
| PostgreSQL         | localhost:5432               | For `psql` / DBeaver                    |

Default ports are configurable in `.env.dev` if any are already in use.

### Useful commands

```bash
# Tail logs for a single service
docker compose -f docker-compose.dev.yml --env-file .env.dev logs -f api

# Rebuild after dependency changes
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build

# Wipe all dev data (Postgres + MinIO volumes) and start fresh
docker compose -f docker-compose.dev.yml --env-file .env.dev down -v
```

Source for `api` and `frontend` is bind-mounted, so edits hot-reload (uvicorn `--reload`
and Vite HMR) without rebuilding the image.

## Production

Production runs from [docker-compose.prod.yml](docker-compose.prod.yml) with TLS, hardened
configuration, and `.env.prod` (see [.env.prod.example](.env.prod.example)). Refer to the
[Docker Deployment Guide](Docs/DOCKER_DEPLOYMENT_GUIDE.md) for the full procedure. Backup
and restore helpers live in [scripts/](scripts/).

## Repository layout

```
.
├── docker-compose.dev.yml     # Development stack (HTTP, hot reload)
├── docker-compose.prod.yml    # Production stack (TLS, hardened)
├── .env.dev.example           # Dev environment template
├── .env.prod.example          # Prod environment template
├── nginx/                     # Reverse proxy configs (dev + prod)
├── scripts/                   # Backup / restore helpers (DB + MinIO)
├── Docs/                      # Architecture, use cases, API spec, data model
├── backend/                   # FastAPI app (Stage 0 foundation scaffold)
└── frontend/                  # React + Vite SPA (Stage 0 foundation scaffold)
```
