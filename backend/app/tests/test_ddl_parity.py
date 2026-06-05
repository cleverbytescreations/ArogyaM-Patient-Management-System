"""DDL ↔ migration parity drift guard (DB-T0.1, DB-T0.4, TST-T0.3).

`Docs/DDL_DATAMODEL.sql` is the human-readable reference; the Alembic migrations
are the source of truth applied to real databases. The two are maintained as
separate hand-written copies, so they can silently drift apart.

This test builds two throwaway databases — one from the raw DDL, one from
`alembic upgrade head` — and asserts their resulting schemas and seed data are
equivalent. It fails on ANY divergence (added/removed/retyped column, changed
constraint, missing index, altered seed value).

The reference DDL is located via the ``DDL_SQL_PATH`` env var, or by walking up
from this file to ``Docs/DDL_DATAMODEL.sql``. When neither is available (e.g.
the dev API container only mounts ``backend/``), the test skips — it runs in CI
where the full repository is checked out.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy import Engine, create_engine, text

# ── Reference DDL location ──────────────────────────────────────────────────────


def _find_ddl_path() -> Path | None:
    env_path = os.environ.get("DDL_SQL_PATH")
    if env_path and Path(env_path).is_file():
        return Path(env_path)
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "Docs" / "DDL_DATAMODEL.sql"
        if candidate.is_file():
            return candidate
    return None


_DDL_PATH = _find_ddl_path()

pytestmark = pytest.mark.skipif(
    _DDL_PATH is None,
    reason="Docs/DDL_DATAMODEL.sql not reachable (set DDL_SQL_PATH or check out the full repo)",
)

# ── Database URLs ───────────────────────────────────────────────────────────────

_PROD_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam"
)
_BASE_URL = _PROD_URL.rsplit("/", 1)[0]
_DDL_DB = "arogyam_parity_ddl"
_MIG_DB = "arogyam_parity_mig"


def _admin_engine() -> Engine:
    return create_engine(_PROD_URL, isolation_level="AUTOCOMMIT")


def _drop_db(name: str) -> None:
    with _admin_engine().connect() as conn:
        conn.execute(
            text(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = :n AND pid <> pg_backend_pid()"
            ),
            {"n": name},
        )
        conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))


def _create_db(name: str) -> None:
    _drop_db(name)
    with _admin_engine().connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))


def _load_raw_ddl(url: str) -> None:
    """Execute the whole DDL script (psycopg3 supports multi-statement execute)."""
    import psycopg

    raw_url = url.replace("+psycopg", "")
    assert _DDL_PATH is not None  # guarded by pytestmark
    script = _DDL_PATH.read_text()
    with psycopg.connect(raw_url, autocommit=True) as conn:
        conn.execute(script)  # type: ignore[arg-type]


def _run_migrations(url: str) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")


# ── Schema introspection helpers ────────────────────────────────────────────────

_EXCLUDE = "alembic_version"


def _tables(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name <> :ex"
            ),
            {"ex": _EXCLUDE},
        )
        return {r[0] for r in rows}


def _columns(engine: Engine) -> set[tuple]:
    """(table, column, data_type, udt_name, is_nullable) — catches type/null drift."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name, data_type, udt_name, is_nullable "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name <> :ex"
            ),
            {"ex": _EXCLUDE},
        )
        return {tuple(r) for r in rows}


def _foreign_keys(engine: Engine) -> set[tuple]:
    """(table, column, foreign_table, foreign_column)."""
    sql = """
        SELECT tc.table_name, kcu.column_name,
               ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    """
    with engine.connect() as conn:
        return {tuple(r) for r in conn.execute(text(sql))}


def _unique_constraints(engine: Engine) -> set[tuple]:
    """(table, sorted(columns))."""
    sql = """
        SELECT tc.table_name, tc.constraint_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'UNIQUE' AND tc.table_schema = 'public'
    """
    grouped: dict[tuple, list] = {}
    with engine.connect() as conn:
        for table, cname, col in conn.execute(text(sql)):
            grouped.setdefault((table, cname), []).append(col)
    return {(table, tuple(sorted(cols))) for (table, _c), cols in grouped.items()}


def _check_constraints(engine: Engine) -> set[tuple]:
    """(table, check_clause) — excludes auto-generated NOT NULL checks."""
    sql = """
        SELECT tc.table_name, cc.check_clause
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
            ON tc.constraint_name = cc.constraint_name AND tc.table_schema = cc.constraint_schema
        WHERE tc.constraint_type = 'CHECK' AND tc.table_schema = 'public'
          AND tc.constraint_name NOT LIKE '%\\_not\\_null'
    """
    with engine.connect() as conn:
        return {(r[0], r[1]) for r in conn.execute(text(sql))}


def _indexes(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename <> :ex"
            ),
            {"ex": _EXCLUDE},
        )
        return {r[0] for r in rows}


def _seed_signature(engine: Engine) -> dict[str, tuple]:
    queries = {
        "roles": "SELECT count(*), md5(string_agg(code, ',' ORDER BY code)) FROM roles",
        "master_data": (
            "SELECT count(*), md5(string_agg(type||':'||code||':'||label, ',' "
            "ORDER BY type, code)) FROM master_data"
        ),
        "op_sequence": (
            "SELECT count(*), md5(string_agg("
            "category_code||':'||prefix||':'||padding_width||':'||reset_policy, ',' "
            "ORDER BY category_code)) FROM op_sequence"
        ),
    }
    out: dict[str, tuple] = {}
    with engine.connect() as conn:
        for name, q in queries.items():
            out[name] = tuple(conn.execute(text(q)).one())
    return out


# ── Fixture: build both reference databases once per class ───────────────────────


class TestDDLMigrationParity:
    """Asserts the migrations reproduce the DDL schema and seed data exactly."""

    @pytest.fixture(scope="class")
    def ref_engines(self) -> tuple[Engine, Engine]:
        _create_db(_DDL_DB)
        _create_db(_MIG_DB)
        ddl_url = f"{_BASE_URL}/{_DDL_DB}"
        mig_url = f"{_BASE_URL}/{_MIG_DB}"

        _load_raw_ddl(ddl_url)
        _run_migrations(mig_url)

        ddl_engine = create_engine(ddl_url, pool_pre_ping=True)
        mig_engine = create_engine(mig_url, pool_pre_ping=True)
        yield ddl_engine, mig_engine

        ddl_engine.dispose()
        mig_engine.dispose()
        _drop_db(_DDL_DB)
        _drop_db(_MIG_DB)

    def test_tables_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _tables(ddl), _tables(mig)
        assert d == m, f"Table drift — only in DDL: {d - m}; only in migration: {m - d}"

    def test_columns_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _columns(ddl), _columns(mig)
        assert d == m, (
            f"Column drift — only in DDL: {sorted(d - m)}; only in migration: {sorted(m - d)}"
        )

    def test_foreign_keys_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _foreign_keys(ddl), _foreign_keys(mig)
        assert d == m, (
            f"FK drift — only in DDL: {sorted(d - m)}; only in migration: {sorted(m - d)}"
        )

    def test_unique_constraints_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _unique_constraints(ddl), _unique_constraints(mig)
        assert d == m, (
            f"UNIQUE drift — only in DDL: {sorted(d - m)}; only in migration: {sorted(m - d)}"
        )

    def test_check_constraints_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _check_constraints(ddl), _check_constraints(mig)
        assert d == m, (
            f"CHECK drift — only in DDL: {sorted(d - m)}; only in migration: {sorted(m - d)}"
        )

    def test_indexes_match(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _indexes(ddl), _indexes(mig)
        assert d == m, (
            f"Index drift — only in DDL: {sorted(d - m)}; only in migration: {sorted(m - d)}"
        )

    def test_seed_data_matches(self, ref_engines: tuple[Engine, Engine]) -> None:
        ddl, mig = ref_engines
        d, m = _seed_signature(ddl), _seed_signature(mig)
        assert d == m, f"Seed-data drift — DDL: {d}; migration: {m}"

    def test_set_updated_at_function_semantically_equal(
        self, ref_engines: tuple[Engine, Engine]
    ) -> None:
        """The trigger function must be semantically identical.

        `pg_get_functiondef` preserves the body text verbatim, so the DDL's
        flush-left body and the migration's indented heredoc differ only by
        whitespace. Like every other check here, this comparison is semantic:
        whitespace is normalized so a genuine logic change still fails, but
        cosmetic indentation does not.
        """
        ddl, mig = ref_engines

        def _normalized_fn(engine: Engine) -> str:
            with engine.connect() as conn:
                body = conn.execute(
                    text("SELECT pg_get_functiondef('set_updated_at()'::regprocedure)")
                ).scalar_one()
            return " ".join(body.split())  # collapse all whitespace runs

        d = _normalized_fn(ddl)
        m = _normalized_fn(mig)
        assert d == m, (
            "set_updated_at() differs semantically between DDL and migration:\n"
            f"  DDL:       {d}\n  migration: {m}"
        )
