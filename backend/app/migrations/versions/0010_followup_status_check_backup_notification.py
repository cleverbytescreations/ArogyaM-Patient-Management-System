"""Add follow_ups status_code CHECK constraint and backup_log notification_status.

- follow_ups: adds ck_follow_ups_status CHECK to guard valid status_code values at DB level.
- backup_log: adds notification_status VARCHAR(20) to record whether the alert email
  was SENT, FAILED, or SKIPPED (LOG-T13.1).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0010"
down_revision: str | Sequence[str] | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE follow_ups
        ADD CONSTRAINT ck_follow_ups_status
        CHECK (status_code IN ('PENDING', 'CONTACTED', 'NOT_REACHABLE', 'COMPLETED', 'RESCHEDULED'))
    """)

    op.execute("""
        ALTER TABLE backup_log
        ADD COLUMN notification_status VARCHAR(20) DEFAULT NULL
    """)

    op.execute("""
        ALTER TABLE backup_log
        ADD CONSTRAINT ck_backup_log_notif_status
        CHECK (notification_status IN ('SENT', 'FAILED', 'SKIPPED'))
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE backup_log DROP CONSTRAINT ck_backup_log_notif_status")
    op.execute("ALTER TABLE backup_log DROP COLUMN notification_status")
    op.execute("ALTER TABLE follow_ups DROP CONSTRAINT ck_follow_ups_status")
