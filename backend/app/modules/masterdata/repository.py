"""Master data repository — parameterized queries only (BE-T2.1, BE-T2.2)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.masterdata.models import MasterDataItem, OpSequence


# ── Master data ──────────────────────────────────────────────────────────────


def list_by_type(
    db: Session, data_type: str, active_only: bool = False
) -> list[MasterDataItem]:
    stmt = (
        select(MasterDataItem)
        .where(MasterDataItem.type == data_type)
        .order_by(MasterDataItem.sort_order, MasterDataItem.code)
    )
    if active_only:
        stmt = stmt.where(MasterDataItem.is_active.is_(True))
    return list(db.execute(stmt).scalars())


def get_by_id(db: Session, item_id: int) -> MasterDataItem | None:
    return db.execute(
        select(MasterDataItem).where(MasterDataItem.id == item_id)
    ).scalar_one_or_none()


def get_by_type_and_code(
    db: Session, data_type: str, code: str
) -> MasterDataItem | None:
    return db.execute(
        select(MasterDataItem)
        .where(MasterDataItem.type == data_type, MasterDataItem.code == code)
    ).scalar_one_or_none()


def code_exists_in_type(
    db: Session, data_type: str, code: str, exclude_id: int | None = None
) -> bool:
    stmt = select(MasterDataItem.id).where(
        MasterDataItem.type == data_type, MasterDataItem.code == code
    )
    if exclude_id is not None:
        stmt = stmt.where(MasterDataItem.id != exclude_id)
    return db.execute(stmt).first() is not None


def create_item(db: Session, item: MasterDataItem) -> MasterDataItem:
    db.add(item)
    db.flush()
    return item


def save(db: Session, item: MasterDataItem) -> MasterDataItem:
    db.flush()
    return item


# ── OP Sequence ───────────────────────────────────────────────────────────────


def list_sequences(db: Session) -> list[OpSequence]:
    return list(
        db.execute(
            select(OpSequence).order_by(OpSequence.category_code)
        ).scalars()
    )


def get_sequence_by_id(db: Session, seq_id: int) -> OpSequence | None:
    return db.execute(
        select(OpSequence).where(OpSequence.id == seq_id)
    ).scalar_one_or_none()


def get_sequence_by_category(db: Session, category_code: str) -> OpSequence | None:
    return db.execute(
        select(OpSequence).where(OpSequence.category_code == category_code)
    ).scalar_one_or_none()


def prefix_exists(
    db: Session, prefix: str, exclude_id: int | None = None
) -> bool:
    stmt = select(OpSequence.id).where(OpSequence.prefix == prefix)
    if exclude_id is not None:
        stmt = stmt.where(OpSequence.id != exclude_id)
    return db.execute(stmt).first() is not None
