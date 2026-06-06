"""SQLAlchemy models for master_data and op_sequence (BE-T2.1, DDL §1.2–1.3)."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import BigInteger, Boolean, DateTime, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

VALID_MASTER_DATA_TYPES: frozenset[str] = frozenset(
    {
        "consultation_category",
        "document_type",
        "visit_type",
        "follow_up_status",
        "blood_group",
        "dietary_preference",
        "marital_status",
        "gender",
        "condition_at_discharge",
    }
)


class MasterDataItem(Base):
    __tablename__ = "master_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class OpSequence(Base):
    __tablename__ = "op_sequence"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    category_code: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    prefix: Mapped[str] = mapped_column(String(10), nullable=False, unique=True)
    last_sequence: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    padding_width: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=4)
    number_format: Mapped[str] = mapped_column(
        String(40), nullable=False, default="{prefix}{seq}"
    )
    reset_policy: Mapped[str] = mapped_column(String(10), nullable=False, default="NEVER")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_reset_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
