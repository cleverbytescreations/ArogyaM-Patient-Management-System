"""Patient search service (BE-T5.1)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.modules.patients.schemas import PatientSearchResult
from app.modules.patients.utils import to_search_result
from app.modules.search import repository as repo


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
) -> tuple[list[PatientSearchResult], int]:
    patients, total = repo.search_patients(
        db,
        q=q,
        op_number=op_number,
        mobile=mobile,
        name=name,
        op_category=op_category,
        status=status,
        limit=limit,
        offset=offset,
    )
    return [to_search_result(patient) for patient in patients], total
