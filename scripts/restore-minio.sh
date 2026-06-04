#!/bin/sh
# =============================================================================
# ArogyaM PMS — MinIO / document restore (SAD §18, UC-27)
# -----------------------------------------------------------------------------
# Restores documents from a snapshot directory produced by backup-minio.sh
# back into the live bucket using `mc mirror`.
# DESTRUCTIVE with --remove: objects in the bucket that are NOT in the snapshot
# are deleted so the bucket exactly matches the snapshot. Omit --remove (set
# RESTORE_MODE=merge) to only add/overwrite without deleting.
#
# Usage:
#   ./restore-minio.sh /backups/minio/arogyam-documents_20260604_030000
#   RESTORE_MODE=merge ./restore-minio.sh <snapshot-dir>   # additive restore
#   FORCE=yes ./restore-minio.sh <snapshot-dir>            # skip confirmation
#
# Env: MINIO_ENDPOINT MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET
# =============================================================================
set -eu

SNAPSHOT_DIR="${1:-}"
log() { echo "[restore-minio][$(date -u +%FT%TZ)] $*"; }

if [ -z "${SNAPSHOT_DIR}" ]; then
    echo "Usage: $0 <snapshot-directory>"; exit 2
fi
if [ ! -d "${SNAPSHOT_DIR}" ]; then
    echo "ERROR: directory not found: ${SNAPSHOT_DIR}"; exit 2
fi

MODE="${RESTORE_MODE:-mirror}"   # mirror (exact, deletes extras) | merge (additive)
log "target bucket  : ${MINIO_BUCKET} @ ${MINIO_ENDPOINT}"
log "restore source : ${SNAPSHOT_DIR}"
log "mode           : ${MODE}"

if [ "${MODE}" = "mirror" ]; then
    echo "WARNING: 'mirror' mode will DELETE objects in the bucket that are not in the snapshot."
fi

if [ "${FORCE:-no}" != "yes" ]; then
    printf "Type the bucket name (%s) to proceed: " "${MINIO_BUCKET}"
    read -r CONFIRM
    if [ "${CONFIRM}" != "${MINIO_BUCKET}" ]; then
        echo "Aborted."; exit 1
    fi
fi

mc alias set arogyam "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
mc mb --ignore-existing "arogyam/${MINIO_BUCKET}" >/dev/null

if [ "${MODE}" = "mirror" ]; then
    mc mirror --overwrite --remove "${SNAPSHOT_DIR}" "arogyam/${MINIO_BUCKET}"
else
    mc mirror --overwrite "${SNAPSHOT_DIR}" "arogyam/${MINIO_BUCKET}"
fi

log "restore complete. Verify document access via the app before reopening."