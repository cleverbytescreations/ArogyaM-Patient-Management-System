"""User management service: CRUD, enable/disable, reset password (BE-T1.5).

All mutating operations require manage_users permission and are audited. Role
changes are separately logged per UC-02 BR4. Version conflicts return 409.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.errors import ConflictError, NotFoundError, VersionConflictError
from app.core.security import hash_password
from app.modules.auth import repository as auth_repo
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    PasswordResetRequest,
    UserCreateRequest,
    UserOut,
    UserStatusUpdateRequest,
    UserUpdateRequest,
)
from app.modules.users import repository as user_repo

logger = logging.getLogger(__name__)


def _user_role_codes(user: User) -> list[str]:
    return [ur.role.code for ur in user.user_roles if ur.role.is_active]


def _to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        mobile=user.mobile,
        full_name=user.full_name,
        status=user.status,
        is_doctor=user.is_doctor,
        is_superuser=user.is_superuser,
        roles=_user_role_codes(user),
        version=user.version,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        password_changed_at=user.password_changed_at,
    )


def create_user(
    db: Session,
    body: UserCreateRequest,
    actor_payload: dict,
    request=None,
) -> UserOut:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    if user_repo.username_exists(db, body.username):
        raise ConflictError(f"Username '{body.username}' is already taken")
    if body.email and user_repo.email_exists(db, body.email):
        raise ConflictError(f"Email '{body.email}' is already registered")

    # Resolve roles
    roles = auth_repo.get_roles_by_codes(db, body.role_codes) if body.role_codes else []
    found_codes = {r.code for r in roles}
    invalid = set(body.role_codes) - found_codes
    if invalid:
        raise ConflictError(f"Unknown role codes: {', '.join(sorted(invalid))}")

    user = User(
        username=body.username,
        full_name=body.full_name,
        email=body.email,
        mobile=body.mobile,
        password_hash=hash_password(body.password),
        is_doctor=body.is_doctor,
        status="ACTIVE",
        password_changed_at=datetime.now(UTC),
        created_by=actor_id,
        updated_by=actor_id,
    )
    user_repo.create_user(db, user)
    user_repo.assign_roles(db, user.id, [r.id for r in roles], actor_id)
    db.flush()

    # Reload to get relationships populated
    created = user_repo.get_user_by_id(db, user.id)
    assert created is not None

    write_audit(
        db,
        action="CREATE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="user",
        entity_id=str(created.id),
        new_value={"username": created.username, "roles": _user_role_codes(created)},
        description=f"Created user {created.username}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()

    result = user_repo.get_user_by_id(db, created.id)
    assert result is not None
    return _to_out(result)


def get_user(db: Session, user_id: str) -> UserOut:
    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    return _to_out(user)


def list_users(
    db: Session,
    q: str | None,
    is_doctor: bool | None,
    status: str | None,
    limit: int,
    offset: int,
    sort: str = "full_name",
    descending: bool = False,
) -> tuple[list[UserOut], int]:
    users, total = user_repo.list_users(
        db,
        q=q,
        is_doctor=is_doctor,
        status=status,
        sort=sort,
        descending=descending,
        limit=limit,
        offset=offset,
    )
    return [_to_out(u) for u in users], total


def update_user(
    db: Session,
    user_id: str,
    body: UserUpdateRequest,
    actor_payload: dict,
    request=None,
) -> UserOut:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    if user.version != body.version:
        raise VersionConflictError("Record was modified by another request; reload and retry")
    if user.is_superuser and (body.role_codes is not None or body.is_doctor is not None):
        raise ConflictError("The super-user account's roles and doctor flag cannot be changed")

    old_roles = _user_role_codes(user)
    old_snap = {
        "full_name": user.full_name,
        "email": user.email,
        "is_doctor": user.is_doctor,
        "roles": old_roles,
    }

    if body.email and user_repo.email_exists(db, body.email, exclude_id=user.id):
        raise ConflictError(f"Email '{body.email}' is already registered")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.email is not None:
        user.email = body.email
    if body.mobile is not None:
        user.mobile = body.mobile
    if body.is_doctor is not None:
        user.is_doctor = body.is_doctor
    user.version += 1
    user.updated_by = actor_id

    new_roles = old_roles
    if body.role_codes is not None:
        roles = auth_repo.get_roles_by_codes(db, body.role_codes)
        invalid = set(body.role_codes) - {r.code for r in roles}
        if invalid:
            raise ConflictError(f"Unknown role codes: {', '.join(sorted(invalid))}")
        user_repo.assign_roles(db, user.id, [r.id for r in roles], actor_id)
        new_roles = [r.code for r in roles]

    new_snap = {
        "full_name": user.full_name,
        "email": user.email,
        "is_doctor": user.is_doctor,
        "roles": new_roles,
    }

    write_audit(
        db,
        action="UPDATE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="user",
        entity_id=str(user.id),
        old_value=old_snap,
        new_value=new_snap,
        description=f"Updated user {user.username}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()

    result = user_repo.get_user_by_id(db, user.id)
    assert result is not None
    return _to_out(result)


def set_user_status(
    db: Session,
    user_id: str,
    body: UserStatusUpdateRequest,
    actor_payload: dict,
    request=None,
) -> UserOut:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found")
    if user.is_superuser:
        raise ConflictError("The super-user account cannot be disabled")
    if str(user.id) == str(actor_id) and body.status == "DISABLED":
        raise ConflictError("You cannot disable your own account")

    old_status = user.status
    user.status = body.status
    user.updated_by = actor_id

    write_audit(
        db,
        action="STATUS_CHANGE",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="user",
        entity_id=str(user.id),
        old_value={"status": old_status},
        new_value={"status": body.status},
        description=f"User status changed to {body.status}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    result = user_repo.get_user_by_id(db, user.id)
    assert result is not None
    return _to_out(result)


def reset_password(
    db: Session,
    user_id: str,
    body: PasswordResetRequest,
    actor_payload: dict,
    request=None,
) -> None:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])

    user = user_repo.get_user_by_id(db, user_id)
    if user is None:
        raise NotFoundError(f"User {user_id} not found")

    user.password_hash = hash_password(body.new_password)
    user.password_changed_at = datetime.now(UTC)
    user.failed_login_attempts = 0
    user.locked_until = None
    if user.status == "LOCKED":
        user.status = "ACTIVE"
    user.updated_by = actor_id

    write_audit(
        db,
        action="PASSWORD_RESET",
        user_id=actor_id,
        user_role=",".join(actor_payload.get("roles", [])),
        entity_type="user",
        entity_id=str(user.id),
        description=f"Password reset for user {user.username}",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
