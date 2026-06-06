"""Patient search repository (BE-T5.1)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import case, desc, exists, func, literal, or_, select
from sqlalchemy.orm import Session

from app.modules.patients.models import Patient, PatientAlias


def _alias_subquery(term: str):
    """Correlated EXISTS subquery: patient has an alias matching exactly `term`."""
    return exists(
        select(PatientAlias.id).where(
            PatientAlias.patient_id == Patient.id,
            PatientAlias.old_op_number == term,
        )
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
) -> tuple[list[Patient], int]:
    conditions = []
    rank_terms: list[Any] = []

    if op_number:
        op_alias = _alias_subquery(op_number)
        op_pattern = f"%{op_number}%"
        conditions.append(or_(Patient.op_number.ilike(op_pattern), op_alias))
        rank_terms.append(
            case((Patient.op_number == op_number, 100.0), (op_alias, 95.0), else_=0.0)
        )
    if mobile:
        mobile_pattern = f"%{mobile}%"
        conditions.append(Patient.mobile.ilike(mobile_pattern))
        rank_terms.append(case((Patient.mobile == mobile, 90.0), else_=0.0))
    if name:
        name_pattern = f"%{name}%"
        conditions.append(
            or_(
                Patient.full_name.ilike(name_pattern),
                func.similarity(Patient.full_name, name) > 0.2,
            )
        )
        rank_terms.append(func.similarity(Patient.full_name, name) * 50.0)
    if q:
        q_alias = _alias_subquery(q)
        q_pattern = f"%{q}%"
        query = func.plainto_tsquery("simple", q)
        conditions.append(
            or_(
                Patient.op_number.ilike(q_pattern),
                Patient.mobile.ilike(q_pattern),
                Patient.full_name.ilike(q_pattern),
                Patient.search_vector.op("@@")(query),
                func.similarity(Patient.full_name, q) > 0.2,
                q_alias,
            )
        )
        rank_terms.extend(
            [
                case((Patient.op_number == q, 100.0), (q_alias, 95.0), else_=0.0),
                case((Patient.mobile == q, 90.0), else_=0.0),
                func.ts_rank_cd(Patient.search_vector, query) * 20.0,
                func.similarity(Patient.full_name, q) * 30.0,
            ]
        )

    filters = []
    if conditions:
        filters.append(or_(*conditions))
    if op_category:
        filters.append(Patient.op_category_code == op_category)
    if status:
        filters.append(Patient.status == status)
    else:
        filters.append(Patient.status != "MERGED")

    rank = sum(rank_terms) if rank_terms else literal(0.0)
    base = select(Patient).where(*filters)
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = db.execute(
        select(Patient)
        .where(*filters)
        .order_by(desc(rank), Patient.full_name)
        .limit(limit)
        .offset(offset)
    ).scalars()
    return list(rows), total
