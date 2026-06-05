"""Auth & session routes (API-T1.1): POST /auth/login|refresh|logout, GET /me|/me/permissions."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_db
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    PermissionSet,
    RefreshRequest,
    TokenResponse,
    UserProfile,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse, summary="Authenticate and receive JWT tokens")
def login(
    body: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    return service.login(db, body.username, body.password, request)


@router.post("/refresh", response_model=TokenResponse, summary="Rotate refresh token")
def refresh(
    body: RefreshRequest,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    return service.refresh_tokens(db, body.refresh_token)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Invalidate current session (client must discard tokens)",
)
def logout(payload: CurrentUser) -> Response:
    # Without Redis, logout is client-side token discard (short access TTL).
    # With Redis enabled, jti would be added to a denylist here.
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserProfile, summary="Current user profile + roles + permissions")
def me(
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    return service.get_me(payload, db)


@router.get("/me/permissions", response_model=PermissionSet, summary="Effective permission set for the current user")
def my_permissions(payload: CurrentUser) -> PermissionSet:
    return service.get_my_permissions(payload)