"""Create the first Administrator user (DB-T0.3).

Run inside the API container (after migrations):
    python scripts/create_admin.py

Password is read from the ADMIN_PASSWORD env variable or prompted interactively.
The hashed credential is stored; plaintext is never persisted or logged.
"""

from __future__ import annotations

import getpass
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

# Ensure the app package is importable when running from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.modules.auth.models import Role, User, UserRole


def main() -> None:
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass(f"Password for '{username}': ")

    if not password or len(password) < 8:
        sys.exit("Password must be at least 8 characters.")

    with SessionLocal() as db:
        existing = db.execute(select(User).where(User.username == username)).scalar_one_or_none()
        if existing:
            print(f"[create_admin] User '{username}' already exists — skipping.")
            return

        admin_role = db.execute(select(Role).where(Role.code == "ADMIN")).scalar_one_or_none()
        if admin_role is None:
            sys.exit("[create_admin] ADMIN role not found. Run migrations (alembic upgrade head) first.")

        full_name = os.environ.get("ADMIN_FULL_NAME", "System Administrator")
        user = User(
            id=uuid.uuid4(),
            username=username,
            full_name=full_name,
            password_hash=hash_password(password),
            status="ACTIVE",
            is_doctor=False,
            password_changed_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        db.add(UserRole(user_id=user.id, role_id=admin_role.id))
        db.commit()
        print(f"[create_admin] Administrator '{username}' created successfully.")


if __name__ == "__main__":
    main()