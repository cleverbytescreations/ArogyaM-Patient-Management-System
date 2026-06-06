"""Auth & session routes (API-T1.1).

POST /auth/login | /auth/refresh | /auth/logout  (auth_router, prefix /auth)
GET  /me | /me/permissions                       (me_router, no prefix)

`/me` and `/me/permissions` are top-level paths per API spec §7.1 — they are NOT
nested under /auth.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.dependencies import CurrentUser, get_db
from app.core.ratelimit import check_login_rate_limit
from app.core.tokens import deny
from app.modules.auth import service
from app.modules.auth.schemas import (
    LoginRequest,
    PermissionSet,
    RefreshRequest,
    TokenResponse,
    UserProfile,
)

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


def _client_identifier(request: Request) -> str:
    """Resolve the real client IP for rate limiting.

    Behind the reverse proxy the TCP peer (``request.client.host``) is the proxy
    container, so every client would otherwise share one bucket. nginx sets
    ``X-Real-IP`` to ``$remote_addr`` (the client as seen by the proxy) — trust
    that first. We deliberately do NOT trust the leftmost ``X-Forwarded-For``
    entry, which is client-supplied and therefore spoofable.
    """
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=TokenResponse, summary="Authenticate and receive JWT tokens")
def login(
    body: LoginRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
) -> TokenResponse:
    # Rate limit by real client IP (X-Real-IP behind the proxy, TCP peer
    # otherwise). Raises 429 when exceeded.
    check_login_rate_limit(_client_identifier(request))
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
    summary="Invalidate the current access token",
)
def logout(payload: CurrentUser) -> Response:
    # Deny the presented access token's jti until its own expiry so it cannot be
    # reused after logout. Backed by Redis when configured, in-process otherwise.
    deny(payload.get("jti"), payload.get("exp"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@me_router.get(
    "/me", response_model=UserProfile, summary="Current user profile + roles + permissions"
)
def me(
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> UserProfile:
    return service.get_me(payload, db)


@me_router.get(
    "/me/permissions",
    response_model=PermissionSet,
    summary="Effective permission set for the current user",
)
def my_permissions(payload: CurrentUser) -> PermissionSet:
    return service.get_my_permissions(payload)
