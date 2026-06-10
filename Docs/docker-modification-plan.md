# Docker Compose Split Plan — Dev Stack into Storage + Business (two VMs)

## Goal
Split the single [docker-compose.dev.yml](../docker-compose.dev.yml) into two independently
runnable Compose files that run on **two different VMs**:

1. **`docker-compose.dev-db.yml`** — **Storage VM**: PostgreSQL + MinIO
   (plus the MinIO bucket-init job, since it belongs to storage setup).
2. **`docker-compose.dev-biz.yml`** — **Business VM**: Redis, API, Frontend, Proxy.

Because the two stacks live on **separate hosts**, they cannot share a Docker bridge network
and cannot resolve each other by Compose service name. The business services reach the storage
services over the **network (IP/hostname + published ports)**, not via Docker DNS.

---

## Service allocation

| Service        | Target file / VM          | Notes |
|----------------|---------------------------|-------|
| `db`           | **dev-db.yml** (Storage VM) | Postgres 16 + `pg_data_dev` volume |
| `minio`        | **dev-db.yml** (Storage VM) | MinIO + `minio_data_dev` volume |
| `createbuckets`| **dev-db.yml** (Storage VM) | One-shot bucket init; same VM/network as MinIO |
| `redis`        | **dev-biz.yml** (Business VM) | Cache / rate-limiter / token denylist — ephemeral, lives with app tier |
| `api`          | **dev-biz.yml** (Business VM) | FastAPI hot-reload |
| `frontend`     | **dev-biz.yml** (Business VM) | Vite dev server |
| `proxy`        | **dev-biz.yml** (Business VM) | Nginx dev reverse proxy |

> `createbuckets` stays on the Storage VM with MinIO (Docker DNS `minio:9000` only works on
> that host). `redis` stays on the Business VM with the API for the same reason
> (`api` → `redis` over local Docker DNS).

---

## Core design change: cross-VM communication (replaces shared-network approach)

A single-host shared Docker network is **not** an option across two VMs (a `bridge` network is
host-local; service-name DNS does not span hosts). Instead:

### 1. Each stack keeps its own internal bridge network
- **Storage VM**: `db`, `minio`, `createbuckets` share an internal `arogyam` bridge so the
  bucket-init job can reach `minio:9000` locally.
- **Business VM**: `api`, `redis`, `frontend`, `proxy` share an internal `arogyam` bridge so
  the API reaches `redis:6379` and the proxy reaches `api`/`frontend` locally.
- Networks are **not** external and **not** shared between VMs — each file just keeps a normal
  `arogyam: { driver: bridge }` block, scoped to its own project.

### 2. Storage VM publishes Postgres + MinIO on a reachable interface
The Storage VM must expose ports on the **private network interface the Business VM can reach**
(not just `127.0.0.1`). Use an explicit bind address so the DB/object store are not flapped onto
every interface unintentionally:

```yaml
# docker-compose.dev-db.yml
  db:
    ports:
      - "${STORAGE_BIND_IP:-0.0.0.0}:${POSTGRES_PORT:-5432}:5432"
  minio:
    ports:
      - "${STORAGE_BIND_IP:-0.0.0.0}:${MINIO_API_PORT:-9000}:9000"
      - "${STORAGE_BIND_IP:-0.0.0.0}:${MINIO_CONSOLE_PORT:-9001}:9001"
```

Set `STORAGE_BIND_IP` in the Storage VM's `.env.dev` to its **private IP** (the address the
Business VM routes to), e.g. `STORAGE_BIND_IP=10.0.0.10`.

### 3. Business VM points its config at the Storage VM's IP/hostname
Introduce one new variable, `STORAGE_HOST` (the Storage VM's private IP or DNS name), and build
the connection strings from it in the Business VM's `.env.dev`:

```dotenv
# Business VM .env.dev — STORAGE_HOST is the Storage VM's private IP/hostname
STORAGE_HOST=10.0.0.10

DATABASE_URL=postgresql+psycopg://arogyam:arogyam_dev_pw@${STORAGE_HOST}:5432/arogyam
S3_ENDPOINT_URL=http://${STORAGE_HOST}:9000
```

In `docker-compose.dev-biz.yml`, the `api` environment keeps the same keys but the host comes
from `STORAGE_HOST` instead of the Docker service name `db` / `minio`:

```yaml
  api:
    environment:
      DATABASE_URL: ${DATABASE_URL:-postgresql+psycopg://arogyam:arogyam_dev_pw@${STORAGE_HOST}:5432/arogyam}
      S3_ENDPOINT_URL: ${S3_ENDPOINT_URL:-http://${STORAGE_HOST}:9000}
      # S3 creds / bucket unchanged
```

> **Important:** the literal service names `db` and `minio` must no longer appear in any
> Business-VM connection string — those hostnames don't exist on that VM. Everything routes
> through `STORAGE_HOST`.

### 4. `depends_on` cannot cross VMs (even more so than across projects)
Remove the business stack's cross-host waits:
- `api` → `db` (healthy): **remove**.
- `api` → `createbuckets` (completed): **remove**.
- `api` → `redis` (healthy): **keep** (same VM).
- `proxy` → `api`, `frontend`: **keep** (same VM).

**Mitigation:** start the Storage VM stack first; `api` keeps `restart: unless-stopped`, so it
crash-loops until Postgres/MinIO at `STORAGE_HOST` answer. The bucket already exists because
`createbuckets` ran on the Storage VM.

---

## File-by-file changes

### A. `docker-compose.dev-db.yml` (Storage VM)
- `name: arogyam-dev-db`; keep its own copy of the `x-logging` anchor.
- Services: `db`, `minio`, `createbuckets` (from dev.yml).
- Port bindings use `${STORAGE_BIND_IP}` prefix (section 2 above).
- `volumes:` keeps `pg_data_dev`, `minio_data_dev`.
- `networks:` stays a local `arogyam: { driver: bridge }`.

### B. `docker-compose.dev-biz.yml` (Business VM)
- `name: arogyam-dev-biz`; keep its own copy of the `x-logging` anchor.
- Services: `redis`, `api`, `frontend`, `proxy` (from dev.yml) with edits:
  - `api.environment`: `DATABASE_URL` / `S3_ENDPOINT_URL` derive from `STORAGE_HOST` (section 3).
  - `api.depends_on`: keep only `redis: { condition: service_healthy }`.
  - `CORS_ALLOW_ORIGINS` unchanged (still the browser-facing proxy origin).
  - `proxy`, `frontend` unchanged.
- No `volumes:` block needed.
- `networks:` stays a local `arogyam: { driver: bridge }`.

### C. Original `docker-compose.dev.yml`
- Leave in place as the single-host all-in-one option. No edits required.

---

## Security / networking requirements (cross-VM)
Splitting onto two VMs moves Postgres and MinIO traffic onto the network, so:

- **Use a private network** between the VMs (VPC/private subnet, VPN, or Tailscale). Do **not**
  expose 5432 / 9000 on a public interface.
- **Firewall the Storage VM** to allow inbound `5432`/`9000`(/`9001`) **only** from the Business
  VM's IP. Bind with `STORAGE_BIND_IP` set to the private interface, not `0.0.0.0`, where possible.
- Postgres/MinIO credentials in `.env.dev` are dev defaults — rotate before this layout is used
  with anything resembling real data (this stack is still DEVELOPMENT-only per the file header).
- **TLS:** dev traffic is plaintext. For an untrusted link between VMs, terminate Postgres/MinIO
  behind TLS or tunnel over the VPN; revisit for any non-dev use.
- **Document/signature downloads are API-proxied (confirmed in code) — no browser→MinIO link
  needed.** `GET /documents/{id}/content` and `GET /users/{id}/signature` return a
  `StreamingResponse`; the API reads MinIO server-side via `storage.stream()` (boto3
  `get_object`). The frontend fetches blobs from `/content` (`documentsApi.getContent`); it
  never receives an object-store URL. Therefore `S3_ENDPOINT_URL` (→ `STORAGE_HOST:9000`) only
  has to be reachable from the **Business VM's API container**, which this plan already ensures.
  The browser does **not** need to reach the Storage VM.
- **Latent presigned endpoint (note, not a blocker):** `GET /documents/{id}/download-url`
  (TTL 300s) and the unused frontend `getDownloadUrl` wrapper still exist. They are **not called
  by the UI today.** If that path is ever enabled, the presigned URL embeds `STORAGE_HOST:9000`,
  which a browser on the private subnet likely cannot reach — at that point either keep using
  the proxied `/content` stream, or make MinIO reachable from the browser (e.g. front it via the
  proxy). No action required for the current proxied flow.

---

## Usage after the split

```bash
# ---- On the STORAGE VM ----
# .env.dev: STORAGE_BIND_IP=<storage-private-ip>
docker compose -f docker-compose.dev-db.yml --env-file .env.dev up -d
#   -> db healthy, minio healthy, createbuckets exits 0 (bucket ready, private)

# ---- On the BUSINESS VM ----
# .env.dev: STORAGE_HOST=<storage-private-ip>, DATABASE_URL/S3_ENDPOINT_URL via STORAGE_HOST
docker compose -f docker-compose.dev-biz.yml --env-file .env.dev up --build
#   -> redis healthy; api connects to STORAGE_HOST:5432 / :9000; proxy serves :8080

# restart only the app tier during development (storage VM untouched):
docker compose -f docker-compose.dev-biz.yml --env-file .env.dev restart api

# tear down (per VM)
docker compose -f docker-compose.dev-biz.yml --env-file .env.dev down            # Business VM
docker compose -f docker-compose.dev-db.yml  --env-file .env.dev down            # Storage VM, keep data
docker compose -f docker-compose.dev-db.yml  --env-file .env.dev down -v         # Storage VM, wipe data
```

---

## Connectivity validation (run from the Business VM)
- [ ] `nc -vz $STORAGE_HOST 5432` and `nc -vz $STORAGE_HOST 9000` succeed (firewall/route OK).
- [ ] `psql "postgresql://arogyam:...@$STORAGE_HOST:5432/arogyam" -c 'select 1'` succeeds.
- [ ] `curl -sf http://$STORAGE_HOST:9000/minio/health/live` returns OK.
- [ ] API `/api/v1/health` returns 200 (proves DB + S3 reachable cross-VM).
- [ ] Document upload writes to MinIO on the Storage VM; download path works (proxied or
      presigned — see security note).
- [ ] `redis` healthy on the Business VM; rate-limiter / token denylist function.
- [ ] Restarting the Business VM stack does not disturb Postgres/MinIO data on the Storage VM.

---

## Notes / trade-offs
- **New env var `STORAGE_HOST`** (Business VM) and **`STORAGE_BIND_IP`** (Storage VM) are the
  only additions to `.env.dev`. Document both in `.env.dev.example`.
- **No cross-VM `depends_on`** — ordering is operator-driven (Storage VM first); the API's
  restart policy covers the startup race.
- **Volume names** become `arogyam-dev-db_pg_data_dev` / `..._minio_data_dev` on the Storage VM.
  First run starts with an empty DB — re-seed via the existing seed scripts (or pin external
  named volumes to reuse data).
- **Latency:** cross-VM DB/S3 calls add network round-trips vs. the single-host stack. Keep the
  two VMs on the same low-latency private subnet.
- The `x-logging` anchor is duplicated in each file by necessity (YAML anchors don't span files).
- Original `docker-compose.dev.yml` remains the recommended single-host dev path.
