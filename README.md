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

## Development User Accounts

After starting the stack, seed the dummy users for all roles by running:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev exec api python scripts/seed_dummy_users.py
```

The script is idempotent — safe to run multiple times.

| Role | Username | Password | Email | Mobile |
|---|---|---|---|---|
| Administrator | `admin` | `Admin@12345` | — | — |
| Doctor | `dr.priya` | `Doctor@12345` | dr.priya@arogyam.dev | 9876543201 |
| Receptionist | `receptionist.ravi` | `Reception@12345` | ravi.kumar@arogyam.dev | 9876543202 |
| Data Entry Staff | `dataentry.meena` | `DataEntry@12345` | meena.sharma@arogyam.dev | 9876543203 |

> The `admin` user is automatically seeded by migration `0003` on first startup.
> All other users are seeded by the script above.
> These credentials are **development only** — never use them in production.

## Roles & permissions

Access is **deny-by-default** and role-based. Every API endpoint declares the permission
it requires, and the backend enforces it authoritatively. The matrix below is the single
source of truth defined in [`ROLE_PERMISSIONS`](backend/app/core/permissions.py) (SAD §11.2);
the frontend reads each user's effective permissions from `/me/permissions` and never
hard-codes this matrix.

| Permission | Administrator | Doctor | Receptionist | Data Entry Staff |
|---|:---:|:---:|:---:|:---:|
| `create_patient` — register a new patient | ✅ | — | ✅ | ✅ |
| `view_patient` — search / view patient profiles | ✅ | ✅ | ✅ | ✅ |
| `edit_patient` — update patient profiles | ✅ | — | ✅ | ✅ |
| `view_medical_history` — view clinical history | ✅ | ✅ | — | — |
| `add_consultation` — add consultation / case-sheet notes | ✅ | ✅ | — | — |
| `add_prescription` — add prescriptions | ✅ | ✅ | — | — |
| `manage_followups` — manage follow-up tracking | ✅ | ✅ | ✅ | ✅ |
| `request_merge` — request a duplicate-record merge | ✅ | — | ✅ | ✅ |
| `merge_records` — approve / perform a merge | ✅ | — | — | — |
| `export` — export records / case-sheet PDF | ✅ | ✅ | — | — |
| `view_reports` — dashboard & reports | ✅ | ✅ | — | — |
| `manage_users` — user & access management | ✅ | — | — | — |
| `manage_master_data` — master data management | ✅ | — | — | — |
| `view_audit` — view the audit trail | ✅ | — | — | — |
| `backup_control` — backup & recovery controls | ✅ | — | — | — |

> **Note:** Creating a **visit** (`POST /patients/{id}/visits`) currently requires only
> `view_patient`, so every role can create a visit. There is no dedicated "create visit"
> permission. The Administrator role implicitly holds **all** permissions.

## Production

Production runs from [docker-compose.prod.yml](docker-compose.prod.yml) with TLS, hardened
configuration, and `.env.prod` (see [.env.prod.example](.env.prod.example)). Refer to the
[Docker Deployment Guide](Docs/DOCKER_DEPLOYMENT_GUIDE.md) for the full procedure. Backup
and restore helpers live in [scripts/](scripts/).

```bash
cp .env.prod.example .env.prod && chmod 600 .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

### Migrating from the dev stack to production

The dev stack ([docker-compose.dev.yml](docker-compose.dev.yml) / `.env.dev`) intentionally
runs with weakened, convenience-oriented settings — **do not lift `.env.dev` into
production**. Start from [.env.prod.example](.env.prod.example) and replace every
`CHANGE_ME` placeholder, then verify each of the following dev → prod changes:

| Setting | Dev value | Production requirement |
|---|---|---|
| `ENV` | `development` | `production` — flips on the [`Settings._require_secrets_in_production`](backend/app/core/config.py) startup guard, which **refuses to boot** if `JWT_SECRET_KEY`, `S3_SECRET_KEY`, or `DATABASE_URL` still hold dev sentinel values, or if `CORS_ALLOW_ORIGINS` is `*` |
| `JWT_SECRET_KEY` | `dev-only-change-me-...` placeholder | Generate a unique secret with `openssl rand -hex 32`; never reuse the dev value |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | `arogyam_dev_pw` | Strong, unique password (`openssl rand -hex 32`); never contains `arogyam_dev_pw` |
| `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` (→ `S3_ACCESS_KEY`/`S3_SECRET_KEY`) | `minioadmin` / `minioadmin_dev_pw` | Strong, unique credentials; the secret must differ from the dev sentinel `minioadmin_dev_pw` (checked at startup) |
| `REDIS_URL` | `redis://redis:6379` (no auth) | `redis://:<REDIS_PASSWORD>@redis:6379/0` — set `REDIS_PASSWORD` to a strong value; Redis is **mandatory** in prod (multi-worker rate limiting + JWT denylist need a shared store, see `core/tokens.py` / `core/ratelimit.py`) |
| `ADMIN_PASSWORD` | falls back to `Admin@12345` if blank | **Must** be set to a strong password, or left blank to *skip* auto-creation and instead create the admin via `backend/scripts/create_admin.py` — never ship the dev fallback password |
| **Transport encryption (TLS)** | HTTP only — [nginx.dev.conf](nginx/nginx.dev.conf), no certs | [nginx.prod.conf](nginx/nginx.prod.conf) terminates TLS 1.2/1.3 via Let's Encrypt; set `DOMAIN` and `PUBLIC_BASE_URL`, provision certs with the `certbot` service, and add HSTS (already wired in the prod template) — see [Docker Deployment Guide §6](Docs/DOCKER_DEPLOYMENT_GUIDE.md) |
| **Encryption at rest — object storage (`S3_SSE`)** | `s3_sse=False` (server-side encryption **disabled**; `S3_USE_SSL=false`) | Add `S3_SSE=true` to `.env.prod` (it is **not** in `.env.prod.example` by default — pass it through so MinIO stores documents with `ServerSideEncryption: AES256`, see [storage.py](backend/app/modules/documents/storage.py)). `S3_USE_SSL` may stay `false` only if MinIO is reached over a private network/internal hop — set it `true` if the object store is remote |
| **Encryption at rest — disk/volumes** | Plain Docker volumes | Provision the Postgres data volume, MinIO data volume, and `BACKUP_HOST_PATH` on encrypted disks/filesystems (LUKS, cloud-provider disk encryption, etc.) — see [Docker Deployment Guide §11 checklist](Docs/DOCKER_DEPLOYMENT_GUIDE.md) |
| `MINIO_BROWSER` | console exposed on `:9001` | `off` (already defaulted in [docker-compose.prod.yml](docker-compose.prod.yml)) — never expose the MinIO web console publicly |
| `CORS_ALLOW_ORIGINS` | `http://localhost:8080` | Set to `PUBLIC_BASE_URL` (your real HTTPS origin); a wildcard (`*`) is rejected at startup |
| `LOG_LEVEL` | `DEBUG` | `INFO` — debug logging is more likely to capture request details; `SQL_ECHO` must remain `false` in **every** environment (hard-enforced — SQL parameter logging would leak PHI, SAD §10.1) |
| `AV_SCAN_ENABLED` / `AV_SCAN_COMMAND` | `false` / empty (no scanning) | Consider deploying ClamAV (or similar) and setting `AV_SCAN_ENABLED=true` with `AV_SCAN_COMMAND` so uploaded documents are scanned (see [documents/service.py](backend/app/modules/documents/service.py)) |
| API process model | `uvicorn --reload` (hot reload, single worker, source bind-mounted) | No `--reload`; runs `API_WORKERS` (rule of thumb `(2 × vCPU) + 1`, capped to `API_CPU_LIMIT`) workers from a versioned, immutable image (`IMAGE_TAG`) |
| `FORWARDED_ALLOW_IPS` | `*` (dev: only the local proxy is upstream) | Defaults to `*` (the proxy is the sole ingress); for defence-in-depth, scope it to the proxy's container subnet, e.g. `172.20.0.0/16` |
| Secrets storage | `.env.dev`, gitignored, weak by design | `.env.prod` must be gitignored, `chmod 600`, owned by the deploy user, and contain only generated/strong secrets — never commit it. For higher assurance, migrate to Docker secrets / a secrets manager (SAD §10) |
| Backups | Not configured | Configure `BACKUP_HOST_PATH` (separate/off-server disk), `BACKUP_RETENTION_DAYS`, `BACKUP_CRON_DB`/`BACKUP_CRON_MINIO`, and optionally SMTP/webhook alerting — see [scripts/](scripts/) and [Docker Deployment Guide §9](Docs/DOCKER_DEPLOYMENT_GUIDE.md) |
| Image pinning | Local builds (`API_BUILD_TARGET=dev`, `:latest` tags) | Pin `IMAGE_TAG` to a tested release and pin every third-party image (`POSTGRES_IMAGE`, `MINIO_IMAGE`, etc.) to a specific, vetted version — never `:latest` in prod |

> **Encryption summary:** the dev stack deliberately runs with **both** transport
> encryption (TLS) and storage-level encryption (`S3_SSE`, `S3_USE_SSL`) turned off for
> local convenience. Before going live, confirm: (1) the edge proxy serves HTTPS only
> (HTTP redirects to HTTPS), (2) `S3_SSE=true` is set so documents are encrypted at rest
> in the object store, and (3) the underlying DB/object-store/backup volumes sit on
> encrypted disks. None of these are optional for handling real patient data (SAD §10).

Run through the full [Docker Deployment Guide §11 go-live checklist](Docs/DOCKER_DEPLOYMENT_GUIDE.md)
before pointing real traffic at a production deployment.

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
