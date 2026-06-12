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
    local status="$1" message="${2:-}" completed="${3:-}" location_ref="${4:-}"
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
    location_ref = NULLIF(:'bloc','')
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

_insert_started

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
    _update_log "SUCCESS" "${MESSAGE}" "${COMPLETED_TIME}" "${DEST_PATH}"
    echo "[$(date -u)] ${MESSAGE}"
else
    COMPLETED_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    STATUS="FAILED"
    MESSAGE="MinIO mirror failed for bucket ${MINIO_BUCKET}"
    _update_log "FAILED" "${MESSAGE}" "${COMPLETED_TIME}"
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
