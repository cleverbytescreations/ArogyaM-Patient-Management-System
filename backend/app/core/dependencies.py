"""FastAPI dependency factories for auth + RBAC (BE-TF.5).

Central enforcement — deny-by-default. Every protected endpoint declares
require_permission(...) or at minimum get_current_user.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.errors import AccountDisabledError, AccountLockedError, AuthError, ForbiddenError
from app.core.security import TOKEN_TYPE_ACCESS, decode_token
from app.core.tokens import is_denied

bearer_scheme = HTTPBearer(auto_error=False)


def _get_token(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> str:
    if not credentials:
        raise AuthError("Authentication required")
    return credentials.credentials


def get_current_user(
    token: Annotated[str, Depends(_get_token)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Decode the JWT and load the user. Returns the token payload dict."""
    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthError("Token is invalid or expired") from exc

    if payload.get("type") != TOKEN_TYPE_ACCESS:
        raise AuthError("Token is invalid or expired")

    if is_denied(payload.get("jti")):
        raise AuthError("Token is invalid or expired")

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise AuthError("Token is invalid or expired")

    # Load user from DB to confirm active status (handles mid-session disable/lock)
    from app.modules.auth.repository import get_user_by_id

    user = get_user_by_id(db, user_id)
    if user is None:
        raise AuthError("Token is invalid or expired")

    if user.status == "DISABLED":
        raise AccountDisabledError("Account is disabled")
    if user.status == "LOCKED":
        # Mirror the login-service semantics: a locked account yields
        # AUTH_ACCOUNT_LOCKED (not AUTH_ACCOUNT_DISABLED) so the client can
        # distinguish a temporary lockout from a permanent disable.
        raise AccountLockedError("Account is locked")

    # Attach DB user to payload for convenience
    payload["_db_user"] = user
    return payload


def require_active(payload: Annotated[dict, Depends(get_current_user)]) -> dict:
    """Shorthand — ensure user is ACTIVE (also checked inside get_current_user)."""
    return payload


def require_permission(*permissions: str):
    """Return a FastAPI dependency that enforces at least one permission match."""

    def _check(payload: Annotated[dict, Depends(get_current_user)]) -> dict:
        user_perms: list[str] = payload.get("permissions", [])
        for perm in permissions:
            if perm in user_perms:
                return payload
        raise ForbiddenError(f"Permission required: {', '.join(permissions)}")

    return _check


CurrentUser = Annotated[dict, Depends(get_current_user)]
