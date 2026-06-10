"""Patient search service (BE-T5.1)."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.core.permissions import ROLE_ADMIN, ROLE_DOCTOR
from app.modules.patients.schemas import PatientSearchResult
from app.modules.patients.utils import to_search_result
from app.modules.search import repository as repo


def _is_doctor_scoped(actor_payload: dict) -> bool:
    """Return True when the caller must be scoped to only their own patients.

    Triggers if the user has is_doctor=True OR holds the DOCTOR role without
    ADMIN — guarding against users whose is_doctor flag was not set on creation.
    """
    roles = actor_payload.get("roles", [])
    return bool(actor_payload.get("is_doctor")) or (
        ROLE_DOCTOR in roles and ROLE_ADMIN not in roles
    )


def search_patients(
    db: Session,
    *,
    q: str | None,
    op_number: str | None,
    mobile: str | None,
    name: str | None,
    op_category: str | None,
    status: str | None,
    limit: int,
    offset: int,
    actor_payload: dict | None = None,
) -> tuple[list[PatientSearchResult], int]:
    doctor_id: uuid.UUID | None = None
    if actor_payload and _is_doctor_scoped(actor_payload):
        doctor_id = uuid.UUID(actor_payload["sub"])

    rows, total = repo.search_patients(
        db,
        q=q,
        op_number=op_number,
        mobile=mobile,
        name=name,
        op_category=op_category,
        status=status,
        limit=limit,
        offset=offset,
        doctor_id=doctor_id,
    )
    return [to_search_result(patient, doctor_name) for patient, doctor_name in rows], total
