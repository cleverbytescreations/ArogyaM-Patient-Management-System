"""Purge audit_log records older than AUDIT_RETENTION_DAYS (default 2555 = 7 years).

Designed to be executed on a scheduled basis (e.g. monthly cron job).

Run inside the API container:
    docker compose exec api python scripts/purge_audit_log.py

Dry-run (count only, no deletion):
    docker compose exec api python scripts/purge_audit_log.py --dry-run

Override the retention window for this run only:
    AUDIT_RETENTION_DAYS=365 docker compose exec api python scripts/purge_audit_log.py

Suggested cron entry (first Sunday of each month at 02:00 UTC):
    0 2 1-7 * 0   docker compose exec -T api python scripts/purge_audit_log.py

The script exits with code 0 on success, 1 on error.
"""

from __future__ import annotations

import argparse
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.audit import write_audit
from app.core.config import settings
from app.core.db import SessionLocal
from app.modules.audit import repository as repo


def main(dry_run: bool) -> None:
    retention_days = settings.audit_retention_days
    if retention_days <= 0:
        print("[purge_audit_log] AUDIT_RETENTION_DAYS=0 — purging is disabled, nothing to do.")
        return

    cutoff = datetime.now(tz=UTC) - timedelta(days=retention_days)
    print(
        f"[purge_audit_log] retention={retention_days} days | "
        f"cutoff={cutoff.date().isoformat()} | dry_run={dry_run}"
    )

    with SessionLocal() as db:
        count = repo.count_expired(db, cutoff)
        print(f"[purge_audit_log] Records eligible for deletion: {count}")

        if dry_run:
            print("[purge_audit_log] Dry-run mode — no records deleted.")
            return

        if count == 0:
            print("[purge_audit_log] Nothing to purge.")
            return

        repo.delete_expired(db, cutoff)
        write_audit(
            db,
            action="PURGE_AUDIT_LOG",
            entity_type="audit_log",
            new_value={
                "purged_count": count,
                "cutoff_before": cutoff.isoformat(),
                "retention_days": retention_days,
                "triggered_by": "cron_script",
            },
            description=f"Cron purge: deleted {count} audit records older than {cutoff.date().isoformat()}",
        )
        db.commit()
        print(f"[purge_audit_log] Deleted {count} records. Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Purge expired audit_log records.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count eligible records without deleting them.",
    )
    args = parser.parse_args()

    try:
        main(dry_run=args.dry_run)
    except Exception as exc:  # noqa: BLE001
        print(f"[purge_audit_log] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
