#!/bin/sh
# =============================================================================
# ArogyaM PMS — PostgreSQL restore (SAD §18, UC-27)
# -----------------------------------------------------------------------------
# Restores a pg_dump custom-format file (.dump) produced by backup-db.sh.
# DESTRUCTIVE: --clean drops existing objects before recreating them. Run only
# by authorized technical personnel; the action is auditable and should be
# performed during a maintenance window with the API stopped.
#
# Usage (inside the backup container or any box with the pg client + access):
#   ./restore-db.sh /backups/db/arogyam_arogyam_20260604_020000.dump
#   FORCE=yes ./restore-db.sh <file>     # skip the interactive confirmation
#
# Env: PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE  (same as backup-db.sh)
#
# Recommended sequence:
#   docker compose -f docker-compose.prod.yml stop api
#   docker compose -f docker-compose.prod.yml run --rm \
#       -v ./scripts:/scripts:ro backup /scripts/restore-db.sh /backups/db/<file>.dump
#   docker compose -f docker-compose.prod.yml start api
# =============================================================================
set -eu

DUMP_FILE="${1:-}"
log() { echo "[restore-db][$(date -u +%FT%TZ)] $*"; }

if [ -z "${DUMP_FILE}" ]; then
    echo "Usage: $0 <path-to-.dump>"; exit 2
fi
if [ ! -f "${DUMP_FILE}" ]; then
    echo "ERROR: file not found: ${DUMP_FILE}"; exit 2
fi

log "target database : ${PGDATABASE} @ ${PGHOST}:${PGPORT}"
log "restore source  : ${DUMP_FILE}"
echo "WARNING: this will DROP and recreate existing objects in '${PGDATABASE}'."

if [ "${FORCE:-no}" != "yes" ]; then
    printf "Type the database name (%s) to proceed: " "${PGDATABASE}"
    read -r CONFIRM
    if [ "${CONFIRM}" != "${PGDATABASE}" ]; then
        echo "Aborted."; exit 1
    fi
fi

log "starting pg_restore..."
# --clean --if-exists: drop objects first; --no-owner/--no-privileges: portable
# across role names; single transaction so a failure leaves the DB unchanged.
PGPASSWORD="${PGPASSWORD}" pg_restore \
    -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
    --clean --if-exists --no-owner --no-privileges \
    "${DUMP_FILE}"

log "restore complete. Verify row counts and run app smoke tests before reopening."