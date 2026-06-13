"""Add cancellation_reason to visits.

Lets staff record why a visit was cancelled when transitioning it from OPEN
to CANCELLED via the Visit Register. Kept separate from `reason` (the visit's
original chief-complaint/reason at booking) so cancelling never overwrites it.

Revision ID: 0014
Revises: 0013
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | Sequence[str] | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("visits", sa.Column("cancellation_reason", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("visits", "cancellation_reason")
