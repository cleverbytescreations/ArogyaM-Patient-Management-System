#!/bin/sh
# =============================================================================
# ArogyaM PMS — PostgreSQL backup (SAD §18, UC-26)
# -----------------------------------------------------------------------------
# Creates a timestamped, compressed pg_dump (custom format), prunes backups
# older than the retention window, optionally records the run in the backup_log
# table, and alerts on failure. Designed to run on a cron schedule inside the
# `backup` container, but is also runnable by hand for an ad-hoc backup.
#
# Env (provided by docker-compose.prod.yml):
#   PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
#   BACKUP_DIR (default /backups)   BACKUP_RETENTION_DAYS (default 14)
#   BACKUP_LOG_TO_DB (true/false)   ALERT_WEBHOOK_URL (optional)
#
# IMPORTANT: backup output contains PHI — it is stored on the backups volume,
# which must have restricted permissions and ideally encryption at rest.
# =============================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DB_DIR="${BACKUP_DIR}/db"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUTFILE="${DB_DIR}/arogyam_${PGDATABASE}_${STAMP}.dump"

log() { echo "[backup-db][$(date -u +%FT%TZ)] $*"; }

alert() {
    # Best-effort failure notification. SMTP wiring is the app's responsibility;
    # here we POST to an optional webhook if configured.
    msg="$1"
    log "ALERT: ${msg}"
    if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
        wget -q -O- --post-data="{\"service\":\"arogyam-backup-db\",\"status\":\"FAILED\",\"message\":\"${msg}\"}" \
            --header="Content-Type: application/json" "${ALERT_WEBHOOK_URL}" || true
    fi
}

record_db() {
    # Optionally append a row to backup_log (append-only audit of backups).
    [ "${BACKUP_LOG_TO_DB:-false}" = "true" ] || return 0
    status="$1"; location="$2"; started="$3"; completed="$4"
    PGPASSWORD="${PGPASSWORD}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
        -v ON_ERROR_STOP=0 -q -c \
        "INSERT INTO backup_log (backup_type, status, location_ref, started_at, completed_at)
         VALUES ('DATABASE', '${status}', '${location}', '${started}', '${completed}');" \
        >/dev/null 2>&1 || log "warn: could not write backup_log row"
}

mkdir -p "${DB_DIR}"
STARTED="$(date -u +%FT%TZ)"
log "starting pg_dump of '${PGDATABASE}' from ${PGHOST}:${PGPORT} -> ${OUTFILE}"

# -Fc = custom format (compressed, supports selective/parallel restore).
if PGPASSWORD="${PGPASSWORD}" pg_dump -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" \
        -d "${PGDATABASE}" -Fc -f "${OUTFILE}"; then
    SIZE="$(du -h "${OUTFILE}" | cut -f1)"
    COMPLETED="$(date -u +%FT%TZ)"
    log "OK (${SIZE})"
    record_db "SUCCESS" "${OUTFILE}" "${STARTED}" "${COMPLETED}"
else
    rm -f "${OUTFILE}" || true
    record_db "FAILED" "${OUTFILE}" "${STARTED}" "$(date -u +%FT%TZ)"
    alert "pg_dump failed for database ${PGDATABASE}"
    exit 1
fi

# --- Retention: delete dumps older than RETENTION_DAYS ----------------------
log "pruning dumps older than ${RETENTION_DAYS} day(s)"
find "${DB_DIR}" -name 'arogyam_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete || true

log "done"