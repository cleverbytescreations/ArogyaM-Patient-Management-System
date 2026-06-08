"""SQLAlchemy models for User, Role, UserRole (BE-T1.1, DDL §2).

These are the canonical ORM models for RBAC; the users module imports from here.
CITEXT columns are mapped as String — the DB type enforces case-insensitivity.
The self-referential FKs on created_by/updated_by use use_alter=True to break
the circular reference at DDL time.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    user_roles: Mapped[list[UserRole]] = relationship("UserRole", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(254), unique=True)
    mobile: Mapped[str | None] = mapped_column(String(20))
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    is_doctor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    qualification: Mapped[str | None] = mapped_column(String(120))
    registration_number: Mapped[str | None] = mapped_column(String(60))
    is_superuser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    failed_login_attempts: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", use_alter=True, name="fk_users_created_by"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", use_alter=True, name="fk_users_updated_by"),
    )

    user_roles: Mapped[list[UserRole]] = relationship(
        "UserRole",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="[UserRole.user_id]",
    )


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    role_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("roles.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", use_alter=True, name="fk_user_roles_assigned_by")
    )

    user: Mapped[User] = relationship(
        "User", back_populates="user_roles", foreign_keys="[UserRole.user_id]"
    )
    role: Mapped[Role] = relationship("Role", back_populates="user_roles")
