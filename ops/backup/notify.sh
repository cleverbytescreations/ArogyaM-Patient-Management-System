#!/usr/bin/env bash
# Backup alert notification via SMTP (INT-T13.2 / LOG-T13.1)
# Sends success/failure email when SMTP is configured; no-op when disabled.
#
# Usage: notify.sh <backup_type> <status> <message>
#
# Required env vars (only when SMTP_HOST is set):
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_TO

set -euo pipefail

BACKUP_TYPE="${1:-UNKNOWN}"
STATUS="${2:-UNKNOWN}"
MESSAGE="${3:-No message}"
HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
TIMESTAMP="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# No-op when SMTP is not configured.
# Exit 2 (not 0) so callers can distinguish "skipped" from "sent successfully".
if [ -z "${SMTP_HOST:-}" ]; then
    echo "[notify] SMTP not configured — skipping backup alert."
    exit 2
fi

: "${SMTP_PORT:=587}"
: "${SMTP_FROM:?SMTP_FROM is required when SMTP_HOST is set}"
: "${SMTP_TO:?SMTP_TO is required when SMTP_HOST is set}"

SUBJECT="[ArogyaM Backup] ${BACKUP_TYPE} ${STATUS} on ${HOSTNAME}"
BODY="ArogyaM Backup Notification
-----------------------------
Host       : ${HOSTNAME}
Backup Type: ${BACKUP_TYPE}
Status     : ${STATUS}
Time       : ${TIMESTAMP}
Message    : ${MESSAGE}

This is an automated alert from the ArogyaM PMS backup system.
"

# Use curl to send via SMTP (available in most environments)
if command -v curl &>/dev/null; then
    curl --silent --fail \
        --url "smtp://${SMTP_HOST}:${SMTP_PORT}" \
        --ssl \
        --mail-from "${SMTP_FROM}" \
        --mail-rcpt "${SMTP_TO}" \
        ${SMTP_USER:+--user "${SMTP_USER}:${SMTP_PASS:-}"} \
        --upload-file - <<EOF
From: ArogyaM Backup <${SMTP_FROM}>
To: ${SMTP_TO}
Subject: ${SUBJECT}
Content-Type: text/plain

${BODY}
EOF
    echo "[notify] Alert email sent to ${SMTP_TO} (${STATUS})"
else
    # Fallback: sendmail if available
    if command -v sendmail &>/dev/null; then
        echo -e "Subject: ${SUBJECT}\nFrom: ${SMTP_FROM}\nTo: ${SMTP_TO}\n\n${BODY}" \
            | sendmail -t
        echo "[notify] Alert email sent via sendmail (${STATUS})"
    else
        echo "[notify] WARNING: Neither curl nor sendmail found — alert not sent." >&2
    fi
fi
