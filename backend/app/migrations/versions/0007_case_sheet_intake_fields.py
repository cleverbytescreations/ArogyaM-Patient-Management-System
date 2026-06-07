"""Add case sheet intake fields: hereditary diseases (mother/father) and delivery counts.

Splits the combined hereditary_diseases free-text into separate mother/father columns
and adds normal_deliveries / caesarian_deliveries integer counts, needed to render the
Online Consultations Case Sheet report (matches the paper case-sheet layout).

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("case_sheets", sa.Column("hereditary_diseases_mother", sa.Text(), nullable=True))
    op.add_column("case_sheets", sa.Column("hereditary_diseases_father", sa.Text(), nullable=True))
    op.add_column("case_sheets", sa.Column("normal_deliveries", sa.SmallInteger(), nullable=True))
    op.add_column("case_sheets", sa.Column("caesarian_deliveries", sa.SmallInteger(), nullable=True))

    # Best-effort backfill: historical combined hereditary text lands in the
    # "mother" column for manual review — we cannot infer which parent it described.
    op.execute(
        "UPDATE case_sheets SET hereditary_diseases_mother = hereditary_diseases "
        "WHERE hereditary_diseases IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("case_sheets", "caesarian_deliveries")
    op.drop_column("case_sheets", "normal_deliveries")
    op.drop_column("case_sheets", "hereditary_diseases_father")
    op.drop_column("case_sheets", "hereditary_diseases_mother")
