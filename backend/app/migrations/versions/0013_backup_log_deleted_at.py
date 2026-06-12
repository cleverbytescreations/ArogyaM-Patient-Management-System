"""Add deleted_at to backup_log for 7-day retention soft-delete.

Sets deleted_at when the retention purge job removes the physical backup file
from storage.  Rows with deleted_at set are shown in red on the backup audit
screen but are never removed from the table (audit trail is append-only).
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0013"
down_revision: str | Sequence[str] | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE backup_log
        ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE backup_log DROP COLUMN deleted_at")
