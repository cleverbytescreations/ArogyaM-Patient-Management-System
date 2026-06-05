"""Pydantic v2 schemas for auth and user resources (BE-T1.1).

password is never present in any response schema. All request schemas use
model_config = ConfigDict(extra='forbid') where we want to reject unknown fields.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

# bcrypt only hashes the first 72 bytes of a password; anything beyond is
# silently ignored. Reject longer secrets so callers don't get a false sense of
# strength (L1). UTF-8 byte length is what bcrypt counts, not character count.
_BCRYPT_MAX_BYTES = 72


def _validate_password_bytes(value: str) -> str:
    if len(value.encode("utf-8")) > _BCRYPT_MAX_BYTES:
        raise ValueError(f"Password must be at most {_BCRYPT_MAX_BYTES} bytes")
    return value


# --------------------------------------------------------------------------- #
# Auth request/response schemas
# --------------------------------------------------------------------------- #


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    is_active: bool


class UserProfile(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    email: str | None = None
    full_name: str
    status: str
    is_doctor: bool
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    last_login_at: datetime | None = None


class PermissionSet(BaseModel):
    permissions: list[str]
    roles: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# User management schemas (also used by users module)
# --------------------------------------------------------------------------- #


class UserCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=3, max_length=150)
    full_name: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=8, max_length=72)
    email: EmailStr | None = None
    mobile: str | None = Field(default=None, max_length=20)
    is_doctor: bool = False
    role_codes: list[str] = Field(default_factory=list)

    _check_pw = field_validator("password")(_validate_password_bytes)


class UserUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    email: EmailStr | None = None
    mobile: str | None = Field(default=None, max_length=20)
    is_doctor: bool | None = None
    role_codes: list[str] | None = None
    version: int


class UserStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(pattern="^(ACTIVE|DISABLED)$")


class PasswordResetRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    new_password: str = Field(min_length=8, max_length=72)

    _check_pw = field_validator("new_password")(_validate_password_bytes)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    username: str
    email: str | None = None
    mobile: str | None = None
    full_name: str
    status: str
    is_doctor: bool
    roles: list[str] = Field(default_factory=list)
    version: int
    created_at: datetime
    last_login_at: datetime | None = None
    password_changed_at: datetime | None = None
