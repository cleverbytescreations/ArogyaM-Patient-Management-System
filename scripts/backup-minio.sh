#!/bin/sh
# =============================================================================
# ArogyaM PMS — MinIO / document backup (SAD §18, UC-26)
# -----------------------------------------------------------------------------
# Mirrors the documents bucket into a timestamped snapshot directory on the
# backups volume, then prunes snapshots older than the retention window.
# Uses `mc mirror` (incremental: only changed/new objects are copied).
#
# Env (provided by docker-compose.prod.yml):
#   MINIO_ENDPOINT MINIO_ROOT_USER MINIO_ROOT_PASSWORD MINIO_BUCKET
#   BACKUP_DIR (default /backups)  BACKUP_RETENTION_DAYS (default 14)
#   ALERT_WEBHOOK_URL (optional)
#
# IMPORTANT: snapshots contain PHI documents — keep the backups volume on a
# restricted, ideally encrypted, off-server disk.
# =============================================================================
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MINIO_DIR="${BACKUP_DIR}/minio"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
SNAPSHOT="${MINIO_DIR}/${MINIO_BUCKET}_${STAMP}"

log() { echo "[backup-minio][$(date -u +%FT%TZ)] $*"; }

alert() {
    msg="$1"
    log "ALERT: ${msg}"
    if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
        wget -q -O- --post-data="{\"service\":\"arogyam-backup-minio\",\"status\":\"FAILED\",\"message\":\"${msg}\"}" \
            --header="Content-Type: application/json" "${ALERT_WEBHOOK_URL}" || true
    fi
}

mkdir -p "${SNAPSHOT}"
log "registering mc alias for ${MINIO_ENDPOINT}"
mc alias set arogyam "${MINIO_ENDPOINT}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null

log "mirroring bucket '${MINIO_BUCKET}' -> ${SNAPSHOT}"
if mc mirror --overwrite --remove "arogyam/${MINIO_BUCKET}" "${SNAPSHOT}"; then
    SIZE="$(du -sh "${SNAPSHOT}" | cut -f1)"
    log "OK (${SIZE})"
else
    alert "mc mirror failed for bucket ${MINIO_BUCKET}"
    exit 1
fi

# --- Retention: delete snapshot dirs older than RETENTION_DAYS --------------
log "pruning snapshots older than ${RETENTION_DAYS} day(s)"
find "${MINIO_DIR}" -maxdepth 1 -type d -name "${MINIO_BUCKET}_*" -mtime "+${RETENTION_DAYS}" \
    -exec rm -rf {} + 2>/dev/null || true

log "done"