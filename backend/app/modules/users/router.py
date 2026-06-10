"""User & role management routes (API-T1.2).

GET /roles          — authenticated (any role)
GET/POST /users     — manage_users (except the doctor-picker case below)
GET/PUT /users/{id} — manage_users (except doctor lookups, see below)
PUT /users/{id}/status       — manage_users
POST /users/{id}/reset-password — manage_users

Doctor picker (no separate doctor table): any authenticated user may call
GET /users?is_doctor=true (and GET /users/{id} for a user with is_doctor=true)
so that staff creating visits/prescriptions/discharge summaries can search for
and resolve doctor names. The full staff directory remains manage_users-only.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_db, require_permission
from app.core.errors import ForbiddenError, NotFoundError
from app.core.pagination import PaginationParams, paginate
from app.core.permissions import PERM_MANAGE_USERS
from app.modules.auth import repository as auth_repo
from app.modules.auth.schemas import (
    PasswordResetRequest,
    RoleOut,
    UserCreateRequest,
    UserOut,
    UserStatusUpdateRequest,
    UserUpdateRequest,
)
from app.modules.users import service
from app.modules.users.repository import SORTABLE_FIELDS

router = APIRouter(prefix="/users", tags=["users"])
roles_router = APIRouter(prefix="/roles", tags=["roles"])

ManageUsers = Annotated[dict, Depends(require_permission(PERM_MANAGE_USERS))]


@roles_router.get("", response_model=list[RoleOut], summary="List all active roles")
def list_roles(
    _: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> list[RoleOut]:
    return [RoleOut.model_validate(r) for r in auth_repo.get_all_roles(db)]


@router.post(
    "", response_model=UserOut, status_code=status.HTTP_201_CREATED, summary="Create a new user"
)
def create_user(
    body: UserCreateRequest,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> UserOut:
    return service.create_user(db, body, payload, request)


@router.get("", summary="List / search users")
def list_users(
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    q: str | None = Query(default=None, description="Search by name/username/email"),
    is_doctor: bool | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(ACTIVE|DISABLED|LOCKED)$"),
) -> dict:
    # Doctor picker: any authenticated user may search/list doctors only.
    # Anything broader (full directory, non-doctor filters) stays manage_users-gated.
    if is_doctor is not True and PERM_MANAGE_USERS not in payload.get("permissions", []):
        raise ForbiddenError(f"Permission required: {PERM_MANAGE_USERS}")

    sort, descending = pagination.resolve_sort(SORTABLE_FIELDS, default="full_name")
    users, total = service.list_users(
        db,
        q=q,
        is_doctor=is_doctor,
        status=status,
        limit=pagination.page_size,
        offset=pagination.offset,
        sort=sort,
        descending=descending,
    )
    return paginate(users, total, pagination)


@router.get("/{user_id}", response_model=UserOut, summary="Get user by ID")
def get_user(
    user_id: str,
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    user_out = service.get_user(db, user_id)
    # Doctor picker: any authenticated user may resolve a doctor's name by id.
    # Looking up non-doctor staff stays manage_users-gated. Respond 404 (not 403)
    # for non-doctor targets so a non-privileged caller can't use this endpoint
    # to enumerate which arbitrary user IDs belong to staff accounts.
    if not user_out.is_doctor and PERM_MANAGE_USERS not in payload.get("permissions", []):
        raise NotFoundError(f"User {user_id} not found")
    return user_out


@router.put("/{user_id}", response_model=UserOut, summary="Update user (version-checked)")
def update_user(
    user_id: str,
    body: UserUpdateRequest,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> UserOut:
    return service.update_user(db, user_id, body, payload, request)


@router.put("/{user_id}/status", response_model=UserOut, summary="Enable or disable a user account")
def set_user_status(
    user_id: str,
    body: UserStatusUpdateRequest,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> UserOut:
    return service.set_user_status(db, user_id, body, payload, request)


@router.post(
    "/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset a user's password and clear lockout",
)
def reset_password(
    user_id: str,
    body: PasswordResetRequest,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> Response:
    service.reset_password(db, user_id, body, payload, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/{user_id}/signature",
    response_model=UserOut,
    summary="Upload or replace a doctor's signature image",
)
def upload_signature(
    user_id: str,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
    file: Annotated[UploadFile, File(...)],
) -> UserOut:
    return service.set_user_signature(db, user_id, file, payload, request)


@router.get("/{user_id}/signature", summary="Securely stream a doctor's signature image")
def get_signature(
    user_id: str,
    _: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
) -> StreamingResponse:
    download = service.get_user_signature(db, user_id)
    headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if download.content_length is not None:
        headers["Content-Length"] = str(download.content_length)
    return StreamingResponse(
        download.body,
        media_type=download.content_type or "application/octet-stream",
        headers=headers,
    )


@router.delete(
    "/{user_id}/signature",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a doctor's signature image",
)
def delete_signature(
    user_id: str,
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    request: Request,
) -> Response:
    service.delete_user_signature(db, user_id, payload, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
