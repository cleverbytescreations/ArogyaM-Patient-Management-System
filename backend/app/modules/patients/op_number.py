"""Transaction-safe OP number generator (BE-T4.1, UC-04, UC-29).

MUST be called inside the caller's open DB transaction — it does NOT commit.
Uses SELECT … FOR UPDATE on the op_sequence row to guarantee uniqueness
under concurrent registrations.

YEARLY reset: when reset_policy='YEARLY' and the current calendar year
differs from last_reset_year, the counter resets to 1 and last_reset_year
is updated within the same locked update.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError


def generate_op_number(db: Session, category_code: str) -> str:
    """Return a unique, formatted OP number for the given category.

    Locks the op_sequence row for the duration of the caller's transaction.
    Raises NotFoundError if no active sequence exists for the category.
    """
    row = db.execute(
        text(
            """
            SELECT id, prefix, last_sequence, padding_width, reset_policy, last_reset_year
            FROM op_sequence
            WHERE category_code = :c AND is_active = TRUE
            FOR UPDATE
            """
        ),
        {"c": category_code},
    ).first()

    if row is None:
        raise NotFoundError(f"No active OP sequence found for category '{category_code}'")

    seq_id, prefix, last_seq, padding_width, reset_policy, last_reset_year = row
    current_year = date.today().year

    if reset_policy == "YEARLY" and last_reset_year is not None and last_reset_year < current_year:
        next_seq = 1
    elif reset_policy == "YEARLY" and last_reset_year is None:
        # First time tracking year — don't reset, just start tracking
        next_seq = last_seq + 1
    else:
        next_seq = last_seq + 1

    db.execute(
        text(
            """
            UPDATE op_sequence
            SET last_sequence = :next_seq,
                last_reset_year = :yr
            WHERE id = :id
            """
        ),
        {"next_seq": next_seq, "yr": current_year, "id": seq_id},
    )

    return f"{prefix}{str(next_seq).zfill(padding_width)}"
