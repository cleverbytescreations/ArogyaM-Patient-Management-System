"""Users repository — parameterized queries only (BE-T1.5)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.auth.models import Role, User, UserRole


def get_user_by_id(db: Session, user_id: str | uuid.UUID) -> User | None:
    stmt = (
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    return db.execute(stmt).scalar_one_or_none()


def username_exists(db: Session, username: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(User.id).where(func.lower(User.username) == username.lower())
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    return db.execute(stmt).first() is not None


def email_exists(db: Session, email: str, exclude_id: uuid.UUID | None = None) -> bool:
    stmt = select(User.id).where(func.lower(User.email) == email.lower())
    if exclude_id:
        stmt = stmt.where(User.id != exclude_id)
    return db.execute(stmt).first() is not None


def list_users(
    db: Session,
    *,
    q: str | None = None,
    is_doctor: bool | None = None,
    status: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[User], int]:
    stmt = (
        select(User)
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .order_by(User.full_name)
    )
    count_stmt = select(func.count(User.id))

    if q:
        pattern = f"%{q}%"
        filt = or_(
            User.full_name.ilike(pattern),
            User.username.ilike(pattern),
            User.email.ilike(pattern),
        )
        stmt = stmt.where(filt)
        count_stmt = count_stmt.where(filt)

    if is_doctor is not None:
        stmt = stmt.where(User.is_doctor == is_doctor)
        count_stmt = count_stmt.where(User.is_doctor == is_doctor)

    if status:
        stmt = stmt.where(User.status == status)
        count_stmt = count_stmt.where(User.status == status)

    total = db.execute(count_stmt).scalar_one()
    users = list(db.execute(stmt.limit(limit).offset(offset)).scalars())
    return users, total


def create_user(db: Session, user: User) -> User:
    db.add(user)
    db.flush()
    return user


def assign_roles(db: Session, user_id: uuid.UUID, role_ids: list[int], assigned_by: uuid.UUID | None) -> None:
    db.execute(
        UserRole.__table__.delete().where(UserRole.user_id == user_id)  # type: ignore[attr-defined]
    )
    for role_id in role_ids:
        db.add(UserRole(user_id=user_id, role_id=role_id, assigned_by=assigned_by))