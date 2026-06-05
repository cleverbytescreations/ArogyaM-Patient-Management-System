"""Seed the bootstrap super-user (Administrator) — runs on docker startup.

Creates a single ADMIN-role user so the application is usable immediately after
`docker compose up` (entrypoint.sh runs `alembic upgrade head` before the API
starts). The ADMIN role grants every permission (see app/core/permissions.py).

Idempotent: if a user with the configured username already exists, nothing is
done. Credentials come from the environment (BE-TF.2 — no secrets in code):

    ADMIN_USERNAME   (default: admin)
    ADMIN_PASSWORD   (required in production; dev fallback used otherwise)
    ADMIN_FULL_NAME  (default: System Administrator)
    ADMIN_EMAIL      (optional)

In production, if ADMIN_PASSWORD is not supplied, creation is skipped (create the
admin out-of-band with scripts/create_admin.py) rather than seeding a known
default credential.

Revision ID: 0003
Revises: 0002
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.core.config import settings
from app.core.permissions import ROLE_ADMIN
from app.core.security import hash_password

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Used only in non-production when ADMIN_PASSWORD is not provided.
_DEV_FALLBACK_PASSWORD = "Admin@12345"


def upgrade() -> None:
    bind = op.get_bind()
    username = settings.admin_username

    # Idempotent: skip if the super-user already exists.
    exists = bind.execute(
        sa.text("SELECT 1 FROM users WHERE username = :u"), {"u": username}
    ).first()
    if exists:
        print(f"[0003] Admin user '{username}' already exists — skipping.")
        return

    # Resolve the password without ever baking a secret into the repo.
    password = settings.admin_password
    if not password:
        if settings.is_production:
            print(
                "[0003] ADMIN_PASSWORD not set in production — skipping admin "
                "creation. Create it with scripts/create_admin.py."
            )
            return
        password = _DEV_FALLBACK_PASSWORD
        print(
            f"[0003] ADMIN_PASSWORD not set; using the dev fallback password for "
            f"'{username}'. Change it after first login."
        )

    role_id = bind.execute(
        sa.text("SELECT id FROM roles WHERE code = :c"), {"c": ROLE_ADMIN}
    ).scalar()
    if role_id is None:
        raise RuntimeError("ADMIN role missing — seed migration 0002 must run first.")

    user_id = uuid.uuid4()
    bind.execute(
        sa.text(
            "INSERT INTO users "
            "(id, username, email, full_name, password_hash, status, is_doctor, "
            " password_changed_at) "
            "VALUES "
            "(:id, :username, :email, :full_name, :password_hash, 'ACTIVE', FALSE, now())"
        ),
        {
            "id": str(user_id),
            "username": username,
            "email": settings.admin_email or None,
            "full_name": settings.admin_full_name,
            "password_hash": hash_password(password),
        },
    )
    bind.execute(
        sa.text(
            "INSERT INTO user_roles (user_id, role_id) VALUES (:uid, :rid) ON CONFLICT DO NOTHING"
        ),
        {"uid": str(user_id), "rid": role_id},
    )
    print(f"[0003] Created super-user '{username}' with the ADMIN role (all permissions).")


def downgrade() -> None:
    bind = op.get_bind()
    username = settings.admin_username
    bind.execute(
        sa.text(
            "DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE username = :u)"
        ),
        {"u": username},
    )
    bind.execute(sa.text("DELETE FROM users WHERE username = :u"), {"u": username})
