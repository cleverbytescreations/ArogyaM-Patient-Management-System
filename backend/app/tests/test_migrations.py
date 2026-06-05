"""Migration validation tests (DB-T0.1, DB-T0.2, TST-T0.3).

Validates that:
- All expected tables exist after `alembic upgrade head`.
- Required indexes are present (search, follow-up dashboard, audit).
- Every seed lookup category has the expected codes.
- OP sequences are seeded for all three consultation categories.
- `downgrade base` then `upgrade head` round-trips cleanly.

Runs against the same ephemeral test database as the integration test suite.
The `db_engine` fixture (session-scoped) already ran `upgrade head` before
any test in this session is executed, so table/index checks can proceed directly.
"""

from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

# ── helpers ───────────────────────────────────────────────────────────────────

_PROD_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://arogyam:arogyam_dev_pw@db:5432/arogyam"
)
_BASE_URL = _PROD_URL.rsplit("/", 1)[0]
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", f"{_BASE_URL}/arogyam_test")


def _run_alembic(command: str, url: str) -> None:
    """Run an alembic command programmatically against the given URL."""
    from alembic import command as alembic_cmd
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    if command == "upgrade":
        alembic_cmd.upgrade(cfg, "head")
    elif command == "downgrade":
        alembic_cmd.downgrade(cfg, "base")


# ── Expected schema elements ──────────────────────────────────────────────────

EXPECTED_TABLES = [
    "roles",
    "master_data",
    "op_sequence",
    "users",
    "user_roles",
    "patients",
    "patient_aliases",
    "merge_requests",
    "visits",
    "case_sheets",
    "consultation_notes",
    "prescriptions",
    "prescription_items",
    "discharge_summaries",
    "documents",
    "follow_ups",
    "audit_log",
    "backup_log",
]

EXPECTED_INDEXES = [
    "idx_patients_mobile",
    "idx_patients_name_trgm",
    "idx_patients_search_vector",
    "idx_follow_ups_status_date",
    "idx_audit_log_user",
    "idx_audit_log_patient",
    "idx_audit_log_entity",
    "idx_audit_log_created",
    "idx_master_data_type",
    "idx_visits_patient",
    "idx_documents_patient",
]

SEED_LOOKUP_COUNTS = {
    "consultation_category": 3,  # REGULAR, VILLAGE, CAMP
    "visit_type": 5,
    "document_type": 7,
    "follow_up_status": 5,
    "blood_group": 8,
    "dietary_preference": 4,
    "marital_status": 4,
    "gender": 3,
    "condition_at_discharge": 5,
}

OP_SEQUENCE_PREFIXES = {"OPN", "OPV", "FC"}


# ── Table existence tests ─────────────────────────────────────────────────────


class TestBaselineMigration:
    """DB-T0.1 — all tables created by the baseline migration exist."""

    @pytest.mark.parametrize("table_name", EXPECTED_TABLES)
    def test_table_exists(self, db_engine: Engine, table_name: str) -> None:
        inspector = inspect(db_engine)
        tables = inspector.get_table_names()
        assert table_name in tables, f"Expected table '{table_name}' not found in DB"

    @pytest.mark.parametrize("index_name", EXPECTED_INDEXES)
    def test_index_exists(self, db_engine: Engine, index_name: str) -> None:
        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT 1 FROM pg_indexes WHERE indexname = :name"),
                {"name": index_name},
            ).first()
        assert row is not None, f"Expected index '{index_name}' not found in DB"

    def test_set_updated_at_function_exists(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'")
            ).first()
        assert row is not None, "set_updated_at() trigger function not found"

    def test_pg_trgm_extension_enabled(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            row = conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'")).first()
        assert row is not None, "pg_trgm extension not installed"

    def test_citext_extension_enabled(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            row = conn.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'citext'")).first()
        assert row is not None, "citext extension not installed"

    def test_uuid_ossp_extension_enabled(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            row = conn.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'")
            ).first()
        assert row is not None, "uuid-ossp extension not installed"

    def test_alembic_version_table_exists(self, db_engine: Engine) -> None:
        inspector = inspect(db_engine)
        assert "alembic_version" in inspector.get_table_names()

    def test_migration_head_applied(self, db_engine: Engine) -> None:
        """Both revisions (0001 and 0002) must be recorded in alembic_version."""
        with db_engine.connect() as conn:
            rows = conn.execute(text("SELECT version_num FROM alembic_version")).fetchall()
        version_nums = {r[0] for r in rows}
        # After upgrade head the table contains the latest revision only.
        assert len(version_nums) == 1, (
            f"Expected exactly one alembic_version row, got {version_nums}"
        )
        assert "0002" in version_nums, f"Expected head revision '0002', got {version_nums}"


# ── Seed data tests ───────────────────────────────────────────────────────────


class TestSeedMigration:
    """DB-T0.2 — lookup data seeded by the second migration is correct."""

    @pytest.mark.parametrize("lookup_type,expected_count", SEED_LOOKUP_COUNTS.items())
    def test_master_data_lookup_count(
        self, db_engine: Engine, lookup_type: str, expected_count: int
    ) -> None:
        with db_engine.connect() as conn:
            count = conn.execute(
                text("SELECT COUNT(*) FROM master_data WHERE type = :t AND is_active = TRUE"),
                {"t": lookup_type},
            ).scalar()
        assert count == expected_count, (
            f"master_data[{lookup_type}]: expected {expected_count} active rows, got {count}"
        )

    def test_roles_seeded(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            codes = {
                row[0]
                for row in conn.execute(
                    text("SELECT code FROM roles WHERE is_active = TRUE")
                ).fetchall()
            }
        assert {"ADMIN", "DOCTOR", "RECEPTION", "DATA_ENTRY"} == codes

    def test_op_sequences_seeded(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            prefixes = {
                row[0]
                for row in conn.execute(
                    text("SELECT prefix FROM op_sequence WHERE is_active = TRUE")
                ).fetchall()
            }
        assert OP_SEQUENCE_PREFIXES == prefixes

    def test_op_sequences_start_at_zero(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            non_zero = conn.execute(
                text("SELECT COUNT(*) FROM op_sequence WHERE last_sequence != 0")
            ).scalar()
        assert non_zero == 0, "Seeded op_sequence rows should start at last_sequence=0"

    def test_consultation_category_codes(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            codes = {
                row[0]
                for row in conn.execute(
                    text("SELECT code FROM master_data WHERE type = 'consultation_category'")
                ).fetchall()
            }
        assert {"REGULAR", "VILLAGE", "CAMP"} == codes

    def test_gender_codes(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            codes = {
                row[0]
                for row in conn.execute(
                    text("SELECT code FROM master_data WHERE type = 'gender'")
                ).fetchall()
            }
        assert {"MALE", "FEMALE", "OTHER"} == codes

    def test_follow_up_status_codes(self, db_engine: Engine) -> None:
        with db_engine.connect() as conn:
            codes = {
                row[0]
                for row in conn.execute(
                    text("SELECT code FROM master_data WHERE type = 'follow_up_status'")
                ).fetchall()
            }
        assert {"PENDING", "CONTACTED", "COMPLETED", "RESCHEDULED", "NOT_REACHABLE"} == codes


# ── Round-trip migration test ─────────────────────────────────────────────────


class TestMigrationRoundTrip:
    """TST-T0.3 skeleton — upgrade head → downgrade base → upgrade head must succeed.

    This test uses a dedicated round-trip database to avoid touching the test
    database used by integration tests.
    """

    _ROUNDTRIP_DB = "arogyam_migration_rt"

    @pytest.fixture(scope="class")
    def rt_engine(self) -> Engine:
        """Create (and later drop) a dedicated round-trip test database."""
        admin_engine = create_engine(_PROD_URL, isolation_level="AUTOCOMMIT")
        rt_url = f"{_BASE_URL}/{self._ROUNDTRIP_DB}"
        with admin_engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{self._ROUNDTRIP_DB}"'))
            conn.execute(text(f'CREATE DATABASE "{self._ROUNDTRIP_DB}"'))
        admin_engine.dispose()

        engine = create_engine(rt_url, pool_pre_ping=True)
        yield engine
        engine.dispose()

        cleanup = create_engine(_PROD_URL, isolation_level="AUTOCOMMIT")
        with cleanup.connect() as conn:
            # Force-disconnect any lingering connections before dropping
            conn.execute(
                text(
                    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                    "WHERE datname = :dbname AND pid <> pg_backend_pid()"
                ),
                {"dbname": self._ROUNDTRIP_DB},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{self._ROUNDTRIP_DB}"'))
        cleanup.dispose()

    @staticmethod
    def _rt_url(engine: Engine) -> str:
        """Return the full connection URL with the password unmasked."""
        return engine.url.render_as_string(hide_password=False)

    def test_upgrade_head(self, rt_engine: Engine) -> None:
        """upgrade head on a fresh DB must apply without error."""
        _run_alembic("upgrade", self._rt_url(rt_engine))

        inspector = inspect(rt_engine)
        assert "users" in inspector.get_table_names(), (
            "Table 'users' missing after upgrade head on fresh DB"
        )

    def test_downgrade_base(self, rt_engine: Engine) -> None:
        """downgrade base must remove all application tables."""
        _run_alembic("downgrade", self._rt_url(rt_engine))

        inspector = inspect(rt_engine)
        app_tables = [t for t in inspector.get_table_names() if t != "alembic_version"]
        assert app_tables == [], f"Tables remain after downgrade base: {app_tables}"

    def test_upgrade_again_after_downgrade(self, rt_engine: Engine) -> None:
        """upgrade head after downgrade base must succeed (idempotent re-apply)."""
        _run_alembic("upgrade", self._rt_url(rt_engine))

        inspector = inspect(rt_engine)
        assert "users" in inspector.get_table_names(), (
            "Table 'users' missing after second upgrade head"
        )
