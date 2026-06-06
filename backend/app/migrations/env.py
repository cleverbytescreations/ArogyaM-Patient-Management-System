"""Alembic env.py — online (live DB) migration mode only.

DATABASE_URL is read from the environment so no credentials are baked in.
All application models are imported here so Alembic can diff them for
autogenerate (we use explicit migrations for Phase 1, but autogenerate helps
verify the DDL matches the ORM).
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# ── Import Base so Alembic sees all registered models ────────────────────────
# Auth models are the only ones in Phase 1 Sprint 1; add module imports here
# as each sprint lands new models.
from app.core.db import Base
from app.modules.auth import models as _auth_models  # noqa: F401  register tables
from app.modules.masterdata import models as _masterdata_models  # noqa: F401
from app.modules.patients import models as _patient_models  # noqa: F401

# ── Alembic Config object ─────────────────────────────────────────────────────
config = context.config

# Inject DATABASE_URL from environment only when caller hasn't already set
# sqlalchemy.url (e.g. test fixtures call set_main_option before upgrade).
if not config.get_main_option("sqlalchemy.url", None):
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        config.set_main_option("sqlalchemy.url", database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
