"""Auth service: login, refresh, logout, /me (BE-T1.2, BE-T1.3, BE-T1.4).

Login always returns AUTH_INVALID_CREDENTIALS for bad user OR bad password to
prevent username enumeration (UC-01 BR3 / SAD §8.1). Locked/disabled accounts
return distinct errors only after credential verification succeeds — this limits
enumeration leakage while still informing legitimate users about their status.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from jose import JWTError
from sqlalchemy.orm import Session

from app.core.audit import extract_request_meta, write_audit
from app.core.config import settings
from app.core.errors import AccountDisabledError, AccountLockedError, AuthError
from app.core.permissions import resolve_permissions
from app.core.security import (
    TOKEN_TYPE_REFRESH,
    build_token_claims,
    create_access_token,
    create_refresh_token,
    decode_token,
    post_password_hook,
    verify_password,
)
from app.modules.auth import repository as repo
from app.modules.auth.schemas import PermissionSet, TokenResponse, UserProfile

logger = logging.getLogger(__name__)


def _user_role_codes(user) -> list[str]:  # type: ignore[no-untyped-def]
    return [ur.role.code for ur in user.user_roles if ur.role.is_active]


def _issue_tokens(user) -> TokenResponse:  # type: ignore[no-untyped-def]
    role_codes = _user_role_codes(user)
    permissions = resolve_permissions(role_codes)
    claims = build_token_claims(
        user_id=str(user.id),
        username=user.username,
        roles=role_codes,
        permissions=permissions,
        is_doctor=user.is_doctor,
    )
    return TokenResponse(
        access_token=create_access_token(claims),
        refresh_token=create_refresh_token(claims),
        expires_in=settings.jwt_access_ttl_min * 60,
    )


def login(db: Session, username: str, password: str, request=None) -> TokenResponse:  # type: ignore[no-untyped-def]
    ip, ua, rid = extract_request_meta(request)

    user = repo.get_user_by_username(db, username)

    # Always perform a dummy hash comparison when user is not found to prevent
    # timing attacks that could enumerate valid usernames. The hash is a real
    # bcrypt hash of a throwaway string so verify_password takes the same time.
    _DUMMY_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBKBtzsF4Yhu02"
    if user is None:
        verify_password(password, _DUMMY_HASH)
        write_audit(
            db,
            action="LOGIN_FAILURE",
            description="Login attempt for unknown username",
            ip_address=ip,
            user_agent=ua,
            request_id=rid,
        )
        db.commit()
        raise AuthError("Invalid credentials")

    # Verify password first — same error regardless of account status so that
    # account state is not exposed to unauthenticated callers.
    password_ok = verify_password(password, user.password_hash)

    if not password_ok:
        locked_until = None
        new_attempts = user.failed_login_attempts + 1
        if new_attempts >= settings.login_max_attempts:
            locked_until = datetime.now(UTC) + timedelta(minutes=settings.login_lockout_min)
        repo.increment_failed_attempts(db, user.id, locked_until)
        write_audit(
            db,
            action="LOGIN_FAILURE",
            user_id=user.id,
            user_role=",".join(_user_role_codes(user)),
            entity_type="user",
            entity_id=str(user.id),
            description="Invalid password",
            ip_address=ip,
            user_agent=ua,
            request_id=rid,
        )
        db.commit()
        raise AuthError("Invalid credentials")

    # Credentials verified — now check account state
    if user.status == "DISABLED":
        raise AccountDisabledError("Account is disabled")

    if user.status == "LOCKED" or (
        user.locked_until is not None and user.locked_until.replace(tzinfo=UTC) > datetime.now(UTC)
    ):
        raise AccountLockedError("Account is temporarily locked due to too many failed login attempts")

    # Success — reset counters, stamp last_login_at, issue tokens
    repo.reset_login_counters(db, user.id)
    post_password_hook(str(user.id))

    tokens = _issue_tokens(user)

    write_audit(
        db,
        action="LOGIN",
        user_id=user.id,
        user_role=",".join(_user_role_codes(user)),
        entity_type="user",
        entity_id=str(user.id),
        description="Successful login",
        ip_address=ip,
        user_agent=ua,
        request_id=rid,
    )
    db.commit()
    return tokens


def refresh_tokens(db: Session, refresh_token: str) -> TokenResponse:
    try:
        payload = decode_token(refresh_token)
    except JWTError:
        raise AuthError("Refresh token is invalid or expired")

    if payload.get("type") != TOKEN_TYPE_REFRESH:
        raise AuthError("Refresh token is invalid or expired")

    user_id = payload.get("sub")
    if not user_id:
        raise AuthError("Refresh token is invalid or expired")

    user = repo.get_user_by_id(db, user_id)
    if user is None or user.status != "ACTIVE":
        raise AuthError("Refresh token is invalid or expired")

    return _issue_tokens(user)


def get_me(payload: dict, db: Session) -> UserProfile:
    user = payload["_db_user"]
    role_codes = _user_role_codes(user)
    permissions = resolve_permissions(role_codes)
    return UserProfile(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        status=user.status,
        is_doctor=user.is_doctor,
        roles=role_codes,
        permissions=permissions,
        last_login_at=user.last_login_at,
    )


def get_my_permissions(payload: dict) -> PermissionSet:
    return PermissionSet(permissions=payload.get("permissions", []))