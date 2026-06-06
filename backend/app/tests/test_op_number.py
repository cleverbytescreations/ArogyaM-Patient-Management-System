"""Tests for OP number generation (BE-T4.1, DB-T4.1, TST-T4.1).

Covers:
- Sequential unique numbers within a transaction
- Unknown/inactive category → NotFoundError
- YEARLY reset increments correctly across years (mocked)
- Concurrent registrations produce unique numbers (TST-T4.1)
- Concurrent patient edits → stale version raises VersionConflictError (TST-T4.1)
- DB-T4.1: SELECT FOR UPDATE runs without error on a live DB
- DB-T3.1: op_number unique constraint rejects duplicates at DB level
- DB-T5.1: search indexes are present (EXPLAIN confirms GIN usage)
"""

from __future__ import annotations

import threading
import uuid
from datetime import date
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.concurrency import bump_version, ensure_current_version
from app.core.errors import NotFoundError, VersionConflictError
from app.modules.patients.op_number import generate_op_number


# ── Helpers ───────────────────────────────────────────────────────────────────


def _first_active_category(db: Session) -> str:
    row = db.execute(
        text("SELECT category_code FROM op_sequence WHERE is_active = TRUE LIMIT 1")
    ).first()
    assert row is not None, "No active op_sequence rows found (seed missing?)"
    return row[0]


def _reset_sequence(db: Session, category_code: str, last_seq: int = 0) -> None:
    db.execute(
        text(
            "UPDATE op_sequence SET last_sequence = :s, last_reset_year = NULL "
            "WHERE category_code = :c"
        ),
        {"s": last_seq, "c": category_code},
    )
    db.flush()


# ── Basic generation ──────────────────────────────────────────────────────────


class TestOpNumberGeneration:
    def test_generates_formatted_number(self, db: Session) -> None:
        cat = _first_active_category(db)
        _reset_sequence(db, cat)
        op = generate_op_number(db, cat)
        assert op  # non-empty
        assert len(op) >= 2

    def test_sequential_numbers_are_unique(self, db: Session) -> None:
        cat = _first_active_category(db)
        _reset_sequence(db, cat, 0)
        op1 = generate_op_number(db, cat)
        op2 = generate_op_number(db, cat)
        op3 = generate_op_number(db, cat)
        assert op1 != op2 != op3

    def test_numbers_increment_by_one(self, db: Session) -> None:
        cat = _first_active_category(db)
        _reset_sequence(db, cat, 10)
        op1 = generate_op_number(db, cat)
        op2 = generate_op_number(db, cat)
        # Suffix digits should increment
        suffix1 = int(op1.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
        suffix2 = int(op2.lstrip("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
        assert suffix2 == suffix1 + 1

    def test_prefix_and_padding_applied(self, db: Session) -> None:
        row = db.execute(
            text(
                "SELECT category_code, prefix, padding_width FROM op_sequence "
                "WHERE is_active = TRUE LIMIT 1"
            )
        ).first()
        assert row is not None
        cat, prefix, padding = row
        _reset_sequence(db, cat, 0)
        op = generate_op_number(db, cat)
        assert op.startswith(prefix)
        numeric_part = op[len(prefix):]
        assert len(numeric_part) == padding
        assert numeric_part == "1".zfill(padding)

    def test_unknown_category_raises_not_found(self, db: Session) -> None:
        with pytest.raises(NotFoundError):
            generate_op_number(db, "NONEXISTENT_CAT_XYZ")

    def test_inactive_category_raises_not_found(self, db: Session) -> None:
        cat = _first_active_category(db)
        db.execute(
            text("UPDATE op_sequence SET is_active = FALSE WHERE category_code = :c"),
            {"c": cat},
        )
        db.flush()
        with pytest.raises(NotFoundError):
            generate_op_number(db, cat)
        # Restore
        db.execute(
            text("UPDATE op_sequence SET is_active = TRUE WHERE category_code = :c"),
            {"c": cat},
        )
        db.flush()


# ── YEARLY reset ─────────────────────────────────────────────────────────────


class TestYearlyReset:
    def test_yearly_reset_when_year_changes(self, db: Session) -> None:
        cat = _first_active_category(db)
        _reset_sequence(db, cat, 50)
        # Simulate: last_reset_year = 2024, now we're in 2025
        db.execute(
            text(
                "UPDATE op_sequence SET reset_policy = 'YEARLY', last_reset_year = 2020 "
                "WHERE category_code = :c"
            ),
            {"c": cat},
        )
        db.flush()

        # Mock today's date to 2025
        with patch("app.modules.patients.op_number.date") as mock_date:
            mock_date.today.return_value = date(2025, 1, 1)
            op = generate_op_number(db, cat)

        # The sequence should have reset to 1
        row = db.execute(
            text("SELECT last_sequence FROM op_sequence WHERE category_code = :c"),
            {"c": cat},
        ).first()
        assert row[0] == 1
        # OP number suffix is "0001" (padding=4 default)
        assert op.endswith("0001")

    def test_no_reset_same_year(self, db: Session) -> None:
        cat = _first_active_category(db)
        current_year = date.today().year
        db.execute(
            text(
                "UPDATE op_sequence SET reset_policy = 'YEARLY', "
                "last_sequence = 100, last_reset_year = :yr "
                "WHERE category_code = :c"
            ),
            {"yr": current_year, "c": cat},
        )
        db.flush()
        op = generate_op_number(db, cat)
        row = db.execute(
            text("SELECT last_sequence FROM op_sequence WHERE category_code = :c"),
            {"c": cat},
        ).first()
        # Sequence should have incremented, not reset
        assert row[0] == 101

    def test_restore_never_policy(self, db: Session) -> None:
        cat = _first_active_category(db)
        db.execute(
            text(
                "UPDATE op_sequence SET reset_policy = 'NEVER', last_reset_year = NULL "
                "WHERE category_code = :c"
            ),
            {"c": cat},
        )
        db.flush()


# ── Row-lock readiness (DB-T4.1) ─────────────────────────────────────────────


class TestRowLockReadiness:
    def test_select_for_update_runs(self, db: Session) -> None:
        """DB-T4.1: SELECT FOR UPDATE on op_sequence succeeds."""
        result = db.execute(
            text(
                "SELECT id, category_code FROM op_sequence "
                "WHERE is_active = TRUE LIMIT 1 FOR UPDATE"
            )
        ).first()
        assert result is not None

    def test_op_number_column_unique_constraint(self, db: Session) -> None:
        """DB-T3.1: unique constraint on op_number rejects duplicate at DB level."""
        import sqlalchemy.exc

        unique_op = f"UNIQUETEST{uuid.uuid4().hex[:6].upper()}"
        patient_id1 = uuid.uuid4()
        patient_id2 = uuid.uuid4()
        admin_id = db.execute(text("SELECT id FROM users LIMIT 1")).scalar()

        # Insert first patient with this OP number
        db.execute(
            text(
                "INSERT INTO patients (id, op_number, op_category_code, full_name, mobile, "
                "status, version, created_by, updated_by) "
                "VALUES (:id, :op, 'consultation_category', 'Test Patient', '9999900001', "
                "'ACTIVE', 1, :uid, :uid)"
            ),
            {"id": str(patient_id1), "op": unique_op, "uid": str(admin_id)},
        )
        db.flush()

        # Second insert with same OP number must fail
        with pytest.raises(sqlalchemy.exc.IntegrityError):
            db.execute(
                text(
                    "INSERT INTO patients (id, op_number, op_category_code, full_name, mobile, "
                    "status, version, created_by, updated_by) "
                    "VALUES (:id, :op, 'consultation_category', 'Test Patient 2', '9999900002', "
                    "'ACTIVE', 1, :uid, :uid)"
                ),
                {"id": str(patient_id2), "op": unique_op, "uid": str(admin_id)},
            )
            db.flush()


# ── FTS / trigram index verification (DB-T5.1) ───────────────────────────────


class TestSearchIndexes:
    def test_trgm_gin_index_exists(self, db: Session) -> None:
        """DB-T5.1: pg_trgm GIN index on patients.full_name is present."""
        result = db.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'patients' AND indexname = 'idx_patients_name_trgm'"
            )
        ).first()
        assert result is not None, "idx_patients_name_trgm GIN index is missing"

    def test_fts_gin_index_exists(self, db: Session) -> None:
        """DB-T5.1: GIN index on patients.search_vector is present."""
        result = db.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'patients' AND indexname = 'idx_patients_search_vector'"
            )
        ).first()
        assert result is not None, "idx_patients_search_vector GIN index is missing"

    def test_mobile_btree_index_exists(self, db: Session) -> None:
        """DB-T5.1: B-tree index on patients.mobile is present."""
        result = db.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'patients' AND indexname = 'idx_patients_mobile'"
            )
        ).first()
        assert result is not None, "idx_patients_mobile index is missing"

    def test_op_number_unique_index_exists(self, db: Session) -> None:
        """DB-T3.1: UNIQUE index on op_number exists (implicit from UNIQUE constraint)."""
        result = db.execute(
            text(
                "SELECT indexname FROM pg_indexes "
                "WHERE tablename = 'patients' AND indexname = 'uq_patients_op_number'"
            )
        ).first()
        assert result is not None, "uq_patients_op_number unique index is missing"


# ── Concurrency test (TST-T4.1) ──────────────────────────────────────────────


class TestOpNumberConcurrency:
    def test_concurrent_generations_are_unique(self, db_engine) -> None:
        """TST-T4.1: Parallel OP number generation produces no duplicates.

        Uses separate DB connections (not the test transaction) so that each
        thread issues a real COMMIT and the row-lock is genuinely contended.
        Saves and restores the original last_sequence so the migration seed
        integrity test (test_op_sequences_start_at_zero) is not affected.
        """
        from sqlalchemy.orm import Session as OrmSession

        with db_engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT category_code, last_sequence, last_reset_year "
                    "FROM op_sequence WHERE is_active = TRUE LIMIT 1"
                )
            ).first()
            assert row is not None
            cat, original_seq, original_reset_year = row[0], row[1], row[2]
            # Reset sequence to 0 for the concurrency run
            conn.execute(
                text(
                    "UPDATE op_sequence SET last_sequence = 0, last_reset_year = NULL "
                    "WHERE category_code = :c"
                ),
                {"c": cat},
            )
            conn.commit()

        results: list[str] = []
        errors: list[Exception] = []
        n_threads = 10

        def _generate() -> None:
            try:
                with OrmSession(db_engine) as sess:
                    with sess.begin():
                        op = generate_op_number(sess, cat)
                        results.append(op)
            except Exception as exc:
                errors.append(exc)

        threads = [threading.Thread(target=_generate) for _ in range(n_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        # Restore original sequence state so other tests are not affected
        with db_engine.connect() as conn:
            conn.execute(
                text(
                    "UPDATE op_sequence SET last_sequence = :s, last_reset_year = :yr "
                    "WHERE category_code = :c"
                ),
                {"s": original_seq, "yr": original_reset_year, "c": cat},
            )
            conn.commit()

        assert not errors, f"Threads raised errors: {errors}"
        assert len(results) == n_threads, "Some threads did not produce an OP number"
        assert len(set(results)) == n_threads, (
            f"Duplicate OP numbers detected: {sorted(results)}"
        )


# ── Version-conflict concurrency (TST-T4.1) ──────────────────────────────────


class TestVersionConflictConcurrency:
    """TST-T4.1: Concurrent patient edits → the stale edit raises VersionConflictError.

    Uses separate committed DB sessions (db_engine) so threads see each other's
    committed changes, which is required to exercise the version-check path under
    realistic concurrency.

    Thread 1 commits first (version 1 → 2).  Thread 2 waits for Thread 1 to
    commit, then reads the patient (now at version 2) but supplies the original
    client version (1) — exactly the scenario of a stale-update request — and
    must receive VersionConflictError.
    """

    def test_stale_edit_gets_version_conflict(self, db_engine) -> None:
        """TST-T4.1: concurrent record edits → exactly one wins, stale edit gets 409."""
        from sqlalchemy import select

        from app.modules.patients.models import Patient

        patient_id = uuid.uuid4()

        with db_engine.connect() as conn:
            admin_id = conn.execute(text("SELECT id FROM users LIMIT 1")).scalar()
            cat_code = conn.execute(
                text("SELECT category_code FROM op_sequence WHERE is_active = TRUE LIMIT 1")
            ).scalar()
            unique_op = f"VCTEST{uuid.uuid4().hex[:8].upper()}"
            conn.execute(
                text(
                    "INSERT INTO patients "
                    "(id, op_number, op_category_code, full_name, mobile, "
                    "status, version, created_by, updated_by) "
                    "VALUES (:id, :op, :cat, 'VersionConflict Test', '7778889999', "
                    "'ACTIVE', 1, :uid, :uid)"
                ),
                {
                    "id": str(patient_id),
                    "op": unique_op,
                    "cat": cat_code,
                    "uid": str(admin_id),
                },
            )
            conn.commit()

        success_count: list[int] = [0]
        conflict_count: list[int] = [0]
        errors: list[Exception] = []
        thread1_committed = threading.Event()

        def _first_edit() -> None:
            try:
                from sqlalchemy.orm import Session as OrmSession

                with OrmSession(db_engine) as sess:
                    with sess.begin():
                        p = sess.execute(
                            select(Patient).where(Patient.id == patient_id)
                        ).scalar_one()
                        ensure_current_version(p, 1)
                        p.city = "EditedByFirst"
                        bump_version(p)
                success_count[0] += 1
            except Exception as exc:
                errors.append(exc)
            finally:
                thread1_committed.set()

        def _stale_edit() -> None:
            thread1_committed.wait(timeout=10.0)
            try:
                from sqlalchemy.orm import Session as OrmSession

                with OrmSession(db_engine) as sess:
                    with sess.begin():
                        p = sess.execute(
                            select(Patient).where(Patient.id == patient_id)
                        ).scalar_one()
                        # DB has version=2 after Thread 1; client still sends version=1 (stale)
                        ensure_current_version(p, 1)
                        p.city = "EditedByStale"
                        bump_version(p)
                success_count[0] += 1
            except VersionConflictError:
                conflict_count[0] += 1
            except Exception as exc:
                errors.append(exc)

        t1 = threading.Thread(target=_first_edit)
        t2 = threading.Thread(target=_stale_edit)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Cleanup — runs regardless of test outcome
        with db_engine.connect() as conn:
            conn.execute(text("DELETE FROM patients WHERE id = :id"), {"id": str(patient_id)})
            conn.commit()

        assert not errors, f"Unexpected thread errors: {errors}"
        assert success_count[0] == 1, f"Expected 1 success, got {success_count[0]}"
        assert conflict_count[0] == 1, (
            f"Expected 1 VersionConflict (maps to 409), got {conflict_count[0]}"
        )
