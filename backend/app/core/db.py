"""SQLAlchemy engine + session factory (Implementation Plan §4.1 `core/db.py`).

`echo` is driven by config and must stay False outside local debugging — SQL
echo would leak PHI into logs (SAD §10.1).
"""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from .config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    echo=settings.sql_echo,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def check_database() -> None:
    """Raise if the database is unreachable. Used by the readiness probe."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
