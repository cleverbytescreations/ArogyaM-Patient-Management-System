"""Security primitives: password hashing and JWT issue/verify (BE-TF.4).

Access token TTL ~15 min, refresh token TTL ~8 h (both configurable).
JWT claims: sub, username, roles, permissions, is_doctor, type, iat, exp, jti.
A post-password extensibility seam (verify -> issue_tokens) allows MFA to be
inserted between credential verification and token issuance in a later phase.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_REFRESH = "refresh"


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def _build_token(data: dict[str, Any], ttl_minutes: int, token_type: str) -> str:
    now = datetime.now(UTC)
    payload = {
        **data,
        "type": token_type,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + timedelta(minutes=ttl_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(data: dict[str, Any]) -> str:
    return _build_token(data, settings.jwt_access_ttl_min, TOKEN_TYPE_ACCESS)


def create_refresh_token(data: dict[str, Any]) -> str:
    return _build_token(data, settings.jwt_refresh_ttl_min, TOKEN_TYPE_REFRESH)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT. Raises JWTError on any failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def build_token_claims(
    user_id: str,
    username: str,
    roles: list[str],
    permissions: list[str],
    is_doctor: bool,
) -> dict[str, Any]:
    return {
        "sub": user_id,
        "username": username,
        "roles": roles,
        "permissions": permissions,
        "is_doctor": is_doctor,
    }


# Post-password extensibility seam — MFA can be inserted here in a future phase.
def post_password_hook(user_id: str) -> None:  # noqa: ARG001
    pass