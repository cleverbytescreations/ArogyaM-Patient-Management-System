# ArogyaM PMS — Production Deployment Guide (DEV-TF.6 / DEV-TF.8)

**Applies to:** Phase 1 (R1) production deployment  
**Prerequisites:** Docker 24+, Docker Compose v2, a VM/VPS with ≥ 4 vCPU / 8 GB RAM / 40 GB SSD

---

## 1. First-time setup

```bash
# 1. Clone the repo on the server.
git clone <repo-url> /opt/arogyam
cd /opt/arogyam

# 2. Create the prod env file from the example.
cp .env.prod.example .env.prod
# Edit .env.prod: set DOMAIN, SECRET_KEY (≥ 32 chars), DB passwords,
# MinIO credentials, and SMTP settings.
$EDITOR .env.prod

# 3. Create persistent directories with correct ownership.
install -d -m 0750 -o 1000 -g 1000 /opt/arogyam/data/postgres
install -d -m 0750 -o 1000 -g 1000 /opt/arogyam/data/minio
install -d -m 0750 -o 1000 -g 1000 /var/log/arogyam/api
install -d -m 0750 -o 1000 -g 1000 /var/log/arogyam/nginx
install -d -m 0750 -o 1000 -g 1000 /var/www/certbot

# 4. Obtain TLS certificates (one-time, before first prod start).
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d "$DOMAIN"

# 5. Start the full stack.
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## 2. Standard deploy (rolling update)

```bash
cd /opt/arogyam

# Pull new images / rebuild.
git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    build --build-arg APP_VERSION="$(git describe --tags --always)"

# Apply database migrations before rolling the API (zero-downtime window).
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    run --rm api bash ops/deploy/migrate.sh

# Restart API and frontend (proxy stays up throughout).
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    up -d --no-deps api frontend

# Verify healthchecks.
docker compose -f docker-compose.prod.yml ps
curl -sf https://$DOMAIN/api/v1/health | python -m json.tool
curl -sf https://$DOMAIN/healthz
```

---

## 3. Rollback strategy

### A. Application rollback (code only — no schema changes)

```bash
# Re-deploy the last known-good image tag.
IMAGE_TAG=<previous-git-sha>
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    up -d --no-deps api frontend
```

### B. Database schema rollback

**Policy:** prefer a forward-fix migration over a down-migration wherever possible.
Down-migrations are only viable if no production data was written to the new column/table.

```bash
# Inspect current revision.
docker compose -f docker-compose.prod.yml exec api alembic current

# Down one revision (ONLY if data loss is acceptable — coordinate with DBA).
docker compose -f docker-compose.prod.yml exec api alembic downgrade -1
```

### C. Full rollback (catastrophic failure)

1. Stop the stack: `docker compose -f docker-compose.prod.yml down`
2. Restore the database from the last nightly backup (see `ops/backup/RESTORE_RUNBOOK.md`).
3. Redeploy the previous git tag with `git checkout <tag> && docker compose ... up -d`.

---

## 4. TLS certificate renewal

Certificates are renewed automatically by the `certbot` cron container.
Manual renewal if needed:

```bash
docker compose -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.prod.yml exec proxy nginx -s reload
```

---

## 5. Encryption at rest (DEV-TF.8)

| Data | Mechanism | Notes |
|------|-----------|-------|
| PostgreSQL data volume | Host filesystem encryption (LUKS or cloud-provider disk encryption) | Configure at provisioning time — see cloud provider docs |
| MinIO object storage | MinIO SSE-S3 (server-side encryption with an auto-managed KMS key) | Enabled via `MINIO_KMS_SECRET_KEY` env var in `docker-compose.prod.yml` |
| Docker volumes | Inherit host FS encryption | Ensure host disk encryption is enabled before first deploy |

### MinIO SSE-S3 setup

In `.env.prod`:

```dotenv
# Generate a 32-byte random key: openssl rand -hex 32
MINIO_KMS_SECRET_KEY=my-minio-key:<hex-32-byte-key>
```

The `docker-compose.prod.yml` passes `MINIO_KMS_SECRET_KEY` to the MinIO container,
enabling SSE-S3 by default on all new objects. Existing objects are not retroactively
encrypted — if provisioning from an existing dataset, run the MinIO key-rotation tool
(`mc encrypt set sse-s3 local/<bucket>`).

### Host disk encryption (LUKS — Ubuntu/Debian)

```bash
# One-time setup on a new data volume /dev/sdb (adjust to your block device).
cryptsetup luksFormat /dev/sdb
cryptsetup luksOpen /dev/sdb arogyam-data
mkfs.ext4 /dev/mapper/arogyam-data
echo "arogyam-data UUID=$(blkid -s UUID -o value /dev/sdb) /etc/luks/arogyam.key luks" \
    >> /etc/crypttab
# Add /dev/mapper/arogyam-data to /etc/fstab for /opt/arogyam/data mount.
```

---

## 6. Database user (least privilege)

In production the API connects with a **non-superuser** application account.
The DBA creates it after the initial schema is applied:

```sql
-- Run as the postgres superuser once after initial alembic upgrade head.
CREATE USER arogyam_app WITH PASSWORD '<strong-password>';
GRANT CONNECT ON DATABASE arogyam TO arogyam_app;
GRANT USAGE ON SCHEMA public TO arogyam_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arogyam_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arogyam_app;
-- Deny DDL: arogyam_app cannot CREATE TABLE, ALTER TABLE, DROP, etc.
REVOKE CREATE ON SCHEMA public FROM arogyam_app;
```

Set `DATABASE_URL` in `.env.prod` to use `arogyam_app` (not the superuser) after
Alembic migrations complete on first deploy.

---

## 7. Post-deploy smoke checks

```bash
# Health endpoints
curl -sf https://$DOMAIN/api/v1/health
curl -sf https://$DOMAIN/api/v1/ready   # waits for DB + MinIO

# Security headers
curl -sI https://$DOMAIN | grep -E "Strict-Transport|X-Frame|X-Content|Content-Security"

# Log verification (no PII in proxy log)
docker compose -f docker-compose.prod.yml logs proxy | tail -20

# Audit log
docker compose -f docker-compose.prod.yml exec db \
    psql -U arogyam -c "SELECT count(*) FROM audit_log;"
```
