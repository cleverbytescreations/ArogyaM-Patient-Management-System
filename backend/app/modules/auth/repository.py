"""Auth repository — parameterized DB queries only, no business logic (BE-T1.2)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.modules.auth.models import Role, User, UserRole


def get_user_by_username(db: Session, username: str) -> User | None:
    stmt = (
        select(User)
        .where(func.lower(User.username) == username.lower())
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    return db.execute(stmt).scalar_one_or_none()


def get_user_by_id(db: Session, user_id: str | uuid.UUID) -> User | None:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    return db.execute(stmt).scalar_one_or_none()


def get_user_by_email(db: Session, email: str) -> User | None:
    stmt = select(User).where(func.lower(User.email) == email.lower())
    return db.execute(stmt).scalar_one_or_none()


def increment_failed_attempts(
    db: Session, user_id: uuid.UUID, locked_until: datetime | None
) -> None:
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            failed_login_attempts=User.failed_login_attempts + 1,
            locked_until=locked_until,
        )
    )


def reset_login_counters(db: Session, user_id: uuid.UUID) -> None:
    db.execute(
        update(User)
        .where(User.id == user_id)
        .values(
            failed_login_attempts=0,
            locked_until=None,
            last_login_at=datetime.now(UTC),
        )
    )


def get_all_roles(db: Session) -> list[Role]:
    return list(db.execute(select(Role).where(Role.is_active.is_(True))).scalars())


def get_roles_by_codes(db: Session, codes: list[str]) -> list[Role]:
    return list(db.execute(select(Role).where(Role.code.in_(codes))).scalars())
