"""Reusable optimistic concurrency helpers (BE-T14.1)."""

from __future__ import annotations

from typing import Protocol

from app.core.errors import VersionConflictError


class VersionedRecord(Protocol):
    version: int


def ensure_current_version(record: VersionedRecord, client_version: int) -> None:
    """Raise VERSION_CONFLICT when a client edits a stale row version."""
    if record.version != client_version:
        raise VersionConflictError("Record was modified by another request; reload and retry")


def bump_version(record: VersionedRecord) -> None:
    """Increment a mutable record's optimistic-lock version."""
    record.version += 1
