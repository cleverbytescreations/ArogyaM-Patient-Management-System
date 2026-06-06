"""Domain exceptions and global error handlers producing the consistent envelope
{ "error": { "code", "message", "details", "request_id" } } (BE-TF.8).

HTTP status → error code mapping mirrors API spec §6.2. Stack traces and
internal state are never forwarded to the client (SAD §10.1 control #6).
"""

from __future__ import annotations

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from jose import JWTError
from sqlalchemy.exc import DataError

# --------------------------------------------------------------------------- #
# Domain exceptions
# --------------------------------------------------------------------------- #


class AppError(Exception):
    """Base application error. Subclasses carry a stable machine error code."""

    http_status: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    error_code: str = "INTERNAL_ERROR"

    def __init__(self, message: str = "An unexpected error occurred", details: list | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or []


class NotFoundError(AppError):
    http_status = status.HTTP_404_NOT_FOUND
    error_code = "NOT_FOUND"


class ConflictError(AppError):
    http_status = status.HTTP_409_CONFLICT
    error_code = "RESOURCE_CONFLICT"


class VersionConflictError(ConflictError):
    error_code = "VERSION_CONFLICT"


class AuthError(AppError):
    http_status = status.HTTP_401_UNAUTHORIZED
    error_code = "AUTH_INVALID_CREDENTIALS"


class AccountLockedError(AppError):
    http_status = status.HTTP_403_FORBIDDEN
    error_code = "AUTH_ACCOUNT_LOCKED"


class AccountDisabledError(AppError):
    http_status = status.HTTP_403_FORBIDDEN
    error_code = "AUTH_ACCOUNT_DISABLED"


class ForbiddenError(AppError):
    http_status = status.HTTP_403_FORBIDDEN
    error_code = "ACCESS_DENIED"


class ValidationAppError(AppError):
    http_status = 422
    error_code = "VALIDATION_ERROR"


class RateLimitError(AppError):
    http_status = status.HTTP_429_TOO_MANY_REQUESTS
    error_code = "RATE_LIMITED"


class FileTooLargeError(AppError):
    http_status = 413
    error_code = "FILE_TOO_LARGE"


class InvalidFileTypeError(AppError):
    http_status = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    error_code = "INVALID_FILE_TYPE"


class ServiceUnavailableError(AppError):
    http_status = status.HTTP_503_SERVICE_UNAVAILABLE
    error_code = "SERVICE_UNAVAILABLE"


class DuplicatePatientError(ConflictError):
    error_code = "DUPLICATE_PATIENT_SUSPECTED"


class DischargeAlreadyFinalizedError(ConflictError):
    error_code = "DISCHARGE_ALREADY_FINALIZED"


class InvalidStateTransitionError(ConflictError):
    error_code = "INVALID_STATE_TRANSITION"


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


def _error_body(code: str, message: str, details: list, request_id: str) -> dict:
    return {
        "error": {"code": code, "message": message, "details": details, "request_id": request_id}
    }


# --------------------------------------------------------------------------- #
# Exception handlers — registered in main.py
# --------------------------------------------------------------------------- #


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.http_status,
        content=_error_body(exc.error_code, exc.message, exc.details, _get_request_id(request)),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = [
        {
            "field": ".".join(str(loc) for loc in err["loc"]),
            "code": err["type"],
            "message": err["msg"],
        }
        for err in exc.errors()
    ]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body(
            "VALIDATION_ERROR", "Request validation failed", details, _get_request_id(request)
        ),
    )


async def jwt_error_handler(request: Request, exc: JWTError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content=_error_body(
            "AUTH_TOKEN_INVALID", "Token is invalid or expired", [], _get_request_id(request)
        ),
        headers={"WWW-Authenticate": "Bearer"},
    )


async def db_data_error_handler(request: Request, exc: DataError) -> JSONResponse:
    """Map SQLAlchemy DataError (e.g. invalid UUID cast) to 400 Bad Request.

    This prevents non-UUID path/query values from surfacing as 500. The query
    is still parameterized — no injection is possible — but the DB type
    conversion fails, which we surface as a validation error to the client.
    """
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content=_error_body(
            "INVALID_PARAMETER",
            "A request parameter has an invalid format.",
            [],
            _get_request_id(request),
        ),
    )


async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
    import logging

    logging.getLogger(__name__).error(
        "unhandled_exception",
        extra={"exc_type": type(exc).__name__, "request_id": _get_request_id(request)},
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_body(
            "INTERNAL_ERROR", "An unexpected error occurred", [], _get_request_id(request)
        ),
    )
