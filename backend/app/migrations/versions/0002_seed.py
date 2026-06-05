"""Seed reference/lookup data from Docs/DDL_DATAMODEL.sql §9 (DB-T0.2).

Idempotent: ON CONFLICT DO NOTHING. Codes match API spec §8.5 enum defaults.

Revision ID: 0002
Revises: 0001
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ── roles ─────────────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO roles (code, name, description) VALUES
            ('ADMIN',      'Administrator',    'Full system configuration, users, master data, audit, backup, reporting.'),
            ('DOCTOR',     'Doctor',           'Clinical: history, consultation notes, prescriptions, discharge summaries.'),
            ('RECEPTION',  'Receptionist',     'Front office: registration, search, visits, demographic updates, uploads.'),
            ('DATA_ENTRY', 'Data Entry Staff', 'Historical record digitization, scanned uploads, linking.')
        ON CONFLICT (code) DO NOTHING
    """)

    # ── consultation categories ────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('consultation_category', 'REGULAR', 'Regular Consultation',   1),
            ('consultation_category', 'VILLAGE', 'Village Consultation',   2),
            ('consultation_category', 'CAMP',    'Free Camp Consultation', 3)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── OP sequences ──────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO op_sequence (category_code, prefix, last_sequence, padding_width) VALUES
            ('REGULAR', 'OPN', 0, 4),
            ('VILLAGE', 'OPV', 0, 4),
            ('CAMP',    'FC',  0, 4)
        ON CONFLICT (category_code) DO NOTHING
    """)

    # ── visit types ───────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('visit_type', 'NEW',      'New Consultation',            1),
            ('visit_type', 'REVIEW',   'Review / Follow-up',          2),
            ('visit_type', 'ONLINE',   'Online Consultation',         3),
            ('visit_type', 'INPERSON', 'In-person Consultation',      4),
            ('visit_type', 'CAMP',     'Camp / Village Consultation', 5)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── document types ────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('document_type', 'LAB_REPORT',       'Lab Report',          1),
            ('document_type', 'PHOTOGRAPH',       'Photograph',          2),
            ('document_type', 'INVESTIGATION',    'Investigation Report', 3),
            ('document_type', 'CASE_SHEET',       'Case Sheet',          4),
            ('document_type', 'PRESCRIPTION',     'Prescription',        5),
            ('document_type', 'DISCHARGE_SUMMARY','Discharge Summary',   6),
            ('document_type', 'OTHER',            'Other',               7)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── follow-up statuses ────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('follow_up_status', 'PENDING',       'Pending',       1),
            ('follow_up_status', 'CONTACTED',     'Contacted',     2),
            ('follow_up_status', 'COMPLETED',     'Completed',     3),
            ('follow_up_status', 'RESCHEDULED',   'Rescheduled',   4),
            ('follow_up_status', 'NOT_REACHABLE', 'Not Reachable', 5)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── blood groups ──────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('blood_group', 'A_POS',  'A+',  1),
            ('blood_group', 'A_NEG',  'A-',  2),
            ('blood_group', 'B_POS',  'B+',  3),
            ('blood_group', 'B_NEG',  'B-',  4),
            ('blood_group', 'AB_POS', 'AB+', 5),
            ('blood_group', 'AB_NEG', 'AB-', 6),
            ('blood_group', 'O_POS',  'O+',  7),
            ('blood_group', 'O_NEG',  'O-',  8)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── dietary preferences ───────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('dietary_preference', 'VEG',       'Vegetarian',     1),
            ('dietary_preference', 'NONVEG',    'Non-Vegetarian', 2),
            ('dietary_preference', 'VEGAN',     'Vegan',          3),
            ('dietary_preference', 'EGGETARIAN','Eggetarian',     4)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── marital status ────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('marital_status', 'SINGLE',   'Single',   1),
            ('marital_status', 'MARRIED',  'Married',  2),
            ('marital_status', 'DIVORCED', 'Divorced', 3),
            ('marital_status', 'WIDOWED',  'Widowed',  4)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── gender ────────────────────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('gender', 'MALE',   'Male',   1),
            ('gender', 'FEMALE', 'Female', 2),
            ('gender', 'OTHER',  'Other',  3)
        ON CONFLICT (type, code) DO NOTHING
    """)

    # ── condition at discharge ────────────────────────────────────────────────
    op.execute("""
        INSERT INTO master_data (type, code, label, sort_order) VALUES
            ('condition_at_discharge', 'IMPROVED',  'Improved',            1),
            ('condition_at_discharge', 'STABLE',    'Stable',              2),
            ('condition_at_discharge', 'UNCHANGED', 'Unchanged',           3),
            ('condition_at_discharge', 'REFERRED',  'Referred',            4),
            ('condition_at_discharge', 'LAMA',      'Left Against Advice', 5)
        ON CONFLICT (type, code) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DELETE FROM op_sequence WHERE category_code IN ('REGULAR', 'VILLAGE', 'CAMP')")
    op.execute("DELETE FROM master_data")
    op.execute("DELETE FROM roles WHERE code IN ('ADMIN', 'DOCTOR', 'RECEPTION', 'DATA_ENTRY')")
