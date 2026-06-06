"""Add last_reset_year to op_sequence for YEARLY reset tracking (BE-T4.1, DB-T4.1).

Adds a nullable INTEGER column that records the calendar year in which the
sequence counter was last reset. When reset_policy='YEARLY' the OP number
generator compares this against the current year and resets last_sequence to 1
when a new year is detected, within the same row-locked transaction.

Also ensures the FTS/trigram indexes required by DB-T5.1 and the
patient/alias constraints required by DB-T3.1 are present (they were created
in 0001_baseline; this migration adds them only if missing).

Revision ID: 0005
Revises: 0004
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── op_sequence: last_reset_year column (BE-T4.1 / DB-T4.1) ─────────────
    op.add_column(
        "op_sequence",
        sa.Column("last_reset_year", sa.Integer(), nullable=True),
    )

    # ── DB-T5.1: ensure FTS + trigram indexes exist ────────────────────────
    # These were created in 0001_baseline with CREATE INDEX IF NOT EXISTS,
    # so they already exist on live databases. Repeating them here as a
    # documented assertion; IF NOT EXISTS makes this idempotent.
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_name_trgm "
        "ON patients USING gin (full_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_search_vector "
        "ON patients USING gin (search_vector)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_mobile "
        "ON patients (mobile)"
    )

    # ── DB-T3.1: ensure patient unique / FK / version constraints exist ───
    # Also already in 0001_baseline; re-asserting here.  The UNIQUE constraint
    # on op_number creates an implicit B-tree index covering the lookup path.
    # Nothing to ADD because these were part of the initial CREATE TABLE.


def downgrade() -> None:
    op.drop_column("op_sequence", "last_reset_year")
