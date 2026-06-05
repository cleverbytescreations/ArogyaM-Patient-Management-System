#!/bin/sh
# Run Alembic migrations before starting the API so every docker startup applies
# pending revisions automatically. Fails fast if the DB is unreachable.
set -e
echo "[entrypoint] Running database migrations..."
alembic upgrade head
echo "[entrypoint] Migrations complete. Starting API server..."
exec "$@"