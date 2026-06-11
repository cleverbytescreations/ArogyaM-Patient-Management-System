#!/usr/bin/env bash
# Backup service entrypoint (INT-T13.1)
#
# 1. Runs both backup scripts immediately so backup_log has data on first startup.
# 2. Loops with a short poll interval (BACKUP_POLL_SECONDS, default 10 s) to detect
#    manual trigger files written by the API via POST /backup/trigger.
# 3. Runs a full scheduled backup every BACKUP_INTERVAL_SECONDS (default 1800 s).
#
# Uses a sleep loop instead of crond — crond requires setpgid which Docker's
# default seccomp profile blocks inside unprivileged containers.
#
# Trigger protocol:
#   API writes BACKUP_TRIGGER_FILE (default /backups/.trigger) containing the
#   requesting user's UUID.  This script detects it, exports
#   MANUAL_TRIGGER_USER_ID so backup scripts record triggered_by in backup_log,
#   then deletes the file and runs backups immediately.
set -euo pipefail

INTERVAL="${BACKUP_INTERVAL_SECONDS:-1800}"
POLL="${BACKUP_POLL_SECONDS:-10}"
TRIGGER_FILE="${BACKUP_TRIGGER_FILE:-/backups/.trigger}"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

run_backups() {
    log "=== DB backup ==="
    if /scripts/pg_backup.sh >> /var/log/arogyam-backup.log 2>&1; then
        log "DB backup: SUCCESS"
    else
        log "DB backup: FAILED (non-fatal — see /var/log/arogyam-backup.log)"
    fi

    log "=== Documents backup ==="
    if /scripts/docs_backup.sh >> /var/log/arogyam-backup.log 2>&1; then
        log "Documents backup: SUCCESS"
    else
        log "Documents backup: FAILED (non-fatal — see /var/log/arogyam-backup.log)"
    fi
}

log "Backup service starting — running initial backups..."
unset MANUAL_TRIGGER_USER_ID
run_backups

log "Entering scheduled loop (interval=${INTERVAL}s, poll=${POLL}s)..."
elapsed=0
while true; do
    sleep "${POLL}"
    elapsed=$((elapsed + POLL))

    if [ -f "${TRIGGER_FILE}" ]; then
        MANUAL_TRIGGER_USER_ID="$(cat "${TRIGGER_FILE}" 2>/dev/null || echo '')"
        rm -f "${TRIGGER_FILE}"
        export MANUAL_TRIGGER_USER_ID
        log "Manual backup triggered by user ${MANUAL_TRIGGER_USER_ID:-unknown}..."
        run_backups
        unset MANUAL_TRIGGER_USER_ID
        elapsed=0
    elif [ "${elapsed}" -ge "${INTERVAL}" ]; then
        unset MANUAL_TRIGGER_USER_ID
        log "Running scheduled backup..."
        run_backups
        elapsed=0
    fi
done
