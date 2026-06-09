"""Replace B-Tree index on audit_log.created_at with a BRIN index.

audit_log is append-only and rows are always inserted in ascending created_at
order.  BRIN stores only min/max summaries per 128-page block and is therefore
orders-of-magnitude smaller than a B-Tree on this column while still enabling
efficient range-scan pruning for date-bounded queries.

Revision ID: 0011
Revises: 0010
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | Sequence[str] | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_audit_log_created")
    op.execute(
        "CREATE INDEX idx_audit_log_created_brin"
        " ON audit_log USING BRIN (created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_audit_log_created_brin")
    op.execute("CREATE INDEX idx_audit_log_created ON audit_log (created_at)")
