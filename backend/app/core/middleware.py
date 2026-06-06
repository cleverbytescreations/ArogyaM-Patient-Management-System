"""Request-ID correlation and security-headers middlewares (BE-TF.9, SEC-T0.2).

RequestIDMiddleware: honors an inbound X-Request-ID or generates a UUID.
SecurityHeadersMiddleware: adds HTTP security headers to every response
  (X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
   Permissions-Policy, Content-Security-Policy).
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

REQUEST_ID_HEADER = "X-Request-ID"


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or str(uuid.uuid4())
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers[REQUEST_ID_HEADER] = request_id
        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds HTTP security response headers to every response (SEC-T0.2).

    These headers harden the browser-facing surface against common attacks:
    - X-Content-Type-Options: prevents MIME-sniffing attacks
    - X-Frame-Options: prevents clickjacking
    - Referrer-Policy: limits referrer leakage
    - Permissions-Policy: restricts powerful browser features
    - Content-Security-Policy: restricts resource loading to trusted sources
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # CSP: allow same-origin resources only. 'unsafe-inline' for style is
        # a pragmatic allowance for Swagger UI in dev — tighten for prod via
        # the proxy or a config-driven override when the SPA is hardened.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        return response
