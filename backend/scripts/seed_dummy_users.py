"""Seed one dummy user per non-admin role for development/testing.

Run inside the API container after migrations:
    python scripts/seed_dummy_users.py

Idempotent: skips any user whose username already exists.
All dummy users are created as ACTIVE with pre-set passwords (dev only).
"""

from __future__ import annotations

import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.modules.auth.models import Role, User, UserRole

DUMMY_USERS = [
    {
        "username": "dr.priya",
        "full_name": "Dr. Priya Nair",
        "email": "dr.priya@arogyam.dev",
        "mobile": "9876543201",
        "password": "Doctor@12345",
        "role_code": "DOCTOR",
        "is_doctor": True,
    },
    {
        "username": "receptionist.ravi",
        "full_name": "Ravi Kumar",
        "email": "ravi.kumar@arogyam.dev",
        "mobile": "9876543202",
        "password": "Reception@12345",
        "role_code": "RECEPTION",
        "is_doctor": False,
    },
    {
        "username": "dataentry.meena",
        "full_name": "Meena Sharma",
        "email": "meena.sharma@arogyam.dev",
        "mobile": "9876543203",
        "password": "DataEntry@12345",
        "role_code": "DATA_ENTRY",
        "is_doctor": False,
    },
]


def main() -> None:
    with SessionLocal() as db:
        for spec in DUMMY_USERS:
            existing = db.execute(
                select(User).where(User.username == spec["username"])
            ).scalar_one_or_none()
            if existing:
                print(f"[seed_dummy_users] '{spec['username']}' already exists — skipping.")
                continue

            role = db.execute(
                select(Role).where(Role.code == spec["role_code"])
            ).scalar_one_or_none()
            if role is None:
                print(
                    f"[seed_dummy_users] Role '{spec['role_code']}' not found — "
                    "run migrations first. Skipping."
                )
                continue

            user = User(
                id=uuid.uuid4(),
                username=spec["username"],
                full_name=spec["full_name"],
                email=spec["email"],
                mobile=spec["mobile"],
                password_hash=hash_password(spec["password"]),
                status="ACTIVE",
                is_doctor=spec["is_doctor"],
                password_changed_at=datetime.now(UTC),
            )
            db.add(user)
            db.flush()
            db.add(UserRole(user_id=user.id, role_id=role.id))
            db.commit()
            print(f"[seed_dummy_users] Created '{spec['username']}' ({spec['role_code']}).")

    print("[seed_dummy_users] Done.")


if __name__ == "__main__":
    main()
