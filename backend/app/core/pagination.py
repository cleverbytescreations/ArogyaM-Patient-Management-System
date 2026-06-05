"""Shared pagination/sort/filter helpers (BE-TF.9).

All list endpoints return { items, total, page, page_size }.
page_size > 100 is rejected; page/page_size default to 1/20.
"""

from __future__ import annotations

from typing import Any

from fastapi import Query
from pydantic import BaseModel

from app.core.errors import ValidationAppError

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


class PagedResponse[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class PaginationParams:
    def __init__(
        self,
        page: int = Query(default=1, ge=1, description="Page number (1-based)"),
        page_size: int = Query(
            default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"
        ),
        sort: str | None = Query(
            default=None, description="Field to sort by (resource allow-list)"
        ),
        order: str = Query(default="asc", pattern="^(asc|desc)$", description="asc | desc"),
    ) -> None:
        self.page = page
        self.page_size = page_size
        self.sort = sort
        self.order = order

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size

    def resolve_sort(self, allowed: set[str], default: str) -> tuple[str, bool]:
        """Validate ``sort`` against a per-resource allow-list.

        Returns ``(field, descending)``. An unknown sort field raises a 422 so
        callers cannot order by arbitrary columns. ``order`` is already
        constrained to asc|desc by the query validator.
        """
        field = self.sort or default
        if field not in allowed:
            raise ValidationAppError(
                "Invalid sort field",
                details=[
                    {
                        "field": "sort",
                        "code": "invalid_sort",
                        "message": f"Allowed sort fields: {', '.join(sorted(allowed))}",
                    }
                ],
            )
        return field, self.order == "desc"


def paginate(items: list[Any], total: int, params: PaginationParams) -> dict[str, Any]:
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "page_size": params.page_size,
    }
