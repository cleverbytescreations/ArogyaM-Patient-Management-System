# Audit Log — Scalability, Retention, and Partitioning Strategy

**Document scope:** Covers everything done (and planned) to keep `audit_log` performant as the
table grows. Phases A and B are implemented and deployed via migration `0011`. Phase C is a
future milestone to be applied when the table approaches 2–5 million rows.

---

## Table of Contents

1. [Background and Problem Statement](#1-background-and-problem-statement)
2. [Table Schema (current)](#2-table-schema-current)
3. [Phase A — BRIN Index on `created_at`](#3-phase-a--brin-index-on-created_at)
4. [Phase B — Retention and Purge Policy](#4-phase-b--retention-and-purge-policy)
   - [Configuration](#41-configuration)
   - [Code Walkthrough](#42-code-walkthrough)
   - [API Endpoint](#43-api-endpoint)
   - [Cron Script](#44-cron-script)
   - [Audit Trail of the Purge Itself](#45-audit-trail-of-the-purge-itself)
5. [How to Apply (step-by-step)](#5-how-to-apply-step-by-step)
6. [Operational Runbook](#6-operational-runbook)
7. [Phase C — Declarative Table Partitioning (future)](#7-phase-c--declarative-table-partitioning-future)
8. [Decision Log](#8-decision-log)

---

## 1. Background and Problem Statement

Every sensitive action in ArogyaM writes one row to `audit_log` — logins, patient
registrations, edits, document uploads, prescription changes, discharges, and more. In a
busy clinic this can easily produce 500–2,000 rows per day, which compounds to:

| Years of data | Estimated rows (500/day) | Estimated rows (2,000/day) |
|---|---|---|
| 1 | ~180,000 | ~730,000 |
| 3 | ~550,000 | ~2.2 million |
| 7 | ~1.3 million | ~5.1 million |

Without any management strategy, problems accumulate:

- **Index bloat**: A B-Tree index on `created_at` grows proportionally to the row count and
  consumes write I/O on every insert, even though the access pattern is almost always a date
  range scan.
- **Table bloat**: PostgreSQL never physically reclaims space from dead tuples unless
  `VACUUM` runs. An unbounded table with no partition boundaries makes VACUUM do proportionally
  more work over time.
- **COUNT(*) latency**: Unfiltered `SELECT COUNT(*)` requires a full sequential or index scan
  across the entire table.
- **Compliance exposure**: Storing audit records indefinitely beyond a mandated retention
  window can be a liability in some regulatory environments.

The strategy below is phased so that each phase only adds the complexity that is actually
needed at the current scale.

---

## 2. Table Schema (current)

```sql
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        REFERENCES users(id),
    user_role   VARCHAR(60),
    action      VARCHAR(40) NOT NULL,
    entity_type VARCHAR(60),
    entity_id   VARCHAR(64),
    patient_id  UUID        REFERENCES patients(id),
    old_value   JSONB,                          -- snapshot before change
    new_value   JSONB,                          -- snapshot after change
    description VARCHAR(255),
    ip_address  INET,
    user_agent  VARCHAR(255),
    request_id  VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Key design choices already in place:**

| Decision | Why it matters |
|---|---|
| `old_value` / `new_value` as `JSONB` | A single generic table covers every entity type without schema changes; JSON paths allow targeted queries inside the payload |
| `BIGSERIAL` primary key | Monotonically increasing with inserts, which is exactly the physical order BRIN needs |
| Append-only (no `UPDATE` / `DELETE` in normal operation) | Rows are always written in `created_at` order — crucial BRIN precondition |
| FK to `users` and `patients` (outbound) | Fully supported on partitioned tables in PostgreSQL 11+ |

**Indexes before migration 0011:**

```sql
CREATE INDEX idx_audit_log_user     ON audit_log (user_id);
CREATE INDEX idx_audit_log_patient  ON audit_log (patient_id);
CREATE INDEX idx_audit_log_entity   ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_created  ON audit_log (created_at);  -- B-Tree (replaced)
```

---

## 3. Phase A — BRIN Index on `created_at`

### What was changed

Migration `0011` drops the B-Tree index on `created_at` and replaces it with a BRIN index:

```sql
-- migration 0011 upgrade
DROP INDEX IF EXISTS idx_audit_log_created;
CREATE INDEX idx_audit_log_created_brin ON audit_log USING BRIN (created_at);
```

```sql
-- migration 0011 downgrade (rollback)
DROP INDEX IF EXISTS idx_audit_log_created_brin;
CREATE INDEX idx_audit_log_created ON audit_log (created_at);
```

**Source:** [backend/app/migrations/versions/0011_audit_log_brin_index.py](../backend/app/migrations/versions/0011_audit_log_brin_index.py)

### Why BRIN instead of B-Tree here

A **B-Tree** index stores one entry per row, sorted by the indexed value. For `created_at` on
an append-only table, those entries are already in sorted order — the B-Tree offers no ordering
benefit that wasn't already present in the heap, yet it must be maintained on every insert and
costs roughly 8–12× more disk space than a BRIN.

A **BRIN (Block Range Index)** stores only the `min` and `max` value for each contiguous range
of 128 heap pages (one "block range"). Because `audit_log` rows are always appended in
`created_at` order, each block range naturally contains a tight date window. A BRIN can
therefore prune the vast majority of the table in a range scan using a tiny structure — often
just a few kilobytes for millions of rows.

| Property | B-Tree | BRIN |
|---|---|---|
| Index size (1M rows) | ~30–50 MB | ~4–8 KB |
| Insert overhead | One page write per insert | None until a new block range fills |
| Range scan (`WHERE created_at BETWEEN ...`) | Efficient | Efficient (skip non-matching ranges) |
| Point lookup (`WHERE created_at = exact`) | Efficient | Not well suited — use B-Tree for that |
| Works if rows inserted out of order | Yes | Degrades significantly |

The `audit_log.created_at` field has `server_default=func.now()` and no path in the
application inserts out-of-order timestamps, so BRIN preconditions are fully satisfied.

### Queries that benefit

All date-range queries in `list_audit_logs` use `from_dt` / `to_dt` filter parameters, which
translate to `created_at >= :from_dt AND created_at <= :to_dt`. PostgreSQL uses the BRIN to
skip block ranges whose `max(created_at) < :from_dt` or `min(created_at) > :to_dt` before
scanning any heap pages.

---

## 4. Phase B — Retention and Purge Policy

### 4.1 Configuration

The retention period is driven by a single environment variable:

```
AUDIT_RETENTION_DAYS=2555
```

**2555 days = 7 years**, chosen as the minimum defensible retention period for a healthcare
system's activity trail. Adjust this value in your `.env` / deployment environment variables.

Setting `AUDIT_RETENTION_DAYS=0` disables all purging — the system will not delete any records
regardless of age, and the purge endpoint/script will return a `skipped=true` response.

The setting is read through pydantic-settings in
[backend/app/core/config.py](../backend/app/core/config.py):

```python
# --- Audit log retention -------------------------------------------------
# Hard-delete audit records older than this many days.
# 2555 days = 7 years (recommended minimum for medical-record compliance).
# Set to 0 to disable automatic purging entirely.
audit_retention_days: int = Field(default=2555)
```

No restart is required after changing this value — the cutoff date is computed at
call-time (`datetime.now(UTC) - timedelta(days=settings.audit_retention_days)`).

### 4.2 Code Walkthrough

The purge follows the same layered architecture as all other modules:

```
router.py  →  service.py  →  repository.py
```

#### Repository ([backend/app/modules/audit/repository.py](../backend/app/modules/audit/repository.py))

Two new functions, both side-effect-free with respect to commits:

```python
def count_expired(db: Session, cutoff: datetime) -> int:
    """Count audit rows with created_at < cutoff. Used for dry-run previews."""
    q = select(func.count()).select_from(
        select(AuditLog.id).where(AuditLog.created_at < cutoff).subquery()
    )
    return db.execute(q).scalar_one()


def delete_expired(db: Session, cutoff: datetime) -> None:
    """Delete audit rows with created_at < cutoff. Does NOT commit."""
    db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
```

`delete_expired` does not call `db.commit()`. Commit responsibility belongs to the service
layer, which is the project-wide pattern (CLAUDE.md: "service calls `db.commit()`").

#### Service ([backend/app/modules/audit/service.py](../backend/app/modules/audit/service.py))

`purge_audit_logs()` handles all logic:

1. Read `settings.audit_retention_days`; return early if `<= 0`
2. Compute `cutoff = now(UTC) - timedelta(days=retention_days)`
3. Count eligible rows via `repo.count_expired()`
4. If not `dry_run` and count > 0:
   - Call `repo.delete_expired()` (staged in session, not yet committed)
   - Write a `PURGE_AUDIT_LOG` audit record in the **same transaction** via `write_audit()`
   - Call `db.commit()` — the delete and the audit record commit atomically
5. Return `{ purged_count, cutoff_before, dry_run, skipped }`

The atomic commit of the delete + the audit record is intentional: if the commit fails,
neither the deletion nor the trace of it persist, leaving the database in a consistent state.

```python
def purge_audit_logs(
    db: Session,
    *,
    dry_run: bool = False,
    actor_payload: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> dict:
    retention_days = settings.audit_retention_days
    if retention_days <= 0:
        return {"purged_count": 0, "cutoff_before": None,
                "dry_run": dry_run, "skipped": True,
                "reason": "AUDIT_RETENTION_DAYS is 0 — purging is disabled"}

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    count = repo.count_expired(db, cutoff)

    if not dry_run and count > 0:
        repo.delete_expired(db, cutoff)
        write_audit(db, action="PURGE_AUDIT_LOG", ...)
        db.commit()

    return {"purged_count": count, "cutoff_before": cutoff.isoformat(),
            "dry_run": dry_run, "skipped": False}
```

### 4.3 API Endpoint

**Endpoint:** `POST /api/v1/audit-logs/purge`

**Permission required:** `backup_control` (Administrator role only)

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `dry_run` | bool | `false` | When `true`, counts eligible records but does not delete |

**Example — dry run:**

```http
POST /api/v1/audit-logs/purge?dry_run=true
Authorization: Bearer <admin-jwt>
```

Response:
```json
{
  "purged_count": 4821,
  "cutoff_before": "2019-06-09T10:30:00+00:00",
  "dry_run": true,
  "skipped": false
}
```

**Example — live purge:**

```http
POST /api/v1/audit-logs/purge
Authorization: Bearer <admin-jwt>
```

Response:
```json
{
  "purged_count": 4821,
  "cutoff_before": "2019-06-09T10:30:00+00:00",
  "dry_run": false,
  "skipped": false
}
```

**Example — retention disabled:**

```json
{
  "purged_count": 0,
  "cutoff_before": null,
  "dry_run": false,
  "skipped": true,
  "reason": "AUDIT_RETENTION_DAYS is 0 — purging is disabled"
}
```

**Source:** [backend/app/modules/audit/router.py](../backend/app/modules/audit/router.py)

### 4.4 Cron Script

For automated, scheduled purges the standalone script
[backend/scripts/purge_audit_log.py](../backend/scripts/purge_audit_log.py) is provided.
It reads the same `AUDIT_RETENTION_DAYS` environment variable as the API, opens its own
database session, and exits with code `0` on success or `1` on error (suitable for cron
alerting).

**Usage:**

```bash
# Dry-run: count eligible records without deleting
docker compose exec api python scripts/purge_audit_log.py --dry-run

# Live purge using the configured AUDIT_RETENTION_DAYS
docker compose exec api python scripts/purge_audit_log.py

# Override retention for this run only (e.g. emergency purge of records older than 1 year)
AUDIT_RETENTION_DAYS=365 docker compose exec api python scripts/purge_audit_log.py
```

**Suggested cron schedule — first Sunday of each month at 02:00 UTC:**

```cron
0 2 1-7 * 0   docker compose exec -T api python scripts/purge_audit_log.py >> /var/log/arogyam-purge.log 2>&1
```

The `-T` flag is required in non-interactive cron environments (disables pseudo-TTY
allocation). Redirect stdout/stderr to a log file for monitoring.

**Sample output (successful run):**

```
[purge_audit_log] retention=2555 days | cutoff=2019-06-09 | dry_run=False
[purge_audit_log] Records eligible for deletion: 4821
[purge_audit_log] Deleted 4821 records. Done.
```

**Sample output (nothing to purge):**

```
[purge_audit_log] retention=2555 days | cutoff=2019-06-09 | dry_run=False
[purge_audit_log] Nothing to purge.
```

### 4.5 Audit Trail of the Purge Itself

Every live purge (whether triggered via the API endpoint or the cron script) writes a
`PURGE_AUDIT_LOG` row to `audit_log` within the same transaction as the delete. This means:

- There is always a record of when a purge ran, who triggered it (for API-triggered purges),
  how many rows were removed, and what the cutoff date was.
- The purge record itself will eventually be purged in 7 years — which is intentional; the
  record is only needed for recent operational traceability.
- If the transaction rolls back for any reason, neither the delete nor the trace of it
  persists.

Example `new_value` stored in the `PURGE_AUDIT_LOG` audit row:

```json
{
  "purged_count": 4821,
  "cutoff_before": "2019-06-09T10:30:00+00:00",
  "retention_days": 2555,
  "triggered_by": "cron_script"
}
```

For API-triggered purges, `triggered_by` is omitted and `user_id` / `user_role` / `ip_address`
are populated from the authenticated request instead.

---

## 5. How to Apply (step-by-step)

### Step 1 — Pull the latest code

```bash
git pull
```

### Step 2 — Set the retention variable

In your `.env.dev` (development) or production environment file, confirm or add:

```
AUDIT_RETENTION_DAYS=2555
```

If the variable is absent, the default of `2555` (7 years) is used automatically. No action
is required unless you need a different value.

### Step 3 — Run the Alembic migration

```bash
docker compose exec api alembic upgrade head
```

This applies migration `0011`, which:
- Drops `idx_audit_log_created` (B-Tree)
- Creates `idx_audit_log_created_brin` (BRIN)

The migration runs in a transaction. If it fails, the original B-Tree index is left in place
and no harm is done. You can verify the result:

```bash
docker compose exec db psql -U arogyam -d arogyam -c \
  "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'audit_log';"
```

You should see `idx_audit_log_created_brin` with `USING brin` in the definition and no
`idx_audit_log_created`.

### Step 4 — Verify the configuration loads correctly

```bash
docker compose exec api python -c \
  "from app.core.config import settings; print('Retention days:', settings.audit_retention_days)"
```

Expected output:

```
Retention days: 2555
```

### Step 5 — Test the API endpoint with a dry run

Obtain an admin JWT token and call the purge endpoint in dry-run mode to confirm it responds
correctly before scheduling live purges:

```bash
TOKEN="<paste admin bearer token>"

curl -s -X POST \
  "http://localhost:8000/api/v1/audit-logs/purge?dry_run=true" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

A response with `"skipped": false` and a `cutoff_before` timestamp confirms the endpoint is
wired correctly. A response with `"skipped": true` means `AUDIT_RETENTION_DAYS=0` — check
your environment file.

### Step 6 — Test the cron script with a dry run

```bash
docker compose exec api python scripts/purge_audit_log.py --dry-run
```

### Step 7 — Schedule the cron job (production)

Add the following entry to the host's crontab (or your Docker cron container):

```cron
0 2 1-7 * 0   docker compose -f /path/to/docker-compose.yml exec -T api \
  python scripts/purge_audit_log.py >> /var/log/arogyam-audit-purge.log 2>&1
```

This runs on the first Sunday of each month at 02:00 UTC (a time with minimal patient
activity). Adjust the schedule to suit your maintenance window.

### Step 8 — To roll back (if needed)

```bash
docker compose exec api alembic downgrade 0010
```

This drops the BRIN index and recreates the original B-Tree index. The retention
configuration is not affected by the Alembic downgrade — it is a code/env concern only.

---

## 6. Operational Runbook

### Check how many records are eligible for deletion today

```bash
docker compose exec api python scripts/purge_audit_log.py --dry-run
```

Or via the API:

```bash
curl -s -X POST "http://localhost:8000/api/v1/audit-logs/purge?dry_run=true" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
```

### Run an immediate live purge (admin decision)

```bash
# Via API
curl -s -X POST "http://localhost:8000/api/v1/audit-logs/purge" \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool

# Via script
docker compose exec api python scripts/purge_audit_log.py
```

### Check the current table size

```bash
docker compose exec db psql -U arogyam -d arogyam -c "
  SELECT
    pg_size_pretty(pg_total_relation_size('audit_log')) AS total_size,
    pg_size_pretty(pg_relation_size('audit_log'))       AS table_size,
    pg_size_pretty(pg_indexes_size('audit_log'))        AS indexes_size,
    (SELECT COUNT(*) FROM audit_log)                    AS row_count;
"
```

### Check index health

```bash
docker compose exec db psql -U arogyam -d arogyam -c "
  SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size
  FROM pg_indexes
  WHERE tablename = 'audit_log';
"
```

### Check the last recorded purge

```bash
docker compose exec db psql -U arogyam -d arogyam -c "
  SELECT created_at, description, new_value
  FROM audit_log
  WHERE action = 'PURGE_AUDIT_LOG'
  ORDER BY created_at DESC
  LIMIT 5;
"
```

### Temporarily disable purging (without redeploying)

Set `AUDIT_RETENTION_DAYS=0` in your environment and restart the API container. The purge
endpoint and cron script will both return `skipped=true` without deleting anything.

---

## 7. Phase C — Declarative Table Partitioning (future)

This phase should be planned when the `audit_log` table approaches **2–5 million rows** or
when `pg_total_relation_size('audit_log')` exceeds **2–4 GB**. At that scale, a single
`DELETE WHERE created_at < :cutoff` statement can take minutes and hold locks that block
concurrent reads.

The solution is PostgreSQL **declarative range partitioning** by `created_at`, with
`pg_partman` managing partition creation and expiry automatically.

### What declarative partitioning provides

- **O(1) partition drops**: Instead of a slow `DELETE`, dropping a monthly partition is
  instantaneous and lock-free for writers on other partitions.
- **Partition pruning**: Queries with a `created_at` range only scan the relevant monthly
  child tables, ignoring all others at the planner level — faster than even a BRIN scan.
- **Independent VACUUM**: Each partition vacuums independently; bloat in old partitions
  does not affect vacuum efficiency on recent partitions.

### High-level migration plan

1. **Add `pg_partman`** to `docker-compose.yml` (or install the extension in the existing
   PostgreSQL container).

2. **Create the new partitioned parent table** with the same schema:

   ```sql
   CREATE TABLE audit_log_p (
       -- same columns as audit_log --
   ) PARTITION BY RANGE (created_at);
   ```

3. **Create initial partitions** (one per month, back-filled to the oldest row):

   ```sql
   SELECT partman.create_parent(
       p_parent_table   => 'public.audit_log_p',
       p_control        => 'created_at',
       p_interval       => '1 month',
       p_premake        => 3
   );
   ```

4. **Migrate existing rows** in batches (to avoid locking the table for a bulk copy):

   ```sql
   INSERT INTO audit_log_p SELECT * FROM audit_log
   WHERE id BETWEEN :batch_start AND :batch_end;
   ```

5. **Rename tables** in a maintenance window:

   ```sql
   ALTER TABLE audit_log RENAME TO audit_log_unpartitioned;
   ALTER TABLE audit_log_p RENAME TO audit_log;
   ```

6. **Configure `pg_partman` retention** to drop partitions older than 7 years:

   ```sql
   UPDATE partman.part_config
   SET retention = '7 years', retention_keep_table = false
   WHERE parent_table = 'public.audit_log';
   ```

7. **Schedule `pg_partman` maintenance** to run nightly:

   ```cron
   0 3 * * *  docker compose exec -T db psql -U arogyam -d arogyam \
     -c "SELECT partman.run_maintenance();"
   ```

### Important constraint note

PostgreSQL 11+ fully supports **outbound foreign key constraints** on partitioned tables
(i.e., `audit_log.user_id → users.id` and `audit_log.patient_id → patients.id`). These
constraints will carry over to the partitioned table without modification.

What is **not** supported is an inbound FK from another table pointing *at* `audit_log`.
ArogyaM has no such constraint, so this is a non-issue.

### SQLAlchemy note

The `AuditLog` ORM model requires no changes for partitioning. SQLAlchemy works against the
parent table transparently; inserts are routed to the correct child partition by PostgreSQL
automatically.

### When NOT to do this yet

Phase C adds real migration complexity — a table rename in a maintenance window, batched data
migration, and a new infrastructure dependency (`pg_partman`). At clinic scale with Phases A
and B in place:

- The BRIN index keeps range scans fast up to tens of millions of rows.
- Monthly purges keep the table bounded at approximately 7 years × rows/day.
- Phase C becomes necessary only if the purge `DELETE` itself starts taking longer than
  acceptable or if storage constraints demand faster partition drops.

Monitor `pg_total_relation_size('audit_log')` quarterly. When it crosses 2 GB, begin
planning Phase C.

---

## 8. Decision Log

| Decision | Rationale |
|---|---|
| BRIN over B-Tree on `created_at` | Rows are always appended in creation order (server_default=now()). BRIN costs ~8× less disk and write overhead for the same range-query coverage. |
| Retention by hard delete (not archive) | At 7-year retention, the data being deleted is very old. The audit record of the purge itself provides a compliance trail. If offline archival is later required, the cron script can be extended to dump a CSV to S3 before deleting. |
| 7 years (2555 days) as default | Commonly cited minimum for healthcare activity logs in many jurisdictions. Administrators can override via `AUDIT_RETENTION_DAYS`. |
| Purge triggered manually / by cron, not on startup | An automatic startup purge would run on every container restart, which is too aggressive. A scheduled monthly run keeps the table bounded without surprise deletions. |
| Purge audit record committed in the same transaction | Guarantees that evidence of what was deleted always exists if the commit succeeded, and is never orphaned if it failed. |
| `PERM_BACKUP_CONTROL` guards the purge endpoint | Purging is an irreversible maintenance action, analogous to backup management. Only administrators carry this permission. |
| Phase C deferred | Table partitioning requires a non-trivial migration (rename in maintenance window). At current scale, Phases A and B provide sufficient headroom for years. Premature partitioning adds complexity without benefit. |
