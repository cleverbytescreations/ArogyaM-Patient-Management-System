"""Master-data & OP-sequence routes (API-T2.1).

GET  /master-data/{type}        — authenticated (any role), ?active=true
POST /master-data/{type}        — manage_master_data (Admin)
PUT  /master-data/{type}/{id}   — manage_master_data (Admin)
GET  /op-sequences              — authenticated (any role)
PUT  /op-sequences/{id}         — manage_master_data (Admin)

{type} is validated against the DDL CHECK list; unknown type → 404.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from app.core.dependencies import CurrentUser, get_db, require_permission
from app.core.permissions import PERM_MANAGE_MASTER_DATA
from app.modules.masterdata import op_sequence_service as op_svc
from app.modules.masterdata import service as svc
from app.modules.masterdata.schemas import (
    MasterDataCreateRequest,
    MasterDataItemOut,
    MasterDataUpdateRequest,
    OpSequenceOut,
    OpSequenceUpdateRequest,
)
from sqlalchemy.orm import Session

router = APIRouter(tags=["master-data"])

ManageMasterData = Annotated[dict, Depends(require_permission(PERM_MANAGE_MASTER_DATA))]


@router.get(
    "/master-data/{type}",
    response_model=list[MasterDataItemOut],
    summary="List master data items by type",
)
def list_master_data(
    type: str,
    _: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    active: bool | None = Query(default=None, description="Filter by is_active; omit for all"),
) -> list[MasterDataItemOut]:
    active_only = active is True
    return svc.list_items(db, type, active_only=active_only)


@router.post(
    "/master-data/{type}",
    response_model=MasterDataItemOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a master data item (Admin)",
)
def create_master_data(
    type: str,
    body: MasterDataCreateRequest,
    payload: ManageMasterData,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> MasterDataItemOut:
    return svc.create_item(db, type, body, payload, request)


@router.put(
    "/master-data/{type}/{item_id}",
    response_model=MasterDataItemOut,
    summary="Update / deactivate a master data item (Admin)",
)
def update_master_data(
    type: str,
    item_id: int,
    body: MasterDataUpdateRequest,
    payload: ManageMasterData,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> MasterDataItemOut:
    return svc.update_item(db, type, item_id, body, payload, request)


# ── OP Sequences ──────────────────────────────────────────────────────────────

op_seq_router = APIRouter(tags=["op-sequences"])


@op_seq_router.get(
    "/op-sequences",
    response_model=list[OpSequenceOut],
    summary="List all OP-number sequences",
)
def list_op_sequences(
    _: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> list[OpSequenceOut]:
    return op_svc.list_sequences(db)


@op_seq_router.put(
    "/op-sequences/{seq_id}",
    response_model=OpSequenceOut,
    summary="Update OP-sequence config (Admin; last_sequence not writable here)",
)
def update_op_sequence(
    seq_id: int,
    body: OpSequenceUpdateRequest,
    payload: ManageMasterData,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> OpSequenceOut:
    return op_svc.update_sequence(db, seq_id, body, payload, request)
