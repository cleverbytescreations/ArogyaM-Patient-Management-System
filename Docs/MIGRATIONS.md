# ArogyaM PMS — Alembic Migration Discipline

**Source:** `Docs/PHASE_1_API_TASK_CHECKLIST.md` task DB-T0.4  
**Applies to:** All backend schema changes in Phase 1 and beyond.

---

## 1. Alembic is the single source of truth

`Docs/DDL_DATAMODEL.sql` is the human-readable reference for the initial schema; Alembic owns the authoritative migration chain that actually creates and evolves the database. Never apply schema changes directly with `psql` or a DB GUI — always go through a migration revision.

---

## 2. Creating a new migration

### Step 1 — Verify the current head before writing the revision

```bash
cd backend
docker exec arogyam-dev-api-1 alembic heads
```

The output gives you the revision ID to use as `down_revision`. **Never hard-code a revision ID without running this first.**

### Step 2 — Create the revision file

```bash
# Inside the API container (or with DATABASE_URL set locally):
alembic revision -m "short_description_of_change"
```

This creates a new file in `backend/app/migrations/versions/`.

### Step 3 — Write `upgrade()` and `downgrade()`

- `upgrade()` applies the change (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.)
- `downgrade()` **must fully reverse** the upgrade (DROP TABLE, DROP COLUMN, DROP INDEX, etc.)
- Use `op.execute(...)` for DDL that SQLAlchemy's `op.*` helpers don't cover.
- For Phase 1, prefer explicit `op.execute()` migrations over autogenerate — autogenerate misses triggers, custom functions, GIN indexes, and generated columns.

### Step 4 — Chain the revision correctly

Set `down_revision` to the **current head** returned in Step 1. Example:

```python
revision: str = "0003"
down_revision: Union[str, Sequence[str], None] = "0002"  # verified head
```

### Step 5 — Apply and verify

```bash
# Apply:
alembic upgrade head

# Verify upgrade ran cleanly, then test the downgrade:
alembic downgrade -1    # one step back
alembic upgrade head    # confirm re-apply also works
```

---

## 3. Migration rules (non-negotiable)

| Rule | Rationale |
|------|-----------|
| Every schema change ships as a reviewed Alembic revision | Enables repeatable deploys and tested rollback |
| `downgrade()` is always provided | Required for the migration test (TST-T0.3) and rollback |
| Seed data goes in a dedicated `0002_seed.py`-style revision, not in `upgrade()` of the schema revision | Keeps DDL and DML concerns separate |
| No hardcoded revision IDs — always call `alembic heads` first | Prevents a silent branch split in the migration chain |
| Prefer forward-fix in production over rolling back | Rollback of data migrations is often unsafe; new revision forward-fixes instead |
| `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` makes migrations re-runnable in dev | Avoids failures on partial-apply dev environments |

---

## 4. Automatic migration on container startup

`backend/entrypoint.sh` runs `alembic upgrade head` before the API process starts. This means:
- Every `docker compose up` automatically applies pending migrations.
- The CI deploy step does the same before switching traffic.

---

## 5. Multi-branch readiness (Phase 1 constraint)

Phase 1 operates as a **single-branch** deployment (one clinic). **Do not add `branch_id` to any table yet.**  
However, keep repositories and services free of hard-coded single-branch assumptions so a nullable `branch_id` can be introduced in a future revision without restructuring:

- ✅ Query by `patient_id`, `user_id`, etc. — no hard-coded site/clinic identifiers.
- ✅ No `WHERE clinic = 'ArogyaM'` clauses or similar hard-coded filters.
- ✅ Service signatures accept only what the domain requires.
- ❌ Do not store a hard-coded clinic or branch value in any row or query.

When `branch_id` is introduced later, it will be a **new Alembic revision** that adds a nullable column and a DB-level default, requiring no application logic rewrites.

---

## 6. Naming convention

| What | Convention | Example |
|------|------------|---------|
| Revision filename | `<rev>_<slug>.py` (slug max 40 chars, set in `alembic.ini`) | `0003_add_users_mobile_index.py` |
| Revision ID | Sequential 4-digit integer string | `"0003"` |
| Index names | `idx_<table>_<column(s)>` | `idx_patients_mobile` |
| Constraint names | `pk_/fk_/uq_/ck_` prefix | `fk_visits_patient` |
| Trigger names | `trg_<table>_<purpose>` | `trg_patients_updated_at` |

---

## 7. Quick reference

```bash
# List current migration history:
alembic history --verbose

# Show current DB head:
alembic current

# Show pending migrations:
alembic heads

# Apply all pending:
alembic upgrade head

# Roll back one step:
alembic downgrade -1

# Roll back to base (all the way):
alembic downgrade base
```

---

*End of Migration Discipline Guide — ArogyaM PMS.*
