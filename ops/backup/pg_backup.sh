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
LOG_ID=""

# Insert the STARTED row and capture its id for subsequent updates.
# MANUAL_TRIGGER_USER_ID env var (optional) is set by entrypoint.sh when the
# run was triggered via POST /backup/trigger; it is recorded as triggered_by.
_insert_started() {
    local trigger_user="${MANUAL_TRIGGER_USER_ID:-}"
    LOG_ID="$(psql "${DATABASE_URL}" --no-psqlrc -t -A \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstart=${START_TIME}" \
        --set="btrigger=${trigger_user}" \
        <<SQL 2>/dev/null | grep -E '^[0-9]+$' || true
INSERT INTO backup_log (backup_type, status, triggered_by, started_at)
VALUES (:'btype', 'STARTED', NULLIF(:'btrigger','')::uuid, :'bstart'::timestamptz)
RETURNING id;
SQL
    )"
}

# Update the existing STARTED row with final status/details.
_update_log() {
    local status="$1" message="${2:-}" completed="${3:-}" size="${4:-}" location_ref="${5:-}"
    local size_sql="NULL"
    [ -n "${size}" ] && size_sql="${size}"
    [ -z "${LOG_ID}" ] && return
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="lid=${LOG_ID}" \
        --set="bstatus=${status}" \
        --set="bmsg=${message}" \
        --set="bcomp=${completed}" \
        --set="bloc=${location_ref}" \
        <<SQL 2>/dev/null || true
UPDATE backup_log
SET status       = :'bstatus',
    message      = NULLIF(:'bmsg',''),
    completed_at = NULLIF(:'bcomp','')::timestamptz,
    location_ref = NULLIF(:'bloc',''),
    size_bytes   = ${size_sql}
WHERE id = :'lid'::bigint;
SQL
}

# Update notification_status on the same row.
_update_notification() {
    local notif_status="$1"
    [ -z "${LOG_ID}" ] && return
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="lid=${LOG_ID}" \
        --set="nstatus=${notif_status}" \
        <<SQL 2>/dev/null || true
UPDATE backup_log SET notification_status = :'nstatus'
WHERE id = :'lid'::bigint;
SQL
}

# Record STARTED
_insert_started

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
    _update_log "SUCCESS" "${MESSAGE}" "${COMPLETED_TIME}" "${SIZE_BYTES}" "${DEST_PATH}"
    echo "[$(date -u)] ${MESSAGE}"
else
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STATUS="FAILED"
    MESSAGE="pg_dump failed for database ${DB_NAME}"
    _update_log "FAILED" "${MESSAGE}" "${COMPLETED_TIME}"
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
