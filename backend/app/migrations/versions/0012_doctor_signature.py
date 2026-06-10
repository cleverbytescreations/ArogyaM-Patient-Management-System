"""Add doctor signature storage fields on users.

Adds users.signature_object_key / signature_content_type / signature_uploaded_at
so an administrator can attach a scanned signature image (stored in MinIO) to a
doctor account. The image binary lives in object storage under
doctors/{user_id}/signature; only the key + content type + upload timestamp are
tracked here. Used to embed the signature into the case sheet, prescription, and
discharge summary PDFs.

Revision ID: 0012
Revises: 0011
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("signature_object_key", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("signature_content_type", sa.String(length=50), nullable=True))
    op.add_column(
        "users",
        sa.Column("signature_uploaded_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "signature_uploaded_at")
    op.drop_column("users", "signature_content_type")
    op.drop_column("users", "signature_object_key")
