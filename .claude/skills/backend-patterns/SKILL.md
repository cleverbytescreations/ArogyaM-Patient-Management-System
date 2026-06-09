---
name: backend-patterns
description: Use for FastAPI backend design, module structure, services, repositories,
  sync SQLAlchemy patterns, background tasks, caching, security, and API conventions.
---

# Backend Patterns

Use this skill when the task involves:
- Adding or modifying a backend module (router, service, repository, model, schema)
- SQLAlchemy query patterns, session management, or transaction handling
- Pydantic v2 schema design or validation rules
- RBAC dependency usage, permission checks, or record-level guards
- Audit logging, log-redaction compliance, or error-handling patterns
- Background task design (FastAPI background tasks, future Redis RQ)
- Redis integration (rate limiting, token denylist, master data cache)
- Master data / reference data read-through caching
- MinIO/S3 document upload or download logic
- Alembic migration authoring or review

## Backend Baseline

Preferred stack:
- FastAPI ≥ 0.115 (sync endpoints — no `async def` in route handlers unless I/O-bound)
- SQLAlchemy 2.x sync (`Session`, `sessionmaker`) — NOT the async engine
- Pydantic v2 (schemas in `schemas.py`; `model_config = ConfigDict(from_attributes=True)`)
- Alembic for all schema migrations
- psycopg3 (`psycopg[binary]`) as the DB driver — direct connection, no pooler in Phase 1
- argon2/bcrypt password hashing via `passlib`
- python-jose for JWT issue/verify
- ruff (lint) + mypy (type-check) — both must pass clean before committing

## Backend Architecture Rule

Use clean layering inside each domain module:

1. **Router** — `backend/app/modules/<domain>/router.py`
   HTTP concerns only: parse request, enforce RBAC dependency, call service, return response.
   Injects `db: Session = Depends(get_db)` and passes it to the service.

2. **Service** — `backend/app/modules/<domain>/service.py`
   Business logic, orchestration, state machine transitions, audit writes, `db.commit()`.
   Receives `db: Session` as a parameter from the router. Calls `db.commit()` after mutations.
   Passes `db` into repository functions. Never contains `select()`/`insert()`/`update()`/`delete()`.

3. **Repository** — `backend/app/modules/<domain>/repository.py`
   All SQLAlchemy queries. Receives `db: Session` as the first parameter.
   Returns ORM model instances or scalar values. No `db.commit()` inside repositories.

4. **Model** — `backend/app/modules/<domain>/models.py`
   SQLAlchemy ORM definitions only. Inherits from `app.core.db.Base`.

5. **Schema** — `backend/app/modules/<domain>/schemas.py`
   Pydantic v2 request/response models.

**Flow:** Router → Service → Repository → Model.
`get_db` is only called via `Depends` in the router. Sessions are never opened inside a service
or repository.

## API Design Rules
- All endpoints under `/api/v1/…` with domain-grouped routers registered in `app/main.py`
- Response models: Pydantic schemas with `ConfigDict(from_attributes=True)` for ORM serialization
- snake_case JSON, ISO-8601 timestamps, UUID identifiers throughout
- Pagination envelope: `{ "items": [...], "total": N, "page": N, "page_size": N }`
- Error envelope: `{ "error": { "code": "...", "message": "...", "details": {...} } }`
- HTTP status codes: 400 validation, 401 unauth, 403 forbidden, 404 not found, 409 version conflict, 422 pydantic, 500 internal (no internals in body)
- File uploads: multipart with server-side type allow-list (PDF/JPG/JPEG/PNG) + size limit

## Service Layer Rules
- Service functions receive `db: Session` as the first parameter (passed by the router)
- One service module per domain: `backend/app/modules/<domain>/service.py`
- Services own business logic, validation, state transitions, audit writes, and `db.commit()`
- Services may call repositories from multiple domains within one session for cross-domain orchestration
- Services must NOT contain `select()`, `insert()`, `update()`, or `delete()` — all queries go to the repository
- Services write to `audit_log` via `core/audit.py::write_audit()` before `db.commit()`
- Version-conflict check: compare client-supplied `version` with `entity.version`; raise `VersionConflictError` on mismatch

## Repository Layer Rules
- One file per domain: `backend/app/modules/<domain>/repository.py`
- All functions receive `db: Session` as the first parameter; return ORM model(s) or scalar values
- No business logic in repositories — only query construction, execution, and result mapping
- No `HTTPException` in repositories — raise `ValueError` or return `None`; the service decides how to handle it
- Repositories are stateless — use module-level functions, not class instances
- Never call `db.commit()` inside a repository — sessions are committed by the service
- Always use SQLAlchemy 2.x `select()` / `insert()` / `update()` / `delete()` constructs via `db.execute()`

Canonical function signatures:
```python
def get_by_id(db: Session, entity_id: uuid.UUID) -> Model | None: ...
def list_with_filters(db: Session, filters: FilterSchema, limit: int, offset: int) -> tuple[list[Model], int]: ...
def create(db: Session, entity: Model) -> None: ...           # add to session; service flushes/commits
def update(db: Session, entity: Model, changes: dict) -> Model: ...
def delete(db: Session, entity: Model) -> None: ...           # soft-delete via status flag
```

## Session Pattern (confirmed from existing code)
```python
# router.py
@router.post("/resource", response_model=ResourceOut)
def create_resource(
    body: ResourceCreate,
    request: Request,
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ResourceOut:
    require_permission("create_resource")(payload)
    return service.create_resource(db, body, payload, request)

# service.py
def create_resource(db: Session, body: ResourceCreate, actor_payload: dict, request=None) -> ResourceOut:
    # ... business logic ...
    repo.create(db, entity)
    db.flush()
    write_audit(db, action="CREATE", ...)
    db.commit()
    return _to_out(entity)
```

## OP Numbering Pattern (critical — UC-04/UC-29)
```python
# Always inside the patient-registration transaction
op_row = db.execute(
    select(OpSequence).where(OpSequence.category_code == category).with_for_update()
).scalar_one()
op_row.last_sequence += 1
op_number = f"{op_row.prefix}{str(op_row.last_sequence).zfill(op_row.padding_width)}"
# patient insert + op_row update committed together
```
Never generate an OP number outside a DB transaction. Never call the sequence from outside
the patient-registration service.

## Async / Background Task Rules
Use FastAPI background tasks for lightweight fire-and-forget work (backup alerts, audit
supplementary actions). Do NOT block request/response cycles with heavy work.

Typical pattern:
```python
@router.post("/backup/trigger")
def trigger_backup(background_tasks: BackgroundTasks, ...) -> dict:
    background_tasks.add_task(run_backup_job)
    return {"status": "queued"}
```

Heavy tasks (PDF generation, future OCR, batch embedding) are deferred to Stage 8 (Full-Scope)
using Redis RQ. See **architecture-deep-dive skill → Event / Async Layer** for the full strategy.

## Redis Rules
Redis is optional (`--profile cache`). Gate all Redis calls on `settings.redis_url` being set.
When absent, fall back to the in-process store (see `core/ratelimit.py` / `core/cache.py`).

**Use Redis for:**
- Rate-limit counters on login (`core/ratelimit.py`)
- JWT `jti` denylist for logout/revocation (`core/tokens.py`)
- Read-through cache for quasi-static reference data (`core/cache.py`) — master data types and OP sequences

**Do NOT use Redis for:** data that must survive a process restart, user session state, or
application state that belongs exclusively in PostgreSQL.

## Master Data Cache Pattern

All `GET` endpoints for quasi-static reference data (master data types, OP sequences, and any
similar admin-only lookup tables added in future) **must** use the read-through cache in
`core/cache.py`. Do not hit PostgreSQL on every request for data that almost never changes.

### Freshness strategy — two layers, both required

1. **Explicit invalidation on every write** — call `cache_delete` in the service *after*
   `db.commit()` whenever an admin mutates the data (create, update, deactivate). This is the
   primary mechanism: users see fresh data immediately after an admin action.

2. **TTL safety-net expiry** — pass `ttl_sec=settings.master_data_cache_ttl_sec` (default 1800 s
   / 30 min, override via `MASTER_DATA_CACHE_TTL_SEC` env var) to every `cache_set` call. This
   catches edge-cases where invalidation was missed (e.g. direct DB patch, future bulk import)
   and prevents stale data sitting in cache indefinitely.

Both layers must be present. A TTL alone is not enough (stale for up to 30 min after an admin
edit visible in the UI is unacceptable). Explicit invalidation alone is not enough (a missed
write path leaves stale data forever).

### Rules
- Use `cache_get` / `cache_set` / `cache_delete` from `app.core.cache` — never import `redis` directly in service files
- Cache key format: `masterdata:{type}:all` and `masterdata:{type}:active` (one key per filter variant)
- Always pass `ttl_sec=settings.master_data_cache_ttl_sec` to `cache_set`
- Call `cache_delete` for all key variants of the affected type **after** `db.commit()`
- Serialize to/from JSON using `model_dump(mode="json")` / `model_validate()` on the Pydantic output
  schema — plain `model_dump()` leaves `datetime`/`UUID` fields as Python objects, which `json.dumps`
  cannot serialize (`TypeError: Object of type datetime is not JSON serializable`)
- The in-process fallback in `cache.py` is TTL-aware (uses `time.monotonic()`); it covers single-worker dev but multi-worker prod **must** set `REDIS_URL`

### Canonical service pattern
```python
from app.core.cache import cache_delete, cache_get, cache_set
from app.core.config import settings

# list (read-through)
def list_items(db: Session, data_type: str, active_only: bool = False) -> list[ItemOut]:
    key = f"masterdata:{data_type}:{'active' if active_only else 'all'}"
    cached = cache_get(key)
    if cached is not None:
        return [ItemOut.model_validate(row) for row in json.loads(cached)]
    result = [_to_out(i) for i in repo.list_by_type(db, data_type, active_only=active_only)]
    cache_set(key, json.dumps([r.model_dump() for r in result]), ttl_sec=settings.master_data_cache_ttl_sec)
    return result

# write — invalidate after commit (explicit invalidation + TTL both in play)
def create_item(db: Session, ...) -> ItemOut:
    ...
    db.commit()
    cache_delete(f"masterdata:{data_type}:all", f"masterdata:{data_type}:active")
    return _to_out(item)
```

See [core/cache.py](backend/app/core/cache.py) for the full helper implementation and
`MASTER_DATA_CACHE_TTL_SEC` in [core/config.py](backend/app/core/config.py) for the TTL setting.

## MinIO / Document Rules
- Stream uploads directly to MinIO via boto3/minio client; never buffer full file in memory
- Store only metadata (`storage_ref`, `file_name`, `document_type`, etc.) in PostgreSQL
- Downloads: permission check → stream bytes via proxy endpoint OR generate short-lived pre-signed URL
- File-type validation: allow-list PDF/JPG/JPEG/PNG (extension + content-type sniffing); reject all others
- File-size limit: `settings.upload_max_mb` (default 10 MB)
- Never expose MinIO bucket URLs directly to the client

## Append-Only / Time-Series Table Patterns

Apply these patterns to every table that is strictly append-only and grows without bound
over time — `audit_log`, `backup_log`, future `notification_log`, `email_log`, event
tables, etc. The patterns work together as a stack: BRIN keeps reads fast, retention
keeps the table bounded, and the purge design keeps compliance evidence intact.

### Index choice: BRIN, not B-Tree, on `created_at`

When a table is always appended in timestamp order (`server_default=func.now()`, no
out-of-order inserts), use a **BRIN** index on `created_at` — not a B-Tree.

```sql
-- correct for append-only tables
CREATE INDEX idx_<table>_created_brin ON <table> USING BRIN (created_at);

-- avoid — wastes ~8-12× disk/write I/O on an already-ordered column
CREATE INDEX idx_<table>_created ON <table> (created_at);
```

BRIN stores only `min`/`max` per 128-page block range. Because rows are physically
written in `created_at` order, each block range contains a tight date window — the
planner skips entire blocks outside any date-range filter at a tiny fraction of
B-Tree's storage cost. Revert to B-Tree only if out-of-order inserts become possible.

### Retention configuration

Expose the retention window as a pydantic-settings env var; compute the cutoff at
call-time, never store it:

```python
# core/config.py
<table>_retention_days: int = Field(default=2555)  # 7 years; 0 = disabled

# service or script
cutoff = datetime.now(tz=timezone.utc) - timedelta(days=settings.<table>_retention_days)
```

`0` means purging is disabled — return early with `skipped=True` rather than deleting
everything.

### Repository: count and delete (no commit in repo)

```python
def count_expired(db: Session, cutoff: datetime) -> int:
    """Dry-run safe: counts rows without deleting."""
    q = select(func.count()).select_from(
        select(Model.id).where(Model.created_at < cutoff).subquery()
    )
    return db.execute(q).scalar_one()

def delete_expired(db: Session, cutoff: datetime) -> None:
    """Stages DELETE in the session. Caller (service) commits."""
    db.execute(delete(Model).where(Model.created_at < cutoff))
```

### Service: atomic delete + audit trace

Count, delete, write a `PURGE_<TABLE>` audit record, and `db.commit()` in a **single
transaction**. If the commit fails, neither the deletion nor the evidence of it persists.

```python
def purge_records(
    db: Session,
    *,
    dry_run: bool = False,
    actor_payload: dict | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_id: str | None = None,
) -> dict:
    retention_days = settings.<table>_retention_days
    if retention_days <= 0:
        return {"purged_count": 0, "cutoff_before": None, "dry_run": dry_run,
                "skipped": True, "reason": "<TABLE>_RETENTION_DAYS is 0 — purging is disabled"}

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)
    count = repo.count_expired(db, cutoff)

    if not dry_run and count > 0:
        repo.delete_expired(db, cutoff)
        write_audit(
            db,
            action="PURGE_<TABLE>",
            entity_type="<table>",
            user_id=actor_payload["sub"] if actor_payload else None,
            user_role=",".join(actor_payload.get("roles", [])) if actor_payload else None,
            new_value={"purged_count": count, "cutoff_before": cutoff.isoformat(),
                       "retention_days": retention_days},
            description=f"Purged {count} records older than {cutoff.date().isoformat()}",
            ip_address=ip_address, user_agent=user_agent, request_id=request_id,
        )
        db.commit()

    return {"purged_count": count, "cutoff_before": cutoff.isoformat(),
            "dry_run": dry_run, "skipped": False}
```

### API endpoint: admin-only with `dry_run` safety

Gate the purge endpoint behind `PERM_BACKUP_CONTROL` (admin-only maintenance action).
Always expose `?dry_run=true` so operators can preview impact before committing.

```python
@router.post("/purge", summary="Purge records older than retention period (admin only)")
def purge_records(
    payload: Annotated[dict, Depends(require_permission(PERM_BACKUP_CONTROL))],
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    dry_run: bool = Query(default=False, description="Count only, do not delete"),
) -> dict:
    ip, ua, rid = extract_request_meta(request)
    return svc.purge_records(db, dry_run=dry_run, actor_payload=payload,
                             ip_address=ip, user_agent=ua, request_id=rid)
```

### Cron script (`backend/scripts/purge_<table>.py`)

Standalone script for scheduled execution. Must:
- Accept `--dry-run` flag
- Read settings from the same env vars as the API via `SessionLocal()`
- Exit `0` on success, `1` on error (enables cron alerting)

```python
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.db import SessionLocal
from app.core.config import settings
from app.modules.<domain> import repository as repo

def main(dry_run: bool) -> None:
    cutoff = datetime.now(tz=UTC) - timedelta(days=settings.<table>_retention_days)
    with SessionLocal() as db:
        count = repo.count_expired(db, cutoff)
        if not dry_run and count > 0:
            repo.delete_expired(db, cutoff)
            write_audit(db, action="PURGE_<TABLE>", ..., triggered_by="cron_script")
            db.commit()
```

Suggested monthly cron (first Sunday, 02:00 UTC):
```cron
0 2 1-7 * 0  docker compose exec -T api python scripts/purge_<table>.py >> /var/log/purge.log 2>&1
```

Use `-T` in non-interactive cron environments (disables pseudo-TTY allocation).

### Purge response envelope

All purge endpoints return a consistent shape:
```json
{
  "purged_count": 4821,
  "cutoff_before": "2019-06-09T10:30:00+00:00",
  "dry_run": false,
  "skipped": false
}
```
When retention is disabled (`<TABLE>_RETENTION_DAYS=0`): `purged_count=0`,
`cutoff_before=null`, `skipped=true`, plus a `reason` string.

### Declarative partitioning escalation

When `pg_total_relation_size('<table>')` exceeds **2 GB** or the row count exceeds
**2–5 million**, begin planning `pg_partman` monthly range partitioning. At that scale
a retention `DELETE` can take minutes and hold locks; partition drops are O(1) and
lock-free. See **architecture-deep-dive skill → Append-Only Table Scale Strategy** for
trigger criteria and
[Docs/audit-log-declarative-table-partitioning.md](../../../Docs/audit-log-declarative-table-partitioning.md)
for the full migration plan.

---

## Audit Logging Rules
Every sensitive action must call `write_audit()` from `app/core/audit.py`:
```python
write_audit(
    db,
    action="CREATE" | "UPDATE" | "VIEW" | "UPLOAD" | "EXPORT" | "LOGIN" | "MERGE" | ...,
    user_id=actor_id,
    user_role=",".join(roles),
    entity_type="patient" | "user" | "document" | ...,
    entity_id=str(entity.id),
    old_value={...},   # dict, not an ORM object
    new_value={...},
    description="...",
    ip_address=ip,
    user_agent=ua,
    request_id=rid,
)
db.commit()  # audit write and business mutation committed together
```
`audit_log` is the ONLY place permitted to hold patient-identifying or clinical detail. All
other logs use the allow-listed structured fields only (see **CLAUDE.md → Principles**).

## Security Rules
- Endpoint RBAC: use `require_permission("perm_name")` dependency from `core/dependencies.py`
- Deny-by-default: endpoints without an explicit permission dependency must be explicitly justified
- Record-level guards: ownership/role checks inside the service after fetching the entity
- Passwords: argon2/bcrypt via `core/security.py::hash_password()` / `verify_password()`
- JWT: issued and verified by `core/security.py` and `core/tokens.py`; short access TTL (~15 min), refresh ~8 h
- No secrets in code; all config from environment via `core/config.py::settings`

## Performance Rules
- Paginate all list endpoints (`limit` + `offset`; return `total`)
- Use indexed columns for filters: `op_number`, `mobile`, `full_name` (FTS/trgm), `visit_date`, `status`
- Avoid N+1: use `selectinload` / `joinedload` on relationships needed in the response
- `echo=False` always; `settings.sql_echo` must be `False` in all non-debug environments

## Error Handling Rules
- Structured errors: raise domain exceptions from `core/errors.py` (`NotFoundError`, `ConflictError`,
  `VersionConflictError`, `AuthError`, `AccountDisabledError`, `AccountLockedError`)
- Global exception handler in `core/errors.py` maps these to proper HTTP status + envelope
- Never leak internal details (stack traces, SQL) in API responses — log internally with `request_id` only
- 409 for version conflicts; 404 for not found; 403 for RBAC; 401 for unauth