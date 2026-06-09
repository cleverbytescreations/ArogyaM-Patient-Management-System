#!/usr/bin/env bash
# =============================================================================
# ArogyaM PMS — controlled migration-on-deploy script (DEV-TF.6)
# =============================================================================
# Purpose:
#   Run `alembic upgrade head` as a controlled pre-rollout step, with
#   safeguards: connection retry, dry-run option, explicit exit codes, and a
#   tamper-evident revision check for CI smoke runs.
#
# Usage (called by entrypoint.sh in the API container, or CI/CD pipeline):
#   ./ops/deploy/migrate.sh                    # apply pending migrations
#   ./ops/deploy/migrate.sh --dry-run          # show pending revisions; no apply
#   ./ops/deploy/migrate.sh --check <revision> # assert current head == <revision>
#
# Exit codes:
#   0  — success (migrations applied, or already at head)
#   1  — migration failed (connection error, script error, or lock timeout)
#   2  — --check: current head does not match expected revision
#
# Environment variables (read from the container env / .env.prod):
#   DATABASE_URL  — psycopg3 connection string (postgresql+psycopg://...)
#   MIGRATE_RETRIES      — number of DB connection retries   (default: 10)
#   MIGRATE_RETRY_DELAY  — seconds between retries           (default: 3)
#   MIGRATE_LOCK_TIMEOUT — Postgres lock_timeout for migrations (default: 60s)
#
# Rollback strategy (see ops/DEPLOYMENT.md §3):
#   1. Re-deploy the previous Docker image tag (API rolls back instantly).
#   2. If the migration added a column / table, run a targeted down-migration:
#        docker compose exec api alembic downgrade -1
#   3. Preference is always forward-fix over rollback (irreversible migrations
#      like data backfills require a new forward migration to correct).
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------
RETRIES="${MIGRATE_RETRIES:-10}"
RETRY_DELAY="${MIGRATE_RETRY_DELAY:-3}"
LOCK_TIMEOUT="${MIGRATE_LOCK_TIMEOUT:-60}"
DRY_RUN=false
CHECK_REV=""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)   DRY_RUN=true; shift ;;
        --check)     CHECK_REV="$2"; shift 2 ;;
        *)           echo "Unknown argument: $1"; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[migrate] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

wait_for_db() {
    local attempt=0
    log "Waiting for database to accept connections …"
    while ! python -c "
import sys, os
try:
    import psycopg
    dsn = os.environ['DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://')
    with psycopg.connect(dsn, connect_timeout=5): pass
    sys.exit(0)
except Exception as e:
    print(f'  not ready: {e}', file=sys.stderr)
    sys.exit(1)
" 2>&1; do
        attempt=$((attempt + 1))
        if [[ $attempt -ge $RETRIES ]]; then
            log "ERROR: database not reachable after $RETRIES attempts — aborting"
            exit 1
        fi
        log "  retry $attempt/$RETRIES in ${RETRY_DELAY}s …"
        sleep "$RETRY_DELAY"
    done
    log "Database is reachable."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
cd /app   # alembic.ini lives here

wait_for_db

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: pending migrations:"
    # 'alembic history -r current:head' shows what would be applied
    alembic history -r "current:head" || true
    log "DRY-RUN complete. No changes made."
    exit 0
fi

if [[ -n "$CHECK_REV" ]]; then
    current=$(alembic current 2>/dev/null | awk '{print $1}')
    if [[ "$current" == "${CHECK_REV}" ]]; then
        log "CHECK OK: head is $current"
        exit 0
    else
        log "CHECK FAILED: expected $CHECK_REV but current head is $current"
        exit 2
    fi
fi

# Apply migrations with a Postgres lock_timeout so a long-running transaction
# on the target table doesn't block the deploy indefinitely.
log "Applying migrations (lock_timeout=${LOCK_TIMEOUT}s) …"
PGOPTIONS="-c lock_timeout=${LOCK_TIMEOUT}s" alembic upgrade head

log "Migration complete."
