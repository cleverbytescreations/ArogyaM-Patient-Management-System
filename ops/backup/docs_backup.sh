#!/usr/bin/env bash
# MinIO/document backup script (INT-T13.1)
# Syncs the documents bucket to an off-server target, records in backup_log.
#
# Required env vars:
#   DATABASE_URL        — PostgreSQL URL for backup_log writes (plain postgresql://, NOT +psycopg)
#   MINIO_ENDPOINT      — e.g. http://minio:9000
#   MINIO_ACCESS_KEY    — MinIO/S3 access key
#   MINIO_SECRET_KEY    — MinIO/S3 secret key
#   MINIO_BUCKET        — source bucket name (e.g. arogyam-documents)
#   BACKUP_DEST         — destination path or rclone remote
#
# Optional alerting env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${MINIO_ENDPOINT:?MINIO_ENDPOINT is required}"
: "${MINIO_ACCESS_KEY:?MINIO_ACCESS_KEY is required}"
: "${MINIO_SECRET_KEY:?MINIO_SECRET_KEY is required}"
: "${MINIO_BUCKET:?MINIO_BUCKET is required}"
: "${BACKUP_DEST:?BACKUP_DEST is required}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_TYPE="DOCUMENTS"
STATUS="STARTED"
START_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MESSAGE=""

# Passes values as psql --set variables and reads SQL from stdin so that
# psql's :'varname' interpolation is active (it is NOT active with -c).
# MANUAL_TRIGGER_USER_ID env var (optional) is set by entrypoint.sh when the
# run was triggered via POST /backup/trigger; it is recorded as triggered_by.
_log_to_db() {
    local status="$1" message="${2:-}" completed="${3:-}"
    local trigger_user="${MANUAL_TRIGGER_USER_ID:-}"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstatus=${status}" \
        --set="bmsg=${message}" \
        --set="bstart=${START_TIME}" \
        --set="bcomp=${completed}" \
        --set="btrigger=${trigger_user}" \
        <<SQL 2>/dev/null || true
INSERT INTO backup_log (backup_type, status, message, triggered_by, started_at, completed_at)
VALUES (:'btype', :'bstatus', NULLIF(:'bmsg',''), NULLIF(:'btrigger','')::uuid, :'bstart'::timestamptz, NULLIF(:'bcomp','')::timestamptz);
SQL
}

# Update notification_status on the row written by this run (LOG-T13.1).
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

_log_to_db "STARTED"

# Use mc (MinIO Client) to mirror the bucket.
# mc reads credentials from MC_HOST_<alias> as http://KEY:SECRET@host:port.
_minio_host="${MINIO_ENDPOINT#http://}"
_minio_host="${_minio_host#https://}"
export MC_HOST_src="http://${MINIO_ACCESS_KEY}:${MINIO_SECRET_KEY}@${_minio_host}"
unset _minio_host

DEST_PATH="${BACKUP_DEST}/docs_${TIMESTAMP}"

if mc mirror --overwrite "src/${MINIO_BUCKET}" "${DEST_PATH}"; then
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STATUS="SUCCESS"
    MESSAGE="Documents backup completed: ${DEST_PATH}"
    _log_to_db "SUCCESS" "${MESSAGE}" "${COMPLETED_TIME}"
    echo "[$(date -u)] ${MESSAGE}"
else
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STATUS="FAILED"
    MESSAGE="MinIO mirror failed for bucket ${MINIO_BUCKET}"
    _log_to_db "FAILED" "${MESSAGE}" "${COMPLETED_TIME}"
    echo "[$(date -u)] ERROR: ${MESSAGE}" >&2
fi

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

[ "${STATUS}" = "SUCCESS" ]
