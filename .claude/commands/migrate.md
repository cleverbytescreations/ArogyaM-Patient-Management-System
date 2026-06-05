# /migrate

Generate and apply an Alembic migration inside Docker.

## Argument
Pass migration name: `/migrate <name>` (e.g. `/migrate add_patients_table`)

## Instructions

> All Alembic commands run **inside Docker** via `docker compose exec api`.
> Never edit the DB schema directly — always go through Alembic.

1. Check current state:
   ```bash
   docker compose exec api alembic current
   ```

2. Generate:
   ```bash
   docker compose exec api alembic revision --autogenerate -m "$ARGUMENT"
   ```
   The generated file lands in `backend/app/migrations/versions/`.

3. **Review the generated file** before applying:
   - Confirm `upgrade()` creates expected tables/columns/indexes
   - Confirm `downgrade()` reverses cleanly
   - Verify FTS/trgm/GIN indexes are present where the DDL specifies them
   - Confirm `set_updated_at()` trigger is attached to new tables that need it
   - Long migration files: read only the upgrade/downgrade functions, not the full header

4. Apply:
   ```bash
   docker compose exec api alembic upgrade head
   ```

5. Verify:
   ```bash
   docker compose exec api alembic current
   ```

6. If migration fails:
   ```bash
   docker compose exec api alembic downgrade -1
   ```
   Fix the model or migration file, then regenerate. Never edit an already-applied migration.

7. Run the DDL parity test to confirm migration matches the DDL baseline:
   ```bash
   docker compose exec api pytest tests/test_ddl_parity.py -x -q --tb=short 2>&1 | tail -20
   ```