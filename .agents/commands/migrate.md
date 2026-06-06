# /migrate

Generate and apply an Alembic migration for ArogyaM PMS.

## Argument
Pass migration name: `/migrate <name>`

## Instructions

1. Check current migration state:
   ```bash
   cd backend && alembic current
   cd backend && alembic heads
   ```

2. Generate/create the migration:
   ```bash
   cd backend && alembic revision --autogenerate -m "$ARGUMENT"
   ```

3. Review the generated migration in `backend/app/migrations/versions/` before applying:
   - Confirm upgrade creates only expected objects.
   - Confirm downgrade reverses the change safely when possible.
   - Confirm required PostgreSQL extensions, FTS/trigram indexes, and `set_updated_at()` triggers are preserved when relevant.
   - Confirm no destructive data loss unless explicitly requested.

4. Apply:
   ```bash
   cd backend && alembic upgrade head
   ```

5. Verify:
   ```bash
   cd backend && alembic current
   cd backend && python3 -m pytest app/tests/test_migrations.py app/tests/test_ddl_parity.py -q -p no:cacheprovider
   ```

6. If migration fails, do not edit the database manually. Fix the model/migration and rerun the migration workflow.
