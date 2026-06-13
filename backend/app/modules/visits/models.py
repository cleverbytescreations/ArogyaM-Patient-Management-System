"""SQLAlchemy models for visits, case_sheets, consultation_notes (BE-T6.1–BE-T6.3, DDL §4)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class Visit(Base):
    __tablename__ = "visits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    visit_date: Mapped[date] = mapped_column(Date, nullable=False)
    visit_type_code: Mapped[str] = mapped_column(String(40), nullable=False)
    consultation_category: Mapped[str | None] = mapped_column(String(40))
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    is_scheduled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    reason: Mapped[str | None] = mapped_column(String(255))
    cancellation_reason: Mapped[str | None] = mapped_column(String(255))
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

    case_sheet: Mapped["CaseSheet | None"] = relationship(
        "CaseSheet",
        back_populates="visit",
        uselist=False,
        cascade="all, delete-orphan",
    )
    consultation_notes: Mapped[list["ConsultationNote"]] = relationship(
        "ConsultationNote",
        back_populates="visit",
        order_by="ConsultationNote.created_at",
        cascade="all, delete-orphan",
    )


class CaseSheet(Base):
    __tablename__ = "case_sheets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    appetite: Mapped[str | None] = mapped_column(Text)
    sleep: Mapped[str | None] = mapped_column(Text)
    motion: Mapped[str | None] = mapped_column(Text)
    energy_level: Mapped[str | None] = mapped_column(Text)
    hereditary_diseases: Mapped[str | None] = mapped_column(Text)
    hereditary_diseases_mother: Mapped[str | None] = mapped_column(Text)
    hereditary_diseases_father: Mapped[str | None] = mapped_column(Text)
    past_ailments: Mapped[str | None] = mapped_column(Text)
    surgeries: Mapped[str | None] = mapped_column(Text)
    exercise_routine: Mapped[str | None] = mapped_column(Text)
    deliveries: Mapped[str | None] = mapped_column(Text)
    normal_deliveries: Mapped[int | None] = mapped_column(SmallInteger)
    caesarian_deliveries: Mapped[int | None] = mapped_column(SmallInteger)
    present_complaints: Mapped[str | None] = mapped_column(Text)
    other_observations: Mapped[str | None] = mapped_column(Text)
    remarks: Mapped[str | None] = mapped_column(Text)
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

    visit: Mapped["Visit"] = relationship("Visit", back_populates="case_sheet")


class ConsultationNote(Base):
    __tablename__ = "consultation_notes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("visits.id", ondelete="CASCADE"),
        nullable=False,
    )
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    doctor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    presenting_complaints: Mapped[str | None] = mapped_column(Text)
    diagnosis: Mapped[str | None] = mapped_column(Text)
    observations: Mapped[str | None] = mapped_column(Text)
    treatment_advice: Mapped[str | None] = mapped_column(Text)
    diet_advice: Mapped[str | None] = mapped_column(Text)
    yoga_advice: Mapped[str | None] = mapped_column(Text)
    review_date: Mapped[date | None] = mapped_column(Date)
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

    visit: Mapped["Visit"] = relationship("Visit", back_populates="consultation_notes")
