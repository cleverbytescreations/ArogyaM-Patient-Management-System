"""Add is_superuser flag to users; mark the bootstrap admin user.

Adds a boolean column is_superuser (DEFAULT FALSE) so the application can
distinguish the protected bootstrap super-user from regular ADMIN-role users.
The super-user's account cannot be disabled or have its roles changed through
the normal user-management API.

Revision ID: 0004
Revises: 0003
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_superuser", sa.Boolean(), nullable=False, server_default="false"),
    )

    # Mark the bootstrap admin as the super-user.
    bind = op.get_bind()
    username = settings.admin_username
    result = bind.execute(
        sa.text("UPDATE users SET is_superuser = TRUE WHERE username = :u"),
        {"u": username},
    )
    if result.rowcount:
        print(f"[0004] Marked '{username}' as is_superuser = TRUE.")
    else:
        print(f"[0004] No user with username '{username}' found — skipping flag set.")


def downgrade() -> None:
    op.drop_column("users", "is_superuser")
