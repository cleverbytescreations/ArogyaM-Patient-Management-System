"""OP-sequence management service (BE-T2.2).

Admin-only: list sequences and update prefix/padding/reset policy.
`last_sequence` is not client-settable through this path.
All changes are audited; format changes do not alter already-issued numbers.
"""

from __future__ import annotations

import json
import uuid

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.cache import cache_delete, cache_get, cache_set
from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError
from app.modules.masterdata import repository as repo
from app.modules.masterdata.schemas import OpSequenceOut, OpSequenceUpdateRequest

_OP_SEQ_CACHE_KEY = "op-sequences"


def _to_out(seq) -> OpSequenceOut:
    return OpSequenceOut.model_validate(seq)


def list_sequences(db: Session) -> list[OpSequenceOut]:
    cached = cache_get(_OP_SEQ_CACHE_KEY)
    if cached is not None:
        return [OpSequenceOut.model_validate(row) for row in json.loads(cached)]
    result = [_to_out(s) for s in repo.list_sequences(db)]
    cache_set(_OP_SEQ_CACHE_KEY, json.dumps([r.model_dump() for r in result]), ttl_sec=settings.master_data_cache_ttl_sec)
    return result


def update_sequence(
    db: Session,
    seq_id: int,
    body: OpSequenceUpdateRequest,
    actor_payload: dict,
    request=None,
) -> OpSequenceOut:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    seq = repo.get_sequence_by_id(db, seq_id)
    if seq is None:
        raise NotFoundError(f"OP sequence {seq_id} not found")

    if body.prefix is not None and repo.prefix_exists(db, body.prefix, exclude_id=seq_id):
        raise ConflictError(f"Prefix '{body.prefix}' is already used by another sequence")

    old_snap = {
        "prefix": seq.prefix,
        "padding_width": seq.padding_width,
        "number_format": seq.number_format,
        "reset_policy": seq.reset_policy,
        "is_active": seq.is_active,
    }

    if body.prefix is not None:
        seq.prefix = body.prefix
    if body.padding_width is not None:
        seq.padding_width = body.padding_width
    if body.number_format is not None:
        seq.number_format = body.number_format
    if body.reset_policy is not None:
        seq.reset_policy = body.reset_policy
    if body.is_active is not None:
        seq.is_active = body.is_active

    new_snap = {
        "prefix": seq.prefix,
        "padding_width": seq.padding_width,
        "number_format": seq.number_format,
        "reset_policy": seq.reset_policy,
        "is_active": seq.is_active,
    }

    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="op_sequence",
        entity_id=str(seq.id),
        old_value=old_snap,
        new_value=new_snap,
        description=f"Updated OP sequence for category '{seq.category_code}'",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    cache_delete(_OP_SEQ_CACHE_KEY)
    return _to_out(seq)
