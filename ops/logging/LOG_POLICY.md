# ArogyaM PMS — Log Storage, Access & Retention Policy (LOG-T0.3)

**Applies to:** Phase 1 production deployment  
**SAD reference:** §10.1 controls #4, #9  
**Date:** 2026-06-09  

---

## 1. Log Types and Locations

| Log type | Location | Contains PII/PHI? | Access |
|----------|---------|--------------------|--------|
| Application (FastAPI/uvicorn) | `/var/log/arogyam/api/` or Docker stdout | **No** — redacted by `core/logging.py` | `arogyam` service account, Ops |
| Nginx access log | `/var/log/arogyam/nginx/access.log` | **No** — query strings redacted on patient routes (LOG-T0.2) | `arogyam` + `www-data`, Ops |
| Nginx error log | `/var/log/arogyam/nginx/error.log` | No | `arogyam` + `www-data`, Ops |
| Audit log (DB) | `audit_log` PostgreSQL table | **Yes** — only store that may hold PII/PHI | Admins with `view_audit` permission; DBA for backup |
| Backup log (DB) | `backup_log` PostgreSQL table | No | Admins with `backup_control` permission |

---

## 2. Retention Schedule

| Log type | Minimum retention | Rotation | Archive |
|----------|------------------|----------|---------|
| Application logs | **1 year (365 days)** | Daily | Compressed, purged after 365 days |
| Nginx access / error | **1 year (365 days)** | Daily | Compressed, purged after 365 days |
| Audit log (DB) | **1 year minimum** (open question — SAD §27 #9, confirm with clinic legal counsel) | Never purged automatically; manual DBA review | Annual archive export to off-server storage |
| Backup log (DB) | **1 year** | Never purged | Retained with DB backup |

---

## 3. File Permissions

All log files on disk must have **mode 0640** (owner read-write, group read, world none):

```bash
# Apply on the host after initial deploy:
install -d -m 0750 -o arogyam -g arogyam /var/log/arogyam/api /var/log/arogyam/nginx
install -d -m 0750 -o arogyam -g arogyam /var/log/arogyam/api/archive /var/log/arogyam/nginx/archive
chmod 0640 /var/log/arogyam/api/*.log 2>/dev/null || true
chmod 0640 /var/log/arogyam/nginx/*.log 2>/dev/null || true
```

Docker json-file logs live in `/var/lib/docker/containers/<id>/` which is owned by root — **restrict access to that directory** to root + docker group only (default Docker behavior).

---

## 4. Deploying Log Rotation

```bash
# Copy logrotate config to the host:
sudo cp ops/logging/logrotate.conf /etc/logrotate.d/arogyam
sudo chmod 0644 /etc/logrotate.d/arogyam
sudo logrotate -d /etc/logrotate.d/arogyam   # dry-run
sudo logrotate /etc/logrotate.d/arogyam       # force first rotation
```

For Docker json-file logs, rotation is handled by the `max-size` / `max-file` options in `docker-compose.prod.yml` (`x-logging` block) — no host logrotate needed for those.

---

## 5. PII/PHI Controls Reminder

- Application and proxy logs **must never contain** patient names, mobile numbers, OP numbers, DOB, email, or clinical content.  
- The `core/logging.py` redaction filter enforces this for the application layer.  
- The nginx config enforces this for the proxy layer (see `ops/proxy/nginx.conf` — `$uri_no_query` format).  
- The CI log-privacy guard (`tests/test_log_privacy.py`) automatically catches regressions.  
- The **audit_log** table is the only authorised location for PII-bearing records and is accessible only to users with `view_audit` permission.

---

## 6. Audit Log Backup

Audit logs are part of the nightly `pg_dump` (INT-T13.1). Backup retention follows the database backup policy (90-day on-server, 1-year off-server). The restore procedure is documented in `ops/backup/RESTORE_RUNBOOK.md`.
