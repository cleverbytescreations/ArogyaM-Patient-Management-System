#!/usr/bin/env bash
# PostgreSQL nightly backup script (INT-T13.1)
# Runs pg_dump, compresses, uploads to off-server target, records in backup_log.
#
# Required env vars:
#   DATABASE_URL        — PostgreSQL connection URL (plain postgresql://, NOT +psycopg)
#   BACKUP_DEST         — destination path or s3://bucket/prefix for rclone
#   DB_NAME             — database name (for pg_dump -d)
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
# Passes values as psql variables (--set) and reads SQL from stdin so that
# psql's :'varname' interpolation is active (it is NOT active with -c).
# NULLIF(:'var','') converts empty strings to SQL NULL.
# MANUAL_TRIGGER_USER_ID env var (optional) is set by entrypoint.sh when the
# run was triggered via POST /backup/trigger; it is recorded as triggered_by.
_log_to_db() {
    local status="$1" message="${2:-}" completed="${3:-}" size="${4:-}" location_ref="${5:-}"
    local size_sql="NULL"
    [ -n "${size}" ] && size_sql="${size}"
    local trigger_user="${MANUAL_TRIGGER_USER_ID:-}"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstatus=${status}" \
        --set="bmsg=${message}" \
        --set="bstart=${START_TIME}" \
        --set="bloc=${location_ref}" \
        --set="bcomp=${completed}" \
        --set="btrigger=${trigger_user}" \
        <<SQL 2>/dev/null || true
INSERT INTO backup_log (backup_type, status, location_ref, size_bytes, message, triggered_by, started_at, completed_at)
VALUES (:'btype', :'bstatus', NULLIF(:'bloc',''), ${size_sql}, NULLIF(:'bmsg',''), NULLIF(:'btrigger','')::uuid, :'bstart'::timestamptz, NULLIF(:'bcomp','')::timestamptz);
SQL
}

# Helper: update notification_status on the row written by this run (LOG-T13.1).
_update_notification() {
    local notif_status="$1"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstart=${START_TIME}" \
        --set="nstatus=${notif_status}" \
        <<SQL 2>/dev/null || true
UPDATE backup_log SET notification_status = :'nstatus'
WHERE backup_type = :'btype' AND started_at = :'bstart'::timestamptz;
SQL
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

# Send email notification and record outcome in backup_log (INT-T13.2 / LOG-T13.1).
# notify.sh exit codes: 0 = sent, 2 = SMTP not configured (skipped), other = failed.
if [ -x "${SCRIPT_DIR}/notify.sh" ]; then
    NOTIFY_EXIT=0
    "${SCRIPT_DIR}/notify.sh" "${BACKUP_TYPE}" "${STATUS}" "${MESSAGE}" || NOTIFY_EXIT=$?
    case "${NOTIFY_EXIT}" in
        0) _update_notification "SENT" ;;
        2) _update_notification "SKIPPED" ;;
        *) _update_notification "FAILED" ;;
    esac
else
    _update_notification "SKIPPED"
fi

# Exit non-zero on failure so cron sees the error
[ "${STATUS}" = "SUCCESS" ]
