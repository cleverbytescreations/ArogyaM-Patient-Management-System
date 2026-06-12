#!/usr/bin/env bash
# Backup retention purge script (INT-T13.1 — 7-day retention)
#
# Queries backup_log for SUCCESS entries older than RETENTION_DAYS that have
# not yet been purged, deletes their physical files/directories from storage,
# then soft-deletes the rows by setting deleted_at = NOW().
#
# Required env vars:
#   DATABASE_URL    — plain postgresql:// URL (no +psycopg prefix)
#   BACKUP_DEST     — local directory path or rclone remote prefix
#
# Optional env vars:
#   RETENTION_DAYS  — days to keep backups (default 7)

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DEST:?BACKUP_DEST is required}"

RETENTION_DAYS="${RETENTION_DAYS:-7}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [purge] $*"; }

log "Retention purge starting — keeping last ${RETENTION_DAYS} days..."

# Fetch expired entries: id|location_ref, pipe-delimited, one per line.
EXPIRED="$(psql "${DATABASE_URL}" --no-psqlrc -t -A -F'|' \
    --set="rdays=${RETENTION_DAYS}" \
    <<'SQL' 2>/dev/null || true
SELECT id, COALESCE(location_ref, '')
FROM backup_log
WHERE status = 'SUCCESS'
  AND deleted_at IS NULL
  AND started_at < NOW() - MAKE_INTERVAL(days => :rdays::int)
ORDER BY started_at ASC;
SQL
)"

if [ -z "${EXPIRED}" ]; then
    log "No expired backups found — nothing to purge."
    exit 0
fi

PURGED_IDS=""

while IFS='|' read -r entry_id location_ref; do
    [ -z "${entry_id}" ] && continue

    log "Purging id=${entry_id} location=${location_ref:-<none>}"

    if [ -n "${location_ref}" ]; then
        if [[ "${location_ref}" == s3://* ]] || [[ "${location_ref}" == *:/* ]]; then
            # rclone remote — try deletefile first (for single files), fall back to purge (dirs)
            if rclone deletefile "${location_ref}" --log-level ERROR 2>/dev/null; then
                log "  Deleted remote file: ${location_ref}"
            elif rclone purge "${location_ref}" --log-level ERROR 2>/dev/null; then
                log "  Purged remote directory: ${location_ref}"
            else
                log "  WARNING: could not delete remote ${location_ref} (may already be gone)"
            fi
        else
            # Local path — file (.sql.gz) or directory (docs_TIMESTAMP)
            if [ -f "${location_ref}" ]; then
                rm -f "${location_ref}"
                log "  Deleted file: ${location_ref}"
            elif [ -d "${location_ref}" ]; then
                rm -rf "${location_ref}"
                log "  Deleted directory: ${location_ref}"
            else
                log "  WARNING: path not found: ${location_ref} (may already be gone)"
            fi
        fi
    fi

    # Collect ID regardless of whether the file existed — the DB row must be marked
    # purged so it shows correctly on the audit screen even if the file was already gone.
    PURGED_IDS="${PURGED_IDS}${entry_id},"
done <<< "${EXPIRED}"

# Strip trailing comma
PURGED_IDS="${PURGED_IDS%,}"

if [ -z "${PURGED_IDS}" ]; then
    log "No entries to soft-delete."
    exit 0
fi

# Soft-delete all purged rows in one statement.
# IDs come from our own DB query above so interpolation is safe.
DELETED_COUNT="$(psql "${DATABASE_URL}" --no-psqlrc -t -A \
    <<SQL 2>/dev/null | grep -E '^[0-9]+$' | wc -l | tr -d ' ' || echo 0
UPDATE backup_log
SET deleted_at = NOW()
WHERE id = ANY(ARRAY[${PURGED_IDS}]::bigint[])
  AND deleted_at IS NULL
RETURNING id;
SQL
)"

log "Soft-deleted ${DELETED_COUNT} backup_log entries."
log "Retention purge complete."
