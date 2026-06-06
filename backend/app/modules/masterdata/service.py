"""Master data service — list, create, update/deactivate (BE-T2.1).

Read = any authenticated user.
Write = manage_master_data (Admin), audited.
Unknown type → 404; duplicate type+code → 409.
Inactive values retained for history; hidden from new-record pickers via is_active.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.cache import cache_delete, cache_get, cache_set
from app.core.errors import ConflictError, NotFoundError
from app.modules.masterdata import repository as repo
from app.modules.masterdata.models import MasterDataItem, VALID_MASTER_DATA_TYPES
from app.modules.masterdata.schemas import (
    MasterDataCreateRequest,
    MasterDataItemOut,
    MasterDataUpdateRequest,
)


def _validate_type(data_type: str) -> None:
    if data_type not in VALID_MASTER_DATA_TYPES:
        raise NotFoundError(f"Unknown master data type: '{data_type}'")


def _to_out(item: MasterDataItem) -> MasterDataItemOut:
    return MasterDataItemOut.model_validate(item)


def _cache_key(data_type: str, active_only: bool) -> str:
    suffix = "active" if active_only else "all"
    return f"masterdata:{data_type}:{suffix}"


def _invalidate(data_type: str) -> None:
    cache_delete(_cache_key(data_type, False), _cache_key(data_type, True))


def list_items(
    db: Session, data_type: str, active_only: bool = False
) -> list[MasterDataItemOut]:
    _validate_type(data_type)
    key = _cache_key(data_type, active_only)
    cached = cache_get(key)
    if cached is not None:
        return [MasterDataItemOut.model_validate(row) for row in json.loads(cached)]
    items = repo.list_by_type(db, data_type, active_only=active_only)
    result = [_to_out(i) for i in items]
    cache_set(key, json.dumps([r.model_dump() for r in result]))
    return result


def create_item(
    db: Session,
    data_type: str,
    body: MasterDataCreateRequest,
    actor_payload: dict,
    request=None,
) -> MasterDataItemOut:
    _validate_type(data_type)
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    if repo.code_exists_in_type(db, data_type, body.code):
        raise ConflictError(f"Code '{body.code}' already exists in type '{data_type}'")

    item = MasterDataItem(
        type=data_type,
        code=body.code,
        label=body.label,
        sort_order=body.sort_order,
        is_active=True,
        created_by=actor_id,
        updated_by=actor_id,
    )
    repo.create_item(db, item)

    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="master_data",
        entity_id=str(item.id),
        new_value={"type": data_type, "code": body.code, "label": body.label},
        description=f"Created master_data {data_type}/{body.code}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    _invalidate(data_type)
    return _to_out(item)


def update_item(
    db: Session,
    data_type: str,
    item_id: int,
    body: MasterDataUpdateRequest,
    actor_payload: dict,
    request=None,
) -> MasterDataItemOut:
    _validate_type(data_type)
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    item = repo.get_by_id(db, item_id)
    if item is None or item.type != data_type:
        raise NotFoundError(f"Master data item {item_id} not found in type '{data_type}'")

    old_snap = {"label": item.label, "sort_order": item.sort_order, "is_active": item.is_active}

    if body.label is not None:
        item.label = body.label
    if body.sort_order is not None:
        item.sort_order = body.sort_order
    if body.is_active is not None:
        item.is_active = body.is_active
    item.updated_by = actor_id

    repo.save(db, item)

    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="master_data",
        entity_id=str(item.id),
        old_value=old_snap,
        new_value={"label": item.label, "sort_order": item.sort_order, "is_active": item.is_active},
        description=f"Updated master_data {data_type}/{item.code}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    _invalidate(data_type)
    return _to_out(item)
