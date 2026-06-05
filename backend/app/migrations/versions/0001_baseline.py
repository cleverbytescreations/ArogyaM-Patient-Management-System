"""Baseline schema from Docs/DDL_DATAMODEL.sql (DB-T0.1).

Creates extensions, the set_updated_at() trigger function, all tables,
triggers, and indexes for the full Phase 1 data model. Seed data is in the
next revision (0002_seed.py).

Revision ID: 0001
Revises: (none — initial migration)
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "pg_trgm"')
    op.execute('CREATE EXTENSION IF NOT EXISTS "citext"')

    op.execute("""
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # ── roles ─────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          SMALLSERIAL  NOT NULL,
            code        VARCHAR(30)  NOT NULL,
            name        VARCHAR(60)  NOT NULL,
            description VARCHAR(255),
            is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT pk_roles PRIMARY KEY (id),
            CONSTRAINT uq_roles_code UNIQUE (code),
            CONSTRAINT uq_roles_name UNIQUE (name)
        )
    """)

    # ── master_data ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS master_data (
            id           SERIAL       NOT NULL,
            type         VARCHAR(40)  NOT NULL,
            code         VARCHAR(40)  NOT NULL,
            label        VARCHAR(120) NOT NULL,
            sort_order   SMALLINT     NOT NULL DEFAULT 0,
            is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            created_by   UUID,
            updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_by   UUID,
            CONSTRAINT pk_master_data PRIMARY KEY (id),
            CONSTRAINT uq_master_data_type_code UNIQUE (type, code),
            CONSTRAINT ck_master_data_type CHECK (type IN (
                'consultation_category','document_type','visit_type',
                'follow_up_status','blood_group','dietary_preference',
                'marital_status','gender','condition_at_discharge'
            ))
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_master_data_updated_at
            BEFORE UPDATE ON master_data
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── op_sequence ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS op_sequence (
            id              SMALLSERIAL  NOT NULL,
            category_code   VARCHAR(40)  NOT NULL,
            prefix          VARCHAR(10)  NOT NULL,
            last_sequence   BIGINT       NOT NULL DEFAULT 0,
            padding_width   SMALLINT     NOT NULL DEFAULT 4,
            number_format   VARCHAR(40)  NOT NULL DEFAULT '{prefix}{seq}',
            reset_policy    VARCHAR(10)  NOT NULL DEFAULT 'NEVER',
            is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT pk_op_sequence PRIMARY KEY (id),
            CONSTRAINT uq_op_sequence_category UNIQUE (category_code),
            CONSTRAINT uq_op_sequence_prefix   UNIQUE (prefix),
            CONSTRAINT ck_op_sequence_last_seq CHECK (last_sequence >= 0),
            CONSTRAINT ck_op_sequence_padding  CHECK (padding_width BETWEEN 1 AND 12),
            CONSTRAINT ck_op_sequence_reset    CHECK (reset_policy IN ('NEVER', 'YEARLY'))
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_op_sequence_updated_at
            BEFORE UPDATE ON op_sequence
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── users ─────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
            username              CITEXT       NOT NULL,
            email                 CITEXT,
            mobile                VARCHAR(20),
            full_name             VARCHAR(150) NOT NULL,
            password_hash         VARCHAR(255) NOT NULL,
            status                VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
            is_doctor             BOOLEAN      NOT NULL DEFAULT FALSE,
            failed_login_attempts SMALLINT     NOT NULL DEFAULT 0,
            locked_until          TIMESTAMPTZ,
            last_login_at         TIMESTAMPTZ,
            password_changed_at   TIMESTAMPTZ,
            version               INTEGER      NOT NULL DEFAULT 1,
            created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
            created_by            UUID,
            updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_by            UUID,
            CONSTRAINT pk_users PRIMARY KEY (id),
            CONSTRAINT uq_users_username UNIQUE (username),
            CONSTRAINT uq_users_email    UNIQUE (email),
            CONSTRAINT ck_users_status   CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED'))
        )
    """)
    # Self-referential FKs added after table creation to avoid circular dependency
    op.execute("""
        ALTER TABLE users
            ADD CONSTRAINT fk_users_created_by
                FOREIGN KEY (created_by) REFERENCES users (id),
            ADD CONSTRAINT fk_users_updated_by
                FOREIGN KEY (updated_by) REFERENCES users (id)
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── user_roles ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_roles (
            user_id     UUID        NOT NULL,
            role_id     SMALLINT    NOT NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            assigned_by UUID,
            CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
            CONSTRAINT fk_user_roles_user        FOREIGN KEY (user_id)     REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT fk_user_roles_role        FOREIGN KEY (role_id)     REFERENCES roles (id),
            CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id)
        )
    """)

    # ── patients ──────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id                  UUID         NOT NULL DEFAULT uuid_generate_v4(),
            op_number           VARCHAR(30)  NOT NULL,
            op_category_code    VARCHAR(40)  NOT NULL,
            full_name           VARCHAR(150) NOT NULL,
            date_of_birth       DATE,
            age_years           SMALLINT,
            gender              VARCHAR(20),
            mobile              VARCHAR(20),
            email               CITEXT,
            address_line        VARCHAR(255),
            city                VARCHAR(100),
            state               VARCHAR(100),
            pincode             VARCHAR(12),
            marital_status      VARCHAR(20),
            profession          VARCHAR(120),
            dietary_preference  VARCHAR(30),
            blood_group         VARCHAR(5),
            height_cm           NUMERIC(5,2),
            weight_kg           NUMERIC(5,2),
            status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
            merged_into         UUID,
            is_historical       BOOLEAN      NOT NULL DEFAULT FALSE,
            registration_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
            remarks             TEXT,
            search_vector       TSVECTOR GENERATED ALWAYS AS (
                to_tsvector('simple',
                    coalesce(full_name, '') || ' ' ||
                    coalesce(op_number, '') || ' ' ||
                    coalesce(mobile, ''))
            ) STORED,
            version             INTEGER      NOT NULL DEFAULT 1,
            created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
            created_by          UUID,
            updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_by          UUID,
            CONSTRAINT pk_patients         PRIMARY KEY (id),
            CONSTRAINT uq_patients_op_number UNIQUE (op_number),
            CONSTRAINT ck_patients_status  CHECK (status IN ('ACTIVE', 'INACTIVE', 'MERGED')),
            CONSTRAINT ck_patients_age     CHECK (age_years IS NULL OR age_years BETWEEN 0 AND 150),
            CONSTRAINT ck_patients_height  CHECK (height_cm IS NULL OR height_cm > 0),
            CONSTRAINT ck_patients_weight  CHECK (weight_kg IS NULL OR weight_kg > 0),
            CONSTRAINT ck_patients_min_identity CHECK (
                mobile IS NOT NULL OR email IS NOT NULL
                OR date_of_birth IS NOT NULL OR age_years IS NOT NULL
            ),
            CONSTRAINT fk_patients_merged_into FOREIGN KEY (merged_into)  REFERENCES patients (id),
            CONSTRAINT fk_patients_created_by  FOREIGN KEY (created_by)   REFERENCES users (id),
            CONSTRAINT fk_patients_updated_by  FOREIGN KEY (updated_by)   REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_patients_updated_at
            BEFORE UPDATE ON patients
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── patient_aliases ───────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS patient_aliases (
            id            UUID        NOT NULL DEFAULT uuid_generate_v4(),
            patient_id    UUID        NOT NULL,
            old_op_number VARCHAR(30) NOT NULL,
            source        VARCHAR(30) NOT NULL DEFAULT 'MERGE',
            remarks       VARCHAR(255),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by    UUID,
            CONSTRAINT pk_patient_aliases       PRIMARY KEY (id),
            CONSTRAINT uq_patient_aliases_old_op UNIQUE (old_op_number),
            CONSTRAINT ck_patient_aliases_source CHECK (source IN ('MERGE', 'HISTORICAL', 'CORRECTION')),
            CONSTRAINT fk_patient_aliases_patient    FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
            CONSTRAINT fk_patient_aliases_created_by FOREIGN KEY (created_by) REFERENCES users (id)
        )
    """)

    # ── merge_requests ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS merge_requests (
            id                   UUID        NOT NULL DEFAULT uuid_generate_v4(),
            primary_patient_id   UUID        NOT NULL,
            duplicate_patient_id UUID        NOT NULL,
            status               VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            reason               TEXT,
            decision_remarks     TEXT,
            requested_by         UUID        NOT NULL,
            requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_by          UUID,
            reviewed_at          TIMESTAMPTZ,
            merged_at            TIMESTAMPTZ,
            version              INTEGER     NOT NULL DEFAULT 1,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT pk_merge_requests        PRIMARY KEY (id),
            CONSTRAINT ck_merge_requests_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
            CONSTRAINT ck_merge_requests_distinct CHECK (primary_patient_id <> duplicate_patient_id),
            CONSTRAINT fk_merge_requests_primary      FOREIGN KEY (primary_patient_id)   REFERENCES patients (id),
            CONSTRAINT fk_merge_requests_duplicate    FOREIGN KEY (duplicate_patient_id) REFERENCES patients (id),
            CONSTRAINT fk_merge_requests_requested_by FOREIGN KEY (requested_by)         REFERENCES users (id),
            CONSTRAINT fk_merge_requests_reviewed_by  FOREIGN KEY (reviewed_by)          REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_merge_requests_updated_at
            BEFORE UPDATE ON merge_requests
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── visits ────────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS visits (
            id                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
            patient_id            UUID         NOT NULL,
            visit_date            DATE         NOT NULL,
            visit_type_code       VARCHAR(40)  NOT NULL,
            consultation_category VARCHAR(40),
            doctor_id             UUID,
            is_scheduled          BOOLEAN      NOT NULL DEFAULT FALSE,
            status                VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
            reason                VARCHAR(255),
            version               INTEGER      NOT NULL DEFAULT 1,
            created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
            created_by            UUID,
            updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
            updated_by            UUID,
            CONSTRAINT pk_visits       PRIMARY KEY (id),
            CONSTRAINT ck_visits_status CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
            CONSTRAINT ck_visits_date_not_future CHECK (is_scheduled = TRUE OR visit_date <= CURRENT_DATE),
            CONSTRAINT fk_visits_patient    FOREIGN KEY (patient_id) REFERENCES patients (id),
            CONSTRAINT fk_visits_doctor     FOREIGN KEY (doctor_id)  REFERENCES users (id),
            CONSTRAINT fk_visits_created_by FOREIGN KEY (created_by) REFERENCES users (id),
            CONSTRAINT fk_visits_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_visits_updated_at
            BEFORE UPDATE ON visits
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── case_sheets ───────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS case_sheets (
            id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
            visit_id            UUID        NOT NULL,
            patient_id          UUID        NOT NULL,
            appetite            TEXT, sleep TEXT, motion TEXT, energy_level TEXT,
            hereditary_diseases TEXT, past_ailments TEXT, surgeries TEXT,
            exercise_routine    TEXT, deliveries TEXT, present_complaints TEXT,
            other_observations  TEXT, remarks TEXT,
            version             INTEGER     NOT NULL DEFAULT 1,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by          UUID,
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by          UUID,
            CONSTRAINT pk_case_sheets     PRIMARY KEY (id),
            CONSTRAINT uq_case_sheets_visit UNIQUE (visit_id),
            CONSTRAINT fk_case_sheets_visit      FOREIGN KEY (visit_id)   REFERENCES visits (id) ON DELETE CASCADE,
            CONSTRAINT fk_case_sheets_patient    FOREIGN KEY (patient_id) REFERENCES patients (id),
            CONSTRAINT fk_case_sheets_created_by FOREIGN KEY (created_by) REFERENCES users (id),
            CONSTRAINT fk_case_sheets_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_case_sheets_updated_at
            BEFORE UPDATE ON case_sheets
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── consultation_notes ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS consultation_notes (
            id               UUID        NOT NULL DEFAULT uuid_generate_v4(),
            visit_id         UUID        NOT NULL,
            patient_id       UUID        NOT NULL,
            doctor_id        UUID,
            presenting_complaints TEXT, diagnosis TEXT, observations TEXT,
            treatment_advice TEXT, diet_advice TEXT, yoga_advice TEXT,
            review_date      DATE,
            version          INTEGER     NOT NULL DEFAULT 1,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by       UUID,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by       UUID,
            CONSTRAINT pk_consultation_notes PRIMARY KEY (id),
            CONSTRAINT fk_consultation_notes_visit      FOREIGN KEY (visit_id)   REFERENCES visits (id) ON DELETE CASCADE,
            CONSTRAINT fk_consultation_notes_patient    FOREIGN KEY (patient_id) REFERENCES patients (id),
            CONSTRAINT fk_consultation_notes_doctor     FOREIGN KEY (doctor_id)  REFERENCES users (id),
            CONSTRAINT fk_consultation_notes_created_by FOREIGN KEY (created_by) REFERENCES users (id),
            CONSTRAINT fk_consultation_notes_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_consultation_notes_updated_at
            BEFORE UPDATE ON consultation_notes
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── prescriptions ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS prescriptions (
            id                UUID        NOT NULL DEFAULT uuid_generate_v4(),
            visit_id          UUID        NOT NULL,
            patient_id        UUID        NOT NULL,
            doctor_id         UUID,
            prescription_date DATE        NOT NULL DEFAULT CURRENT_DATE,
            instructions      TEXT, review_advice TEXT, medicine_details TEXT,
            version           INTEGER     NOT NULL DEFAULT 1,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by        UUID,
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by        UUID,
            CONSTRAINT pk_prescriptions PRIMARY KEY (id),
            CONSTRAINT fk_prescriptions_visit      FOREIGN KEY (visit_id)   REFERENCES visits (id) ON DELETE CASCADE,
            CONSTRAINT fk_prescriptions_patient    FOREIGN KEY (patient_id) REFERENCES patients (id),
            CONSTRAINT fk_prescriptions_doctor     FOREIGN KEY (doctor_id)  REFERENCES users (id),
            CONSTRAINT fk_prescriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id),
            CONSTRAINT fk_prescriptions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_prescriptions_updated_at
            BEFORE UPDATE ON prescriptions
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── prescription_items ────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS prescription_items (
            id                UUID         NOT NULL DEFAULT uuid_generate_v4(),
            prescription_id   UUID         NOT NULL,
            line_no           SMALLINT     NOT NULL DEFAULT 1,
            medicine_name     VARCHAR(200) NOT NULL,
            dosage            VARCHAR(100), timing VARCHAR(100),
            duration          VARCHAR(100), usage_instruction TEXT,
            application_route VARCHAR(20),
            created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
            CONSTRAINT pk_prescription_items  PRIMARY KEY (id),
            CONSTRAINT uq_prescription_items_line UNIQUE (prescription_id, line_no),
            CONSTRAINT ck_prescription_items_route CHECK (
                application_route IS NULL OR application_route IN ('INTERNAL', 'EXTERNAL')
            ),
            CONSTRAINT fk_prescription_items_prescription
                FOREIGN KEY (prescription_id) REFERENCES prescriptions (id) ON DELETE CASCADE
        )
    """)

    # ── discharge_summaries ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS discharge_summaries (
            id                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
            visit_id                 UUID        NOT NULL,
            patient_id               UUID        NOT NULL,
            doctor_id                UUID,
            admission_date           DATE,
            discharge_date           DATE,
            diagnosis                TEXT, presenting_complaints TEXT,
            investigations_admission TEXT, treatments TEXT,
            condition_at_discharge   VARCHAR(40),
            follow_up_period         VARCHAR(100),
            discharge_advice         TEXT, medications TEXT, yoga_guidance TEXT,
            is_finalized             BOOLEAN     NOT NULL DEFAULT FALSE,
            finalized_at             TIMESTAMPTZ,
            finalized_by             UUID,
            amends_id                UUID,
            version                  INTEGER     NOT NULL DEFAULT 1,
            created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by               UUID,
            updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by               UUID,
            CONSTRAINT pk_discharge_summaries  PRIMARY KEY (id),
            CONSTRAINT ck_discharge_dates CHECK (
                admission_date IS NULL OR discharge_date IS NULL OR discharge_date >= admission_date
            ),
            CONSTRAINT fk_discharge_visit        FOREIGN KEY (visit_id)     REFERENCES visits (id) ON DELETE CASCADE,
            CONSTRAINT fk_discharge_patient      FOREIGN KEY (patient_id)   REFERENCES patients (id),
            CONSTRAINT fk_discharge_doctor       FOREIGN KEY (doctor_id)    REFERENCES users (id),
            CONSTRAINT fk_discharge_finalized_by FOREIGN KEY (finalized_by) REFERENCES users (id),
            CONSTRAINT fk_discharge_amends       FOREIGN KEY (amends_id)    REFERENCES discharge_summaries (id),
            CONSTRAINT fk_discharge_created_by   FOREIGN KEY (created_by)   REFERENCES users (id),
            CONSTRAINT fk_discharge_updated_by   FOREIGN KEY (updated_by)   REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_discharge_summaries_updated_at
            BEFORE UPDATE ON discharge_summaries
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── documents ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS documents (
            id                 UUID        NOT NULL DEFAULT uuid_generate_v4(),
            patient_id         UUID        NOT NULL,
            visit_id           UUID,
            document_type_code VARCHAR(40) NOT NULL,
            title              VARCHAR(200),
            file_name          VARCHAR(255) NOT NULL,
            storage_ref        VARCHAR(500) NOT NULL,
            content_type       VARCHAR(100),
            file_size_bytes    BIGINT,
            checksum_sha256    VARCHAR(64),
            document_date      DATE,
            is_historical      BOOLEAN     NOT NULL DEFAULT FALSE,
            status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
            remarks            TEXT,
            uploaded_by        UUID,
            uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by         UUID,
            CONSTRAINT pk_documents     PRIMARY KEY (id),
            CONSTRAINT ck_documents_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
            CONSTRAINT ck_documents_size   CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
            CONSTRAINT fk_documents_patient     FOREIGN KEY (patient_id)   REFERENCES patients (id),
            CONSTRAINT fk_documents_visit       FOREIGN KEY (visit_id)     REFERENCES visits (id),
            CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by)  REFERENCES users (id),
            CONSTRAINT fk_documents_updated_by  FOREIGN KEY (updated_by)   REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_documents_updated_at
            BEFORE UPDATE ON documents
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── follow_ups ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS follow_ups (
            id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
            patient_id      UUID        NOT NULL,
            visit_id        UUID,
            follow_up_date  DATE        NOT NULL,
            reason          VARCHAR(255),
            assigned_to     UUID,
            status_code     VARCHAR(40) NOT NULL DEFAULT 'PENDING',
            next_followup_id UUID,
            remarks         TEXT,
            version         INTEGER     NOT NULL DEFAULT 1,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by      UUID,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_by      UUID,
            CONSTRAINT pk_follow_ups PRIMARY KEY (id),
            CONSTRAINT fk_follow_ups_patient     FOREIGN KEY (patient_id)     REFERENCES patients (id),
            CONSTRAINT fk_follow_ups_visit       FOREIGN KEY (visit_id)       REFERENCES visits (id),
            CONSTRAINT fk_follow_ups_assigned_to FOREIGN KEY (assigned_to)    REFERENCES users (id),
            CONSTRAINT fk_follow_ups_next        FOREIGN KEY (next_followup_id) REFERENCES follow_ups (id),
            CONSTRAINT fk_follow_ups_created_by  FOREIGN KEY (created_by)     REFERENCES users (id),
            CONSTRAINT fk_follow_ups_updated_by  FOREIGN KEY (updated_by)     REFERENCES users (id)
        )
    """)
    op.execute("""
        CREATE OR REPLACE TRIGGER trg_follow_ups_updated_at
            BEFORE UPDATE ON follow_ups
            FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    """)

    # ── audit_log ─────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id            BIGSERIAL   NOT NULL,
            user_id       UUID,
            user_role     VARCHAR(60),
            action        VARCHAR(40) NOT NULL,
            entity_type   VARCHAR(60),
            entity_id     VARCHAR(64),
            patient_id    UUID,
            old_value     JSONB,
            new_value     JSONB,
            description   VARCHAR(255),
            ip_address    INET,
            user_agent    VARCHAR(255),
            request_id    VARCHAR(64),
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT pk_audit_log     PRIMARY KEY (id),
            CONSTRAINT fk_audit_log_user    FOREIGN KEY (user_id)    REFERENCES users (id),
            CONSTRAINT fk_audit_log_patient FOREIGN KEY (patient_id) REFERENCES patients (id)
        )
    """)

    # ── backup_log ────────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS backup_log (
            id            BIGSERIAL   NOT NULL,
            backup_type   VARCHAR(20) NOT NULL,
            status        VARCHAR(20) NOT NULL,
            location_ref  VARCHAR(500),
            size_bytes    BIGINT,
            message       TEXT,
            triggered_by  UUID,
            started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
            completed_at  TIMESTAMPTZ,
            CONSTRAINT pk_backup_log         PRIMARY KEY (id),
            CONSTRAINT ck_backup_log_type    CHECK (backup_type IN ('DATABASE', 'DOCUMENTS', 'FULL')),
            CONSTRAINT ck_backup_log_status  CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED')),
            CONSTRAINT fk_backup_log_triggered_by FOREIGN KEY (triggered_by) REFERENCES users (id)
        )
    """)

    # ── indexes ───────────────────────────────────────────────────────────────
    op.execute("CREATE INDEX IF NOT EXISTS idx_patients_mobile        ON patients (mobile)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_op_category   ON patients (op_category_code)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_patients_status        ON patients (status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_registration  ON patients (registration_date)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_patients_merged_into   ON patients (merged_into)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_name_trgm     ON patients USING gin (full_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patients_search_vector ON patients USING gin (search_vector)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_patient_aliases_patient ON patient_aliases (patient_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_merge_requests_status    ON merge_requests (status)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_merge_requests_primary   ON merge_requests (primary_patient_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_merge_requests_duplicate ON merge_requests (duplicate_patient_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_visits_patient         ON visits (patient_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visits_doctor          ON visits (doctor_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_visits_date            ON visits (visit_date)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_case_sheets_patient    ON case_sheets (patient_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_consult_notes_visit    ON consultation_notes (visit_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_consult_notes_patient  ON consultation_notes (patient_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_consult_notes_review   ON consultation_notes (review_date)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_prescriptions_visit    ON prescriptions (visit_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prescriptions_patient  ON prescriptions (patient_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prescription_items_rx  ON prescription_items (prescription_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_discharge_visit        ON discharge_summaries (visit_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_discharge_patient      ON discharge_summaries (patient_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_patient      ON documents (patient_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_visit        ON documents (visit_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_documents_type         ON documents (document_type_code)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_documents_status       ON documents (status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_follow_ups_patient     ON follow_ups (patient_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned    ON follow_ups (assigned_to)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_follow_ups_status_date ON follow_ups (status_code, follow_up_date)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_user         ON audit_log (user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_patient      ON audit_log (patient_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_audit_log_entity       ON audit_log (entity_type, entity_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_log_created      ON audit_log (created_at)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_master_data_type       ON master_data (type, is_active)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_backup_log_started     ON backup_log (started_at)")


def downgrade() -> None:
    # Drop in reverse dependency order
    for tbl in [
        "backup_log",
        "audit_log",
        "follow_ups",
        "documents",
        "discharge_summaries",
        "prescription_items",
        "prescriptions",
        "consultation_notes",
        "case_sheets",
        "visits",
        "merge_requests",
        "patient_aliases",
        "patients",
        "user_roles",
        "users",
        "op_sequence",
        "master_data",
        "roles",
    ]:
        op.execute(f"DROP TABLE IF EXISTS {tbl} CASCADE")
    op.execute("DROP FUNCTION IF EXISTS set_updated_at() CASCADE")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS citext")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
