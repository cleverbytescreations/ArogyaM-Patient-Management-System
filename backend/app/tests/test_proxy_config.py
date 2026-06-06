"""Proxy access-log query-string redaction tests (LOG-T0.2).

Verifies that both nginx config files use the ``$uri`` variable (path only, no
query string) in their ``log_format noquery`` block so that search terms,
OP numbers, and mobile numbers appearing in query parameters are **never**
written to proxy logs (SAD §10.1 control #7).

Nginx configs are accessed in two ways:
- Inside the Docker API container: ``./nginx`` is mounted at ``/app/nginx``
  (added to docker-compose.dev.yml under the ``api`` service).
- Outside Docker (local dev): discovered by navigating from ``__file__`` up to
  the repository root and then into ``nginx/``.

All tests in this module are skipped automatically when the nginx directory is
not accessible from the current runtime environment.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest


def _locate_nginx_dir() -> Path:
    """Return the directory that contains nginx.dev.conf and nginx.prod.conf.

    Searched in order:
    1. ``/app/nginx`` — Docker volume mount added in docker-compose.dev.yml.
    2. ``<repo-root>/nginx`` — local dev (test file is at backend/app/tests/).
    """
    docker_mount = Path("/app/nginx")
    if docker_mount.is_dir():
        return docker_mount
    # Local dev: __file__ resolves to .../ArogyaM/backend/app/tests/test_proxy_config.py
    # parents[3] is the repository root (.../ArogyaM/)
    local_root = Path(__file__).resolve().parents[3]
    return local_root / "nginx"


NGINX_DIR = _locate_nginx_dir()

_CONF_IDS = ["dev", "prod"]
_CONF_FILES = [
    NGINX_DIR / "nginx.dev.conf",
    NGINX_DIR / "nginx.prod.conf",
]


@pytest.fixture(autouse=True)
def _require_nginx_dir() -> None:
    """Skip every test in this module when nginx configs are not accessible."""
    if not NGINX_DIR.is_dir():
        pytest.skip(
            f"Nginx config directory not accessible from this environment: {NGINX_DIR}"
        )


# ── Individual config checks ──────────────────────────────────────────────────


@pytest.mark.parametrize("config_path", _CONF_FILES, ids=_CONF_IDS)
def test_noquery_log_format_defined(config_path: Path) -> None:
    """LOG-T0.2: Each nginx config defines a 'noquery' log_format block."""
    assert config_path.exists(), f"Config file missing: {config_path}"
    content = config_path.read_text()
    assert re.search(r"log_format\s+noquery\b", content), (
        f"'log_format noquery' block not found in {config_path.name}"
    )


@pytest.mark.parametrize("config_path", _CONF_FILES, ids=_CONF_IDS)
def test_noquery_format_uses_uri_not_request(config_path: Path) -> None:
    """LOG-T0.2: noquery log_format logs $uri (path only) — not $request (path+query)."""
    assert config_path.exists(), f"Config file missing: {config_path}"
    content = config_path.read_text()

    match = re.search(r"log_format\s+noquery\s+(.*?);", content, re.DOTALL)
    assert match, f"Cannot extract 'log_format noquery' body from {config_path.name}"
    body = match.group(1)

    assert "$uri" in body, (
        f"log_format noquery must use $uri (path only, no query string) in {config_path.name}"
    )
    # $request expands to the full first line: "GET /path?q=foo HTTP/1.1"
    # It must NOT appear in the noquery format.
    assert "$request " not in body, (
        f"log_format noquery must not log $request (includes query string) in {config_path.name}"
    )


@pytest.mark.parametrize("config_path", _CONF_FILES, ids=_CONF_IDS)
def test_noquery_format_excludes_query_variables(config_path: Path) -> None:
    """LOG-T0.2: noquery format must not contain $args or $query_string."""
    assert config_path.exists(), f"Config file missing: {config_path}"
    content = config_path.read_text()

    match = re.search(r"log_format\s+noquery\s+(.*?);", content, re.DOTALL)
    assert match, f"Cannot extract 'log_format noquery' body from {config_path.name}"
    body = match.group(1)

    assert "$args" not in body, (
        f"$args must not appear in noquery log_format in {config_path.name}"
    )
    assert "$query_string" not in body, (
        f"$query_string must not appear in noquery log_format in {config_path.name}"
    )


@pytest.mark.parametrize("config_path", _CONF_FILES, ids=_CONF_IDS)
def test_access_log_references_noquery_format(config_path: Path) -> None:
    """LOG-T0.2: access_log directive in the server block references the noquery format."""
    assert config_path.exists(), f"Config file missing: {config_path}"
    content = config_path.read_text()

    assert re.search(r"access_log\s+\S+\s+noquery\s*;", content), (
        f"access_log must reference 'noquery' format in {config_path.name}"
    )
