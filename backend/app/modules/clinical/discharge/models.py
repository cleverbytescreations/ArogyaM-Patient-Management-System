"""SQLAlchemy model for discharge_summaries (BE-T8.1)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DischargeSummary(Base):
    __tablename__ = "discharge_summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("visits.id", ondelete="CASCADE"), nullable=False
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    admission_date: Mapped[date | None] = mapped_column(Date)
    discharge_date: Mapped[date | None] = mapped_column(Date)
    diagnosis: Mapped[str | None] = mapped_column(Text)
    presenting_complaints: Mapped[str | None] = mapped_column(Text)
    investigations_admission: Mapped[str | None] = mapped_column(Text)
    treatments: Mapped[str | None] = mapped_column(Text)
    condition_at_discharge: Mapped[str | None] = mapped_column(String(40))
    condition_notes: Mapped[str | None] = mapped_column(Text)
    follow_up_period: Mapped[str | None] = mapped_column(Text)
    discharge_advice: Mapped[str | None] = mapped_column(Text)
    medications: Mapped[str | None] = mapped_column(Text)
    yoga_guidance: Mapped[str | None] = mapped_column(Text)
    is_finalized: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finalized_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    amends_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("discharge_summaries.id"), nullable=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
