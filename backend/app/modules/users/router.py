"""User & role management routes (API-T1.2).

GET /roles          — authenticated (any role)
GET/POST /users     — manage_users
GET/PUT /users/{id} — manage_users
PUT /users/{id}/status       — manage_users
POST /users/{id}/reset-password — manage_users
GET /users?is_doctor=true drives the doctor picker (no separate doctor table).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_db, require_permission
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
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
    pagination: Annotated[PaginationParams, Depends()],
    q: str | None = Query(default=None, description="Search by name/username/email"),
    is_doctor: bool | None = Query(default=None),
    status: str | None = Query(default=None, pattern="^(ACTIVE|DISABLED|LOCKED)$"),
) -> dict:
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
    payload: ManageUsers,
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    return service.get_user(db, user_id)


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
