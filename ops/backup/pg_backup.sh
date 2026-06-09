#!/usr/bin/env bash
# PostgreSQL nightly backup script (INT-T13.1)
# Runs pg_dump, compresses, uploads to off-server target, records in backup_log.
#
# Required env vars:
#   DATABASE_URL        — PostgreSQL connection URL
#   BACKUP_DEST         — destination path or s3://bucket/prefix for rclone
#   DB_NAME             — database name (for pg_dump -d)
#   DB_HOST, DB_PORT, DB_USER, PGPASSWORD  — or use DATABASE_URL
#
# Optional env vars (for backup_log writing):
#   BACKUP_LOG_DB_URL   — defaults to DATABASE_URL
#
# Alerting env vars (see notify.sh):
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DEST:?BACKUP_DEST is required}"
: "${DB_NAME:?DB_NAME is required}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="/tmp/arogyam_db_${TIMESTAMP}.sql.gz"
BACKUP_TYPE="DATABASE"
STATUS="STARTED"
START_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MESSAGE=""
SIZE_BYTES=0

# Helper: write a backup_log row via psql.
# Uses psql --set + quoted :'var' syntax to avoid SQL injection from shell variables.
# NULLIF(:'var','') converts empty strings to SQL NULL.
_log_to_db() {
    local status="$1" message="${2:-}" completed="${3:-}" size="${4:-}" location_ref="${5:-}"
    local size_sql="NULL"
    [ -n "${size}" ] && size_sql="${size}"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstatus=${status}" \
        --set="bmsg=${message}" \
        --set="bstart=${START_TIME}" \
        --set="bloc=${location_ref}" \
        --set="bcomp=${completed}" \
        -c "INSERT INTO backup_log (backup_type, status, location_ref, size_bytes, message, started_at, completed_at)
VALUES (:'btype', :'bstatus', NULLIF(:'bloc',''), ${size_sql}, NULLIF(:'bmsg',''), :'bstart', NULLIF(:'bcomp',''));" \
        2>/dev/null || true
}

# Helper: update notification_status on the row written by this run (LOG-T13.1).
_update_notification() {
    local notif_status="$1"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstart=${START_TIME}" \
        --set="nstatus=${notif_status}" \
        -c "UPDATE backup_log SET notification_status = :'nstatus'
WHERE backup_type = :'btype' AND started_at = :'bstart';" \
        2>/dev/null || true
}

# Record STARTED
_log_to_db "STARTED"

# Run pg_dump
if pg_dump "${DATABASE_URL}" | gzip > "${BACKUP_FILE}"; then
    SIZE_BYTES="$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo 0)"
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

    # Upload to destination (supports local path or rclone remote)
    DEST_PATH="${BACKUP_DEST}/arogyam_db_${TIMESTAMP}.sql.gz"
    if [[ "${BACKUP_DEST}" == s3://* ]] || [[ "${BACKUP_DEST}" == *:* ]]; then
        rclone copy "${BACKUP_FILE}" "${BACKUP_DEST}/" --log-level ERROR
    else
        mkdir -p "${BACKUP_DEST}"
        cp "${BACKUP_FILE}" "${DEST_PATH}"
    fi

    STATUS="SUCCESS"
    MESSAGE="Backup completed: ${DEST_PATH}"
    _log_to_db "SUCCESS" "${MESSAGE}" "${COMPLETED_TIME}" "${SIZE_BYTES}" "${DEST_PATH}"
    echo "[$(date -u)] ${MESSAGE}"
else
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STATUS="FAILED"
    MESSAGE="pg_dump failed for database ${DB_NAME}"
    _log_to_db "FAILED" "${MESSAGE}" "${COMPLETED_TIME}"
    echo "[$(date -u)] ERROR: ${MESSAGE}" >&2
fi

# Clean up temp file
rm -f "${BACKUP_FILE}"

# Send email notification and record outcome in backup_log (INT-T13.2 / LOG-T13.1)
if [ -x "${SCRIPT_DIR}/notify.sh" ]; then
    if "${SCRIPT_DIR}/notify.sh" "${BACKUP_TYPE}" "${STATUS}" "${MESSAGE}"; then
        _update_notification "SENT"
    else
        _update_notification "FAILED"
    fi
else
    _update_notification "SKIPPED"
fi

# Exit non-zero on failure so cron sees the error
[ "${STATUS}" = "SUCCESS" ]
