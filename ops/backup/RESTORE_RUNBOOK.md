# ArogyaM PMS — Restore Runbook (INT-T13.3)

**Audience:** System Administrator / DevOps  
**Purpose:** Step-by-step restore of the ArogyaM database and document store from backup.  
**This is an out-of-band operation — there is no API for restore.**

---

## 1. Pre-Restore Checklist

Before starting a restore:

- [ ] Notify clinic staff — the system will be offline during restore.
- [ ] Identify the backup to restore (check `GET /api/v1/backup/status` or review backup log files in `/var/log/arogyam-backup.log`).
- [ ] Verify the backup file integrity (see §3.1).
- [ ] Confirm you have valid credentials: DB superuser, MinIO admin.
- [ ] Stop the API service: `docker compose -f docker-compose.prod.yml stop api`.

---

## 2. Backup File Locations

| Type      | Location                                   | Naming pattern                          |
|-----------|--------------------------------------------|-----------------------------------------|
| Database  | `$BACKUP_DEST/arogyam_db_YYYYMMDD_HHMMSS.sql.gz` | Compressed pg_dump       |
| Documents | `$BACKUP_DEST/docs_YYYYMMDD_HHMMSS/`        | MinIO mirror directory                  |

`$BACKUP_DEST` is defined in the cron/env config (see `ops/backup/crontab.example`).

---

## 3. Database Restore

### 3.1 Verify backup integrity

```bash
# Check the gzip file is not corrupt
gunzip -t /path/to/arogyam_db_YYYYMMDD_HHMMSS.sql.gz && echo "OK"
```

### 3.2 Create a fresh target database (for disaster recovery)

```bash
# Connect as postgres superuser
psql -U postgres -c "CREATE DATABASE arogyam_restore OWNER arogyam;"
```

For a **full replacement** (same DB name), skip this step — use the existing `arogyam` database name in §3.3.

### 3.3 Restore the dump

```bash
gunzip -c /path/to/arogyam_db_YYYYMMDD_HHMMSS.sql.gz \
  | psql -U arogyam -d arogyam_restore
```

Expected output: a series of `SET`, `CREATE TABLE`, `COPY`, `ALTER TABLE` lines, ending with no errors.

### 3.4 Run Alembic migrations (forward-fix, if restoring to older schema)

If the restore target has a newer codebase than the backup, apply any missing migrations:

```bash
docker compose exec api alembic upgrade head
```

### 3.5 Verify row counts

```bash
psql -U arogyam -d arogyam_restore -c "
  SELECT 'patients' AS tbl, COUNT(*) FROM patients
  UNION ALL SELECT 'visits', COUNT(*) FROM visits
  UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;"
```

Compare counts against pre-incident figures from the audit log or a known good backup.

---

## 4. Document Store Restore (MinIO)

### 4.1 Identify the document backup

```bash
ls -lh $BACKUP_DEST/docs_YYYYMMDD_HHMMSS/
```

### 4.2 Mirror back to MinIO

```bash
export MC_HOST_dest="http://minio:9000"  # or prod MinIO URL
mc mirror --overwrite "$BACKUP_DEST/docs_YYYYMMDD_HHMMSS/" dest/arogyam-documents
```

### 4.3 Verify document count

```bash
mc stat dest/arogyam-documents | grep "Objects"
# Compare against the document count in the restored DB:
# SELECT COUNT(*) FROM documents WHERE status = 'ACTIVE';
```

---

## 5. Post-Restore Validation

1. **Start the API**: `docker compose -f docker-compose.prod.yml start api`
2. **Health check**: `curl https://your-domain/api/v1/ready` — expect `{"status": "ok"}`
3. **Smoke test**: Log in as admin, search for a known patient, open a document.
4. **Audit log check**: Verify `GET /api/v1/audit-logs?limit=5` returns expected recent entries.
5. **Notify staff** the system is back online.

---

## 6. Restore Drill Schedule

A restore drill should be performed:
- **Before R1 go-live** (mandatory per Sprint 5 exit criteria)
- **Quarterly** thereafter on a non-production target

### Drill procedure

1. Provision a clean VM/container with PostgreSQL + MinIO.
2. Copy the most-recent backup artifacts to the drill environment.
3. Follow §3 and §4 above.
4. Run §5 validation steps.
5. Record results in the drill log below.

### Drill log

| Date | Backup used | Restore time | Outcome | Performed by |
|------|-------------|-------------|---------|--------------|
|      |             |             |         |              |

---

## 7. Rollback (API version rollback)

If a code deploy caused the incident:

```bash
# Re-deploy the previous image tag
docker compose -f docker-compose.prod.yml pull api  # tag the previous version
docker compose -f docker-compose.prod.yml up -d api
# If schema change was part of the deploy, run down-migration:
docker compose exec api alembic downgrade -1
```

Prefer forward-fix migrations over downgrade in production unless the schema change is the direct cause of the incident.

---

*Last reviewed: 2026-06-09. Update this runbook after each drill.*
