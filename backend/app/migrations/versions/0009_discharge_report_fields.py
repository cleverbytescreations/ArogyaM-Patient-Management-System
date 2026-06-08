"""Add discharge summary report fields and doctor signature fields on users.

Adds discharge_summaries.condition_notes (free-text narrative for the discharge
report's "Condition of care seeker at Discharge" block — the existing
condition_at_discharge stays as the coded analytics field) and widens
follow_up_period from varchar(100) to text (real-world content runs well past
100 chars). Also adds users.qualification / users.registration_number so the
discharge report's doctor signature block ("Dr. X, B.A.M.S, Reg. No: ...") can
be rendered.

Revision ID: 0009
Revises: 0008
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | Sequence[str] | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("discharge_summaries", sa.Column("condition_notes", sa.Text(), nullable=True))
    op.alter_column(
        "discharge_summaries",
        "follow_up_period",
        existing_type=sa.String(length=100),
        type_=sa.Text(),
        existing_nullable=True,
    )
    op.add_column("users", sa.Column("qualification", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("registration_number", sa.String(length=60), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "registration_number")
    op.drop_column("users", "qualification")
    op.alter_column(
        "discharge_summaries",
        "follow_up_period",
        existing_type=sa.Text(),
        type_=sa.String(length=100),
        existing_nullable=True,
    )
    op.drop_column("discharge_summaries", "condition_notes")
