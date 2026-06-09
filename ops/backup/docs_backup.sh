#!/usr/bin/env bash
# MinIO/document backup script (INT-T13.1)
# Syncs the documents bucket to an off-server target, records in backup_log.
#
# Required env vars:
#   DATABASE_URL        — PostgreSQL URL for backup_log writes
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

# Uses psql --set + :'var' quoting to avoid SQL injection from shell variables.
_log_to_db() {
    local status="$1" message="${2:-}" completed="${3:-}"
    psql "${DATABASE_URL}" --no-psqlrc \
        --set="btype=${BACKUP_TYPE}" \
        --set="bstatus=${status}" \
        --set="bmsg=${message}" \
        --set="bstart=${START_TIME}" \
        --set="bcomp=${completed}" \
        -c "INSERT INTO backup_log (backup_type, status, message, started_at, completed_at)
VALUES (:'btype', :'bstatus', NULLIF(:'bmsg',''), :'bstart', NULLIF(:'bcomp',''));" \
        2>/dev/null || true
}

# Update notification_status on the row written by this run (LOG-T13.1).
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

[ "${STATUS}" = "SUCCESS" ]
