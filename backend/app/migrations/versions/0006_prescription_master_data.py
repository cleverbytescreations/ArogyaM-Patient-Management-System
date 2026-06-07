"""Add prescription master data: medicine_route, dosage_unit, medicine_frequency, duration_unit.

Drops the hardcoded INTERNAL/EXTERNAL check constraint on prescription_items.application_route,
adds dosage_unit and duration_unit columns, and seeds all prescription lookup data.

Revision ID: 0006
Revises: 0005
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── Expand the master_data type allowlist ──────────────────────────────────
    # The baseline DDL baked allowed types into a CHECK constraint.
    # Drop it and recreate with the four new prescription lookup types.
    op.drop_constraint("ck_master_data_type", "master_data", type_="check")
    op.create_check_constraint(
        "ck_master_data_type",
        "master_data",
        "type IN ("
        "'consultation_category','document_type','visit_type',"
        "'follow_up_status','blood_group','dietary_preference',"
        "'marital_status','gender','condition_at_discharge',"
        "'medicine_route','dosage_unit','medicine_frequency','duration_unit'"
        ")",
    )

    # ── Drop hardcoded route check constraint ──────────────────────────────────
    # Original constraint limited application_route to INTERNAL|EXTERNAL.
    # Now route is driven by the medicine_route master data table.
    op.drop_constraint("ck_prescription_items_route", "prescription_items", type_="check")

    # ── Add dosage_unit and duration_unit columns ──────────────────────────────
    op.add_column(
        "prescription_items",
        sa.Column("dosage_unit", sa.String(20), nullable=True),
    )
    op.add_column(
        "prescription_items",
        sa.Column("duration_unit", sa.String(20), nullable=True),
    )

    # ── Seed prescription lookup master data ───────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('medicine_route', 'ORAL',        'Oral (PO)',            1),
            ('medicine_route', 'TOPICAL',     'Topical',              2),
            ('medicine_route', 'OPHTHALMIC',  'Ophthalmic (Eye)',     3),
            ('medicine_route', 'OTIC',        'Otic (Ear)',           4),
            ('medicine_route', 'INHALATION',  'Inhalation',          5),
            ('medicine_route', 'SUBLINGUAL',  'Sublingual (SL)',      6),
            ('medicine_route', 'IM',          'Intramuscular (IM)',   7),
            ('medicine_route', 'IV',          'Intravenous (IV)',     8),
            ('medicine_route', 'SC',          'Subcutaneous (SC)',    9),
            ('medicine_route', 'NASAL',       'Nasal',               10),
            ('medicine_route', 'TRANSDERMAL', 'Transdermal (Patch)', 11),
            ('medicine_route', 'RECTAL',      'Rectal',              12),

            ('dosage_unit', 'MG',       'mg',       1),
            ('dosage_unit', 'ML',       'ml',       2),
            ('dosage_unit', 'G',        'g',        3),
            ('dosage_unit', 'MCG',      'mcg',      4),
            ('dosage_unit', 'IU',       'IU',       5),
            ('dosage_unit', 'TABLETS',  'Tablets',  6),
            ('dosage_unit', 'CAPSULES', 'Capsules', 7),
            ('dosage_unit', 'DROPS',    'Drops',    8),
            ('dosage_unit', 'PUFFS',    'Puffs',    9),
            ('dosage_unit', 'UNITS',    'Units',    10),
            ('dosage_unit', 'SACHET',   'Sachet',   11),

            ('medicine_frequency', 'OD',          'Once daily (OD)',        1),
            ('medicine_frequency', 'BD',          'Twice daily (BD)',        2),
            ('medicine_frequency', 'TID',         'Three times daily (TID)', 3),
            ('medicine_frequency', 'QID',         'Four times daily (QID)', 4),
            ('medicine_frequency', 'Q8H',         'Every 8 hours',          5),
            ('medicine_frequency', 'Q12H',        'Every 12 hours',         6),
            ('medicine_frequency', 'HS',          'At bedtime (HS)',         7),
            ('medicine_frequency', 'AC',          'Before meals (AC)',       8),
            ('medicine_frequency', 'PC',          'After meals (PC)',        9),
            ('medicine_frequency', 'PRN',         'As needed (PRN)',         10),
            ('medicine_frequency', 'WEEKLY',      'Weekly',                  11),
            ('medicine_frequency', 'FORTNIGHTLY', 'Fortnightly',             12),

            ('duration_unit', 'DAYS',    'Days',    1),
            ('duration_unit', 'WEEKS',   'Weeks',   2),
            ('duration_unit', 'MONTHS',  'Months',  3),
            ('duration_unit', 'ONGOING', 'Ongoing', 4)
        ON CONFLICT (type, code) DO NOTHING
    """)


def downgrade() -> None:
    op.execute(
        "DELETE FROM master_data WHERE type IN "
        "('medicine_route', 'dosage_unit', 'medicine_frequency', 'duration_unit')"
    )
    op.drop_column("prescription_items", "duration_unit")
    op.drop_column("prescription_items", "dosage_unit")
    op.create_check_constraint(
        "ck_prescription_items_route",
        "prescription_items",
        "application_route IS NULL OR application_route IN ('INTERNAL', 'EXTERNAL')",
    )
    op.drop_constraint("ck_master_data_type", "master_data", type_="check")
    op.create_check_constraint(
        "ck_master_data_type",
        "master_data",
        "type IN ("
        "'consultation_category','document_type','visit_type',"
        "'follow_up_status','blood_group','dietary_preference',"
        "'marital_status','gender','condition_at_discharge'"
        ")",
    )
