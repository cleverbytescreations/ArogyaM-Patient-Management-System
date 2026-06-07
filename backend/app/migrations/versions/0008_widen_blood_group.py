"""Widen patients.blood_group to varchar(6).

The blood_group column was varchar(5), but the seeded master_data blood_group
codes include AB_POS and AB_NEG (6 chars), which made AB+/AB- patients fail to
save in both the seed script and the registration UI. Widen the column to
varchar(6) so it can hold every valid master_data code.

Revision ID: 0008
Revises: 0007
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: str | Sequence[str] | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "patients",
        "blood_group",
        existing_type=sa.String(length=5),
        type_=sa.String(length=6),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "patients",
        "blood_group",
        existing_type=sa.String(length=6),
        type_=sa.String(length=5),
        existing_nullable=True,
    )
