# ArogyaM PMS — Docker Deployment Guide

**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Version:** 1.0
**Date:** 2026-06-04
**Status:** For Review
**Source References:**
- `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` (SAD v1.0 — esp. §4, §10, §18, §20)
- `Docs/PHASE1_IMPLEMENTATION_PLAN.md` (Plan §13 Deployment)
- `Docs/API_SPECIFICATION_OPENAPI.md` (base path `/api/v1`, health/ready probes)
- `Docs/DDL_DATAMODEL.sql` (extensions, `backup_log` table)

**Intended Audience:** Developers · DevOps · Tech Lead

> This guide covers the Docker/DevOps configuration only. It does **not** include
> application source code, Dockerfiles, or Alembic migrations — those are added in
> their respective build steps. It tells you how to run the stack locally and how
> to roll it out securely on a single Linux VM (SAD §18, ADR §26).

---

## 1. What gets deployed

Per SAD §5/§18, ArogyaM Phase 1 is a **modular monolith** of small containers:

| Service | Image | Dev | Prod | Purpose |
|---------|-------|:---:|:----:|---------|
| `proxy` | nginx | ✅ (HTTP) | ✅ (HTTPS) | Reverse proxy, TLS termination, security headers, PII-safe logs |
| `frontend` | React SPA | ✅ (Vite dev) | ✅ (static via own nginx) | Staff web UI |
| `api` | FastAPI | ✅ (reload) | ✅ (registry image) | REST API (`/api/v1`) |
| `db` | postgres:16 | ✅ | ✅ | Primary datastore + FTS |
| `minio` | minio | ✅ | ✅ | Document object storage |
| `createbuckets` | minio/mc | ✅ | ✅ | One-shot: create private bucket (readiness gate) |
| `redis` | redis:7 | ✅ | ✅ | Cache / login rate-limit / token denylist |
| `certbot` | certbot | — | ✅ | Let's Encrypt issuance/renewal |
| `backup` | alpine + tools | — | ✅ | Scheduled DB + document backups with retention |

**Deliberately excluded** (SAD §2.7, §13): Kubernetes, Kafka, Elasticsearch/
OpenSearch. Search is PostgreSQL FTS + `pg_trgm`. Documents live in MinIO, never
in the database.

### File inventory

```
docker-compose.dev.yml      # local developer stack (HTTP, hot reload)
docker-compose.prod.yml     # single-VM production stack (HTTPS, backups)
.env.dev.example            # dev env template      -> copy to .env.dev
.env.prod.example           # prod env template     -> copy to .env.prod
nginx/nginx.dev.conf        # dev proxy (HTTP)
nginx/nginx.prod.conf       # prod proxy (TLS template, envsubst ${DOMAIN})
scripts/backup-db.sh        # pg_dump + retention + backup_log + alert
scripts/backup-minio.sh     # mc mirror snapshot + retention
scripts/restore-db.sh       # pg_restore (guarded, interactive)
scripts/restore-minio.sh    # mc mirror restore (guarded, interactive)
Docs/DOCKER_DEPLOYMENT_GUIDE.md   # this file
```

---

## 2. Recommended hardware

Sizing follows SAD §2.6 assumptions (single branch, ≤15–20 concurrent users,
peak ≤30, modest data, documents <10 MB). Confirm against the SAD §27 open
questions before locking the VM size.

### 2.1 Developer machine (dev)

| | CPU | RAM | Disk |
|---|---|---|---|
| Minimum | 2 vCPU | 4 GB | 10 GB free |
| Recommended | 4 vCPU | 8 GB | 20 GB free (SSD) |

Keep it light: Redis is enabled in dev but remains small and ephemeral; the
database and MinIO use Alpine images; bind mounts give hot reload without
rebuilds.

### 2.2 Production VM (single Linux host)

| | CPU | RAM | Disk |
|---|---|---|---|
| Minimum | 2 vCPU | 4 GB | 50 GB SSD + separate backup disk |
| Recommended | 4 vCPU | 8 GB | 100 GB SSD (data) + ≥100 GB backup/offsite volume |

Indicative per-service limits (set in `.env.prod`, enforced via
`deploy.resources.limits`):

| Service | CPU | RAM | Notes |
|---------|-----|-----|-------|
| db | 2.0 | 2 GB | |
| api | 2.0 | 1.5 GB | multi-worker FastAPI — see below |
| minio | 1.0 | 1 GB | |
| redis | 0.5 | 384 MB | |
| frontend | 0.5 | 128 MB | static SPA via Nginx |
| proxy | 0.5 | 128 MB | TLS edge |

**FastAPI workers (multi-core).** The `api` container runs several worker
processes so it actually uses the multi-core CPU instead of pinning one core.
The image entrypoint (Gunicorn/Uvicorn) reads the standard `WEB_CONCURRENCY`
variable, which the compose file feeds from `API_WORKERS` in `.env.prod`:

| VM size | vCPU | `API_WORKERS` | `API_CPU_LIMIT` | `API_MEM_LIMIT` |
|---------|------|---------------|-----------------|-----------------|
| Minimum | 2 | 2 | 1.5 | 1 GB |
| Recommended | 4 | 4 | 2.0 | 1.5 GB |

Rule of thumb for this I/O-bound API: `workers = (2 × vCPU) + 1`, then cap it so
the worker count stays within `API_CPU_LIMIT` (roughly one worker per ~0.5 vCPU)
and budget ~256 MB RAM per worker. Defaults ship tuned for the recommended box
(4 workers); lower `API_WORKERS` to `2` on the minimum 2 vCPU VM.

> Scaling path (SAD §23): vertical first (more CPU/RAM, then raise `API_WORKERS`).
> The API is stateless, so horizontal scaling behind the proxy is a later,
> no-rewrite step.

**Host prerequisites:** 64-bit Linux, Docker Engine 24+ and the Docker Compose v2
plugin, a DNS A/AAAA record pointing `DOMAIN` at the VM, and inbound 80/443 open.

### 2.3 Database engine — why PostgreSQL, and how to make it lighter

A recurring question is whether to swap PostgreSQL for something "lighter." The
short answer: **keep Postgres and tune it down** — it is the recommended path for
this system. The reasoning is recorded here so it does not get re-litigated.

**Postgres is not the weight problem.** The `DB_MEM_LIMIT=2g` in `.env.prod` is a
*ceiling, not consumption*. `postgres:16-alpine` idles at ~30–50 MB RAM and a few
hundred MB on disk at our data scale (single branch, ≤30 peak users, modest
data). "Lighter" here means a smaller ceiling, not real savings.

**The schema is deeply Postgres-coupled.** `Docs/DDL_DATAMODEL.sql` depends on:

- Extensions: `uuid-ossp`, `pgcrypto`, `pg_trgm`, `citext`
- `tsvector` + GIN full-text search and `pg_trgm` fuzzy/partial patient search
- `CITEXT` case-insensitive username/email
- Triggers (`updated_at`; the concurrency-safe OP-number sequence, UC-29)
- `TIMESTAMPTZ`, `SMALLSERIAL`, server-side UUID generation

Switching engines means rewriting search, case-insensitivity, ID generation, and
triggers — plus re-validation for a PHI system.

**Options considered:**

| Option | Lighter? | Verdict |
|--------|----------|---------|
| **Tune Postgres down** (lower limits + `shared_buffers`) | Yes, in practice | **Recommended** — keeps every feature, zero rewrite, smaller real footprint. |
| **SQLite** (+ WAL, + SQLCipher for encryption-at-rest) | Yes, genuinely | Only real "light" engine, but big architectural cost — see below. |
| **MariaDB / MySQL** | No | Comparable/heavier footprint *and* still a rewrite. No benefit. |
| **DuckDB / embedded analytical** | Yes | Wrong tool — analytical, not transactional OLTP. |

**Why SQLite is the only real contender — and its catch.** It would drop the
separate `db` container (in-process file), but it collides with existing
decisions:

1. **Multi-worker API.** We run 4 FastAPI workers (`API_WORKERS`); SQLite is
   single-writer, so concurrent worker writes serialize and hit `SQLITE_BUSY`.
   WAL mode helps reads, not concurrent writes.
2. **No network/container isolation.** The DB currently sits behind the API on
   the internal `backend` network; SQLite becomes a file on a shared volume —
   different backup, locking, and access model.
3. **Encryption at rest** needs SQLCipher (stock SQLite has none); not optional
   for PHI.
4. **Schema rewrite** of the Postgres-specific features listed above.

**Recommended action — keep Postgres, make it lean.** In `.env.prod`:

```diff
- DB_MEM_LIMIT=2g
+ DB_MEM_LIMIT=1g        # or 512m on the 2-vCPU minimum box
```

…and pass conservative Postgres memory settings, e.g. add to the `db` service:

```yaml
    command:
      - "postgres"
      - "-c"
      - "shared_buffers=128MB"
      - "-c"
      - "effective_cache_size=512MB"
      - "-c"
      - "work_mem=8MB"
      - "-c"
      - "max_connections=50"        # size to API_WORKERS x pool + headroom
```

This yields the smaller footprint people are after while keeping full-text
search, ACID, concurrent multi-worker writes, roles, and encryption options —
with no schema rewrite. Reconsider SQLite only if the deployment ever becomes
genuinely single-writer / read-mostly and the PHI encryption + schema-rewrite
costs are accepted.

---

## 3. Quick start — Development

```bash
# 1. Configure
cp .env.dev.example .env.dev          # tweak ports if needed

# 2. Launch (build + run). Redis starts by default for rate limiting/token denylist.
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build

# 3. Open
#    App (via proxy):   http://localhost:8080
#    API docs:          http://localhost:8080/api/v1/docs  (FastAPI Swagger)
#    MinIO console:     http://localhost:9001

# 4. Stop (keep data) / wipe data
docker compose -f docker-compose.dev.yml --env-file .env.dev down
docker compose -f docker-compose.dev.yml --env-file .env.dev down -v   # wipes volumes
```

> The `api` and `frontend` services build from `./backend` and `./frontend`,
> which are created in the application-code step. Until those exist (with their
> Dockerfiles exposing `dev` build stages), comment those two services out and
> bring up just `db` + `minio` + `createbuckets` to develop against the data tier.

> **Frontend dependency changes — recreate the `node_modules` volume.**
> The `frontend` service bind-mounts `./frontend` over `/app` and keeps
> `/app/node_modules` as an *anonymous volume* (so host `node_modules` doesn't
> shadow the container's). That volume persists across rebuilds, so after anyone
> adds/updates a dependency in `frontend/package.json` (e.g. Tailwind), a plain
> `up --build` keeps the **stale** `node_modules` and the dev server fails with
> errors like `Failed to load PostCSS config: Cannot find module 'tailwindcss'`.
> Fix by renewing the anonymous volume so the freshly built deps are used:
>
> ```bash
> docker compose -f docker-compose.dev.yml --env-file .env.dev \
>   up -d --build --renew-anon-volumes frontend
> ```
>
> (`down -v` also clears it, but that additionally wipes the Postgres/MinIO data
> volumes — prefer `--renew-anon-volumes` when you only need to refresh deps.)

---

## 4. Quick start — Production

```bash
# On the VM, as the deploy user, from the repo root:

# 1. Configure secrets (replace every CHANGE_ME)
cp .env.prod.example .env.prod
chmod 600 .env.prod
openssl rand -hex 32        # generate JWT_SECRET_KEY, DB/redis/minio passwords

# 2. Prepare the backup disk (must match BACKUP_HOST_PATH)
sudo mkdir -p /mnt/backup-disk/arogyam
sudo chown "$(id -u):$(id -g)" /mnt/backup-disk/arogyam

# 3. Pull the tested, versioned images
docker compose -f docker-compose.prod.yml --env-file .env.prod pull

# 4. Obtain TLS certificates (one-time — see §6)

# 5. Start the stack
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 6. Verify
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
curl -fsS https://$DOMAIN/api/v1/health
```

---

## 5. Configuration & secrets (SAD §10)

- **No secrets in images or compose files.** All credentials come from
  `.env.dev` / `.env.prod`, which are gitignored. Only the `*.example`
  templates are committed.
- `.env.prod` must be `chmod 600` and owned by the deploy user.
- Generate strong values: `openssl rand -hex 32`.
- Rotate `JWT_SECRET_KEY`, DB, MinIO, and Redis credentials on a schedule and on
  any suspected exposure.
- For higher assurance, migrate these to **Docker secrets** or a secret manager
  (Vault/cloud) — the compose env keys map 1:1 to secret files.
- The internal data tier (`db`, `minio`, `redis`) is on an `internal: true`
  Docker network and is **not published** to the host. Only `proxy` exposes
  80/443. Reach MinIO's console (if ever needed) via an SSH tunnel, not a public
  port.

---

## 6. TLS / HTTPS with Let's Encrypt (SAD §18)

The prod `proxy` serves the ACME http-01 challenge from a shared `acme_webroot`
volume; the `certbot` service renews every 12h. First issuance is a one-time
manual step.

```bash
# Pre-req: DNS for $DOMAIN points at the VM and port 80 is reachable.

# 1. Start the proxy so it can serve the ACME challenge over HTTP.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d proxy

# 2. Issue the certificate (replace email/domain or rely on .env.prod $DOMAIN).
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" --email admin@arogyam.example.com --agree-tos --no-eff-email

# 3. Reload the proxy to pick up the new certs.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec proxy nginx -s reload
```

- The nginx prod config is an **envsubst template**: `${DOMAIN}` is injected at
  container start; nginx runtime variables (`$host`, `$uri`, …) are left intact.
- TLS 1.2/1.3 only; HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  and a baseline CSP are set. **Tighten the CSP** to your real asset/API origins
  before go-live.
- HTTP→HTTPS redirect is automatic (except the ACME path).

---

## 7. Database migrations on deploy (Plan §7/§13)

Alembic owns the schema; `Docs/DDL_DATAMODEL.sql` is the human-readable baseline.
Run migrations as a **controlled step before** the API rolls out:

```bash
# Example (the api image ships alembic; adjust the command to your entrypoint):
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api \
  alembic upgrade head
```

Then `up -d` the `api`. Required extensions (`uuid-ossp`, `pgcrypto`, `pg_trgm`,
`citext`) are created by the baseline migration and are present in the official
Postgres image. Seed roles / lookups / OP sequences per Plan §7; create the first
admin user with a secure, non-committed script.

---

## 8. Health, readiness & startup ordering

- **Liveness:** `GET /api/v1/health`. **Readiness:** `GET /api/v1/ready`
  (checks DB + object-storage connectivity → `503` if a dependency is down).
- Container healthchecks: Postgres (`pg_isready`), MinIO (`/minio/health/live`),
  Redis (`redis-cli ping`), API (Python urllib probe — no curl dependency),
  proxy/frontend (`wget --spider`).
- **`depends_on` uses conditions, not just order** (Plan §13): the API waits for
  `db: service_healthy`, `createbuckets: service_completed_successfully`, and
  `redis: service_healthy`. The proxy waits for the API and frontend to be
  healthy. The `createbuckets` job loops until MinIO answers, so it is the
  authoritative storage-readiness gate.

> **MinIO healthcheck note:** some MinIO image builds don't bundle `curl`, which
> can make the healthcheck report "unhealthy" even when MinIO is fine. Because
> `createbuckets` independently waits for MinIO and the API depends on *that*
> job completing, startup is still correctly gated. If the healthcheck bothers
> you, pin a MinIO release that includes `curl` or remove that healthcheck block.

---

## 9. Logging & PII/PHI safety (SAD §10.1, §20)

- All services log to **stdout/stderr**, captured by Docker's `json-file` driver
  with size/file rotation (configured in both compose files). Tail with:
  `docker compose -f docker-compose.prod.yml logs -f <service>`.
- The **application** is responsible for PII/PHI redaction in its own logs
  (allow-listed structured fields, redaction filter, `SQL_ECHO=false`,
  `LOG_LEVEL=INFO` in prod). The compose env sets `SQL_ECHO=false` — **never**
  enable SQL echo in production; it would print PHI parameters.
- The **nginx** access-log format (`noquery`) logs the normalized path `$uri`
  only — query strings (OP numbers, mobiles, search terms) are dropped from
  proxy logs, satisfying SAD §10.1 control #7.
- The **only** place permitted to hold patient/clinical detail is the
  `audit_log` table (admin-only), not any log stream.
- Backups and their snapshots contain PHI — keep the backups volume on a
  restricted, ideally encrypted, off-server disk.

---

## 10. Backup & recovery (SAD §18, UC-26/27)

### 10.1 What runs automatically

The `backup` sidecar runs busybox cron with two jobs (schedules from
`.env.prod`):

| Job | Default schedule | Script | Output |
|-----|------------------|--------|--------|
| Database | `0 2 * * *` (02:00) | `backup-db.sh` | `${BACKUP_DIR}/db/arogyam_<db>_<ts>.dump` (pg_dump custom format) |
| Documents | `0 3 * * *` (03:00) | `backup-minio.sh` | `${BACKUP_DIR}/minio/<bucket>_<ts>/` (mc mirror snapshot) |

- **Retention:** both prune anything older than `BACKUP_RETENTION_DAYS`
  (default 14).
- **Destination:** the `backups` volume should bind to an **off-server / external
  disk** via `BACKUP_HOST_PATH` (an absolute, pre-existing path). This is the DR
  copy — a backup on the same disk as the data is not a backup.
- **Run record + alert (UC-26):** with `BACKUP_LOG_TO_DB=true`, the DB backup
  appends a row to `backup_log` (type/status/location/timestamps). On failure,
  if `ALERT_WEBHOOK_URL` is set, the script POSTs a JSON alert. SMTP email
  alerting is wired by the application layer.

### 10.2 Ad-hoc backup

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup /scripts/backup-db.sh
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup /scripts/backup-minio.sh
```

### 10.3 Restore runbook (test this before go-live — SAD §25)

Restores are **destructive** and admin-only. Perform in a maintenance window
with the API stopped.

```bash
# --- Database ---
docker compose -f docker-compose.prod.yml --env-file .env.prod stop api
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup \
  /scripts/restore-db.sh /backups/db/arogyam_arogyam_<timestamp>.dump
# (type the DB name to confirm, or set FORCE=yes)

# --- Documents ---
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backup \
  /scripts/restore-minio.sh /backups/minio/arogyam-documents_<timestamp>
# mirror mode (exact) by default; RESTORE_MODE=merge for additive-only

# --- Bring the API back ---
docker compose -f docker-compose.prod.yml --env-file .env.prod start api
```

Verify row counts, document access, and run an app smoke test before reopening.

> **DR drill:** schedule a periodic restore test into a throwaway database/bucket
> to prove backups are valid and the runbook works (SAD §25 risk: untested
> restore).

---

## 11. Operations cheatsheet

```bash
# Status / logs
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api

# Deploy a new release (promote a tested image tag — Plan §13)
#   set IMAGE_TAG=vX.Y.Z in .env.prod, then:
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm api alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Rollback: set IMAGE_TAG back to the previous tag and `up -d` (favor forward-fix;
# DB rollback via tested backup / down-migration).

# Reload proxy after a cert renewal or config change
docker compose -f docker-compose.prod.yml --env-file .env.prod exec proxy nginx -s reload
```

---

## 12. Security checklist before go-live

- [ ] All `CHANGE_ME` values in `.env.prod` replaced with strong secrets; file is `chmod 600`, gitignored.
- [ ] `JWT_SECRET_KEY`, DB, MinIO, Redis passwords are unique and random.
- [ ] Image tags pinned to the exact versions tested in UAT (`IMAGE_TAG`, `MINIO_IMAGE`, …).
- [ ] TLS issued; HTTP→HTTPS redirect verified; HSTS + security headers present; CSP tightened.
- [ ] `SQL_ECHO=false`, `LOG_LEVEL=INFO`, debug off; nginx access logs show no query strings.
- [ ] Data tier not published to host; only 80/443 open on the firewall.
- [ ] Backups landing on a separate/off-server disk; **restore drill performed**.
- [ ] Encryption at rest enabled on the data + backup disks (filesystem/disk
      encryption or MinIO SSE) per SAD §10.
- [ ] First admin user created via a secure, non-committed script; default creds removed.
- [ ] `backup_log` rows appearing; failure alerting (webhook/SMTP) verified.

---

*End of Docker Deployment Guide — ArogyaM Patient Management System (Phase 1), v1.0.*
