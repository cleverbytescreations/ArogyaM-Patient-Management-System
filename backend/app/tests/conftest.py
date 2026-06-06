"""Pytest fixtures for integration tests (TST-T0.1).

Uses a real PostgreSQL database — required for pg_trgm/citext/uuid-ossp.
DATABASE_URL defaults to the dev Docker Postgres with an isolated test database
(arogyam_test). Run inside the api container or point TEST_DATABASE_URL at a
reachable Postgres instance.

Fixture hierarchy:
  db_engine (session-scoped) — creates DB, runs migrations, yields engine
  db (function-scoped)       — transaction rolled back after each test
  client (function-scoped)   — TestClient with DB override injected
  admin_token / doctor_token / reception_token — ready-to-use JWTs
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import hash_password
from app.main import app
from app.modules.auth.models import Role, User, UserRole

# ── Database URL ───────────────────────────────────────────────────────────────
# Derive from DATABASE_URL (which uses the Docker service name 'db') so that
# when running inside a container we reach the correct host automatically.
_PROD_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam"
)
_BASE_URL = _PROD_URL.rsplit("/", 1)[0]  # strip the db name
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", f"{_BASE_URL}/arogyam_test")

# Admin DB URL for CREATE DATABASE (uses the main 'arogyam' DB)
_ADMIN_URL = _PROD_URL


def _create_test_db() -> None:
    """Create arogyam_test database if it doesn't exist."""
    engine = create_engine(_ADMIN_URL, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        db_name = TEST_DATABASE_URL.rsplit("/", 1)[-1]
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": db_name}
        ).first()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{db_name}"'))
    engine.dispose()


def _run_migrations(url: str) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    # Use render_as_string to avoid SQLAlchemy masking the password as ***
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session")
def db_engine():
    _create_test_db()
    _run_migrations(TEST_DATABASE_URL)
    engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db(db_engine) -> Generator[Session, None, None]:
    """Function-scoped session.

    Uses SQLAlchemy 2.x join_transaction_mode="create_savepoint" so that
    service-level session.commit() releases a SAVEPOINT rather than committing
    the outer connection transaction, keeping each test fully isolated.
    """
    with db_engine.connect() as conn:
        conn.begin()
        with Session(
            bind=conn,
            autoflush=False,
            autocommit=False,
            join_transaction_mode="create_savepoint",
        ) as session:
            yield session
        conn.rollback()


# ── User/role helpers ─────────────────────────────────────────────────────────


def _ensure_role(db: Session, code: str, name: str) -> Role:
    from sqlalchemy import select

    role = db.execute(select(Role).where(Role.code == code)).scalar_one_or_none()
    if role is None:
        role = Role(code=code, name=name, is_active=True)
        db.add(role)
        db.flush()
    return role


def _make_user(db: Session, username: str, role_code: str, is_doctor: bool = False) -> User:
    role_names = {
        "ADMIN": "Administrator",
        "DOCTOR": "Doctor",
        "RECEPTION": "Receptionist",
        "DATA_ENTRY": "Data Entry Staff",
    }
    role = _ensure_role(db, role_code, role_names.get(role_code, role_code))
    user = User(
        id=uuid.uuid4(),
        username=username,
        full_name=f"Test {username}",
        password_hash=hash_password("TestPass123!"),
        status="ACTIVE",
        is_doctor=is_doctor,
        password_changed_at=datetime.now(UTC),
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    db.flush()
    return user


@pytest.fixture
def admin_user(db: Session) -> User:
    return _make_user(db, f"admin_{uuid.uuid4().hex[:6]}", "ADMIN")


@pytest.fixture
def doctor_user(db: Session) -> User:
    return _make_user(db, f"doctor_{uuid.uuid4().hex[:6]}", "DOCTOR", is_doctor=True)


@pytest.fixture
def reception_user(db: Session) -> User:
    return _make_user(db, f"reception_{uuid.uuid4().hex[:6]}", "RECEPTION")


def _token_for(user: User) -> str:
    class _FakeDB:
        pass

    # Build a minimal user-role structure for token generation
    from app.core.permissions import resolve_permissions
    from app.core.security import build_token_claims, create_access_token

    role_codes = [ur.role.code for ur in user.user_roles if ur.role.is_active]
    permissions = resolve_permissions(role_codes)
    claims = build_token_claims(
        user_id=str(user.id),
        username=user.username,
        roles=role_codes,
        permissions=permissions,
        is_doctor=user.is_doctor,
    )
    return create_access_token(claims)


@pytest.fixture
def admin_token(admin_user: User) -> str:
    return _token_for(admin_user)


@pytest.fixture
def doctor_token(doctor_user: User) -> str:
    return _token_for(doctor_user)


@pytest.fixture
def reception_token(reception_user: User) -> str:
    return _token_for(reception_user)


# ── TestClient ─────────────────────────────────────────────────────────────────


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    def _override_db():
        yield db

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _reset_token_denylist() -> Generator[None, None, None]:
    """The in-process JWT denylist is module-global; clear it between tests."""
    from app.core.tokens import reset

    reset()
    yield
    reset()


@pytest.fixture(autouse=True)
def _reset_rate_limit() -> Generator[None, None, None]:
    """The in-process rate-limit counter is module-global; clear it between tests."""
    from app.core.ratelimit import reset

    reset()
    yield
    reset()
