-- =============================================================================
-- ArogyaM Patient Management System (PMS) — Phase 1
-- Database DDL / Data Model
-- =============================================================================
-- Target RDBMS : PostgreSQL 15+
-- Source Docs  : Docs/usecases.md (Phase 1 Detailed Use Case Document)
--                Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md (SAD v1.0)
-- Generated    : 2026-06-04
-- Status       : For Review
--
-- Scope (Phase 1 — Must/Should/Could-Have):
--   User & Access Management (RBAC) · Patient Registration & Profile ·
--   Category-wise transaction-safe OP Number generation · Search & Retrieval ·
--   Visits / Case Sheets / Consultation Notes · Prescriptions ·
--   Discharge Summaries · Document metadata (binaries in MinIO/S3) ·
--   Follow-Up tracking · Duplicate detection & controlled Merge ·
--   Master/Lookup data · Audit Trail · Backup logging.
--
-- Conventions:
--   * Identifiers       : snake_case; tables plural; PK column = id.
--   * Surrogate keys    : UUID for business/transactional entities (uuid_generate_v4);
--                         smallint/serial for small static lookup tables.
--   * Timestamps        : TIMESTAMPTZ (UTC), suffix _at.
--   * Audit columns     : created_at, created_by, updated_at, updated_by on
--                         mutable tables.
--   * Optimistic locking: integer `version` column on concurrently-edited records
--                         (UC-29); incremented by the application on update.
--   * Soft delete       : status / is_active flags — patient & clinical data is
--                         never physically deleted (UC-19, UC-30).
--   * Constraints       : pk_/fk_/uq_/ck_ prefixes; indexes idx_ prefix.
--   * Search            : pg_trgm (partial/fuzzy) + tsvector GIN (full-text) on
--                         patient identifiers (SAD §13).
--   * Files             : Only metadata stored here; binaries live in object
--                         storage (MinIO/S3) referenced by documents.storage_ref.
--
-- Execution order is dependency-safe (extensions → lookups → users → patients →
-- visits → clinical → documents → follow-ups → audit → indexes → seed data).
-- The script is re-runnable (IF NOT EXISTS / ON CONFLICT DO NOTHING) for dev use.
-- =============================================================================

-- =============================================================================
-- SECTION 0 — EXTENSIONS
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- trigram partial/fuzzy search
CREATE EXTENSION IF NOT EXISTS "citext";      -- case-insensitive email/username
-- NOTE: "vector" (pgvector) is intentionally NOT enabled in Phase 1 (AI/RAG is
-- Future scope, SAD §14). It can be added later without schema redesign.

-- =============================================================================
-- SECTION 0.1 — SHARED HELPER: updated_at maintenance trigger
-- =============================================================================
-- Keeps updated_at current on every UPDATE. The `version` column is owned by the
-- application (optimistic concurrency, UC-29) and is NOT auto-incremented here.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION set_updated_at() IS
    'Trigger function: sets updated_at = now() on row UPDATE.';

-- =============================================================================
-- SECTION 1 — REFERENCE / LOOKUP TABLES
-- =============================================================================

-- 1.1 roles -------------------------------------------------------------------
-- Static set of RBAC roles (UC-02, SAD §11). Seeded below.
CREATE TABLE IF NOT EXISTS roles (
    id          SMALLSERIAL  NOT NULL,
    code        VARCHAR(30)  NOT NULL,   -- machine code, e.g. ADMIN, DOCTOR
    name        VARCHAR(60)  NOT NULL,   -- display name
    description VARCHAR(255),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_roles PRIMARY KEY (id),
    CONSTRAINT uq_roles_code UNIQUE (code),
    CONSTRAINT uq_roles_name UNIQUE (name)
);
COMMENT ON TABLE  roles IS 'RBAC role definitions (Administrator, Doctor, Receptionist, Data Entry Staff).';
COMMENT ON COLUMN roles.code IS 'Stable machine-readable role code used in authorization checks.';

-- 1.2 master_data -------------------------------------------------------------
-- Generic typed lookup for configurable values (UC-28, SAD §7.4 / §8.1):
-- consultation_category, document_type, visit_type, follow_up_status,
-- blood_group, dietary_preference, marital_status, gender, condition_at_discharge.
-- Inactive values are retained for historical records but hidden from new entry.
CREATE TABLE IF NOT EXISTS master_data (
    id           SERIAL       NOT NULL,
    type         VARCHAR(40)  NOT NULL,   -- lookup domain, see ck_master_data_type
    code         VARCHAR(40)  NOT NULL,   -- stable code within the type
    label        VARCHAR(120) NOT NULL,   -- display label
    sort_order   SMALLINT     NOT NULL DEFAULT 0,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by   UUID,
    CONSTRAINT pk_master_data PRIMARY KEY (id),
    CONSTRAINT uq_master_data_type_code UNIQUE (type, code),
    CONSTRAINT ck_master_data_type CHECK (type IN (
        'consultation_category',
        'document_type',
        'visit_type',
        'follow_up_status',
        'blood_group',
        'dietary_preference',
        'marital_status',
        'gender',
        'condition_at_discharge'
    ))
);
COMMENT ON TABLE  master_data IS 'Typed reference/lookup values configurable by Administrator (UC-28).';
COMMENT ON COLUMN master_data.type IS 'Lookup domain (e.g. visit_type, document_type, follow_up_status).';
COMMENT ON COLUMN master_data.is_active IS 'Inactive values stay visible on old records but are hidden from new entry.';

CREATE TRIGGER trg_master_data_updated_at
    BEFORE UPDATE ON master_data
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 1.3 op_sequence -------------------------------------------------------------
-- Category-wise running sequence for OP number generation (UC-04, SAD §7.6).
-- The application performs: SELECT ... FOR UPDATE; increment last_sequence;
-- format with prefix + zero-padding inside the registration transaction so that
-- concurrent registrations cannot produce duplicate OP numbers (UC-29).
CREATE TABLE IF NOT EXISTS op_sequence (
    id              SMALLSERIAL  NOT NULL,
    category_code   VARCHAR(40)  NOT NULL,  -- FK-style link to master_data(consultation_category).code
    prefix          VARCHAR(10)  NOT NULL,  -- e.g. OPN, OPV, FC
    last_sequence   BIGINT       NOT NULL DEFAULT 0,
    padding_width   SMALLINT     NOT NULL DEFAULT 4,   -- zero-pad width, e.g. 4 -> 0012
    number_format   VARCHAR(40)  NOT NULL DEFAULT '{prefix}{seq}', -- template hint
    reset_policy    VARCHAR(10)  NOT NULL DEFAULT 'NEVER',  -- NEVER | YEARLY
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT pk_op_sequence PRIMARY KEY (id),
    CONSTRAINT uq_op_sequence_category UNIQUE (category_code),
    CONSTRAINT uq_op_sequence_prefix UNIQUE (prefix),
    CONSTRAINT ck_op_sequence_last_seq CHECK (last_sequence >= 0),
    CONSTRAINT ck_op_sequence_padding CHECK (padding_width BETWEEN 1 AND 12),
    CONSTRAINT ck_op_sequence_reset CHECK (reset_policy IN ('NEVER', 'YEARLY'))
);
COMMENT ON TABLE  op_sequence IS 'Per-category OP number counters; row-locked during generation for transaction safety (UC-04, UC-29).';
COMMENT ON COLUMN op_sequence.last_sequence IS 'Last issued sequence value; never reused even if a record is cancelled.';
COMMENT ON COLUMN op_sequence.padding_width IS 'Zero-pad width applied to the sequence number (e.g. width 4 => OPN0012).';

CREATE TRIGGER trg_op_sequence_updated_at
    BEFORE UPDATE ON op_sequence
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 2 — USER & ACCESS MANAGEMENT
-- =============================================================================

-- 2.1 users -------------------------------------------------------------------
-- Internal staff accounts (UC-01, UC-02, SAD §7.1). Passwords are stored only as
-- a bcrypt/argon2 hash. PII present here is restricted to non-clinical staff data.
CREATE TABLE IF NOT EXISTS users (
    id                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
    username              CITEXT       NOT NULL,           -- login handle (case-insensitive)
    email                 CITEXT,                          -- optional contact (case-insensitive)
    mobile                VARCHAR(20),
    full_name             VARCHAR(150) NOT NULL,
    password_hash         VARCHAR(255) NOT NULL,           -- bcrypt/argon2 — never plaintext
    status                VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | DISABLED | LOCKED
    is_doctor             BOOLEAN      NOT NULL DEFAULT FALSE,    -- true for users selectable as consulting doctor
    failed_login_attempts SMALLINT     NOT NULL DEFAULT 0,
    locked_until          TIMESTAMPTZ,                     -- temporary lockout window
    last_login_at         TIMESTAMPTZ,
    password_changed_at   TIMESTAMPTZ,
    version               INTEGER      NOT NULL DEFAULT 1, -- optimistic concurrency
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by            UUID,
    CONSTRAINT pk_users PRIMARY KEY (id),
    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_status CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
    CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_users_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  users IS 'Internal system users (staff/doctors). Only active users may log in (UC-01).';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt/argon2 hash only — plaintext passwords are never stored (UC-01 BR2).';
COMMENT ON COLUMN users.is_doctor IS 'Marks accounts eligible to be selected as the consulting doctor on visits/notes.';
COMMENT ON COLUMN users.status IS 'ACTIVE | DISABLED | LOCKED. Disabled/locked users cannot authenticate.';

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2.2 user_roles --------------------------------------------------------------
-- Many-to-many user↔role assignment (a user may hold one or more roles, UC-02 BR2).
CREATE TABLE IF NOT EXISTS user_roles (
    user_id     UUID        NOT NULL,
    role_id     SMALLINT    NOT NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID,
    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id)
);
COMMENT ON TABLE user_roles IS 'Junction table mapping users to one or more RBAC roles.';

-- =============================================================================
-- SECTION 3 — PATIENT / CARE SEEKER
-- =============================================================================

-- 3.1 patients ----------------------------------------------------------------
-- Core care-seeker profile (UC-03, UC-06, UC-07, SAD §7.5). Holds PII/PHI —
-- access is RBAC-gated and every profile open is audited (UC-05/UC-06).
CREATE TABLE IF NOT EXISTS patients (
    id                  UUID         NOT NULL DEFAULT uuid_generate_v4(),
    op_number           VARCHAR(30)  NOT NULL,            -- unique, immutable (UC-04, UC-07 BR1)
    op_category_code    VARCHAR(40)  NOT NULL,            -- master_data(consultation_category).code
    full_name           VARCHAR(150) NOT NULL,
    date_of_birth       DATE,                             -- exact DOB when known
    age_years           SMALLINT,                         -- captured when DOB unknown (historical records)
    gender              VARCHAR(20),                      -- master_data(gender).code
    mobile              VARCHAR(20),
    email               CITEXT,
    address_line        VARCHAR(255),
    city                VARCHAR(100),
    state               VARCHAR(100),
    pincode             VARCHAR(12),
    marital_status      VARCHAR(20),                      -- master_data(marital_status).code
    profession          VARCHAR(120),
    dietary_preference  VARCHAR(30),                      -- master_data(dietary_preference).code
    blood_group         VARCHAR(5),                       -- master_data(blood_group).code
    height_cm           NUMERIC(5,2),                     -- centimetres
    weight_kg           NUMERIC(5,2),                     -- kilograms
    status              VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | INACTIVE | MERGED
    merged_into         UUID,                             -- primary patient if this record was merged (UC-19)
    is_historical       BOOLEAN      NOT NULL DEFAULT FALSE,   -- migrated 2022+ record (UC-16)
    registration_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    remarks             TEXT,
    -- Full-text search vector over searchable identifiers (SAD §13).
    search_vector       TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('simple',
            coalesce(full_name, '') || ' ' ||
            coalesce(op_number, '') || ' ' ||
            coalesce(mobile, ''))
    ) STORED,
    version             INTEGER      NOT NULL DEFAULT 1,  -- optimistic concurrency (UC-29)
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by          UUID,
    CONSTRAINT pk_patients PRIMARY KEY (id),
    CONSTRAINT uq_patients_op_number UNIQUE (op_number),
    CONSTRAINT ck_patients_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'MERGED')),
    CONSTRAINT ck_patients_age CHECK (age_years IS NULL OR age_years BETWEEN 0 AND 150),
    CONSTRAINT ck_patients_height CHECK (height_cm IS NULL OR height_cm > 0),
    CONSTRAINT ck_patients_weight CHECK (weight_kg IS NULL OR weight_kg > 0),
    -- A name plus at least one contact/identification field is required (UC-03 BR4).
    CONSTRAINT ck_patients_min_identity CHECK (
        mobile IS NOT NULL OR email IS NOT NULL OR date_of_birth IS NOT NULL OR age_years IS NOT NULL
    ),
    CONSTRAINT fk_patients_merged_into FOREIGN KEY (merged_into) REFERENCES patients (id),
    CONSTRAINT fk_patients_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_patients_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  patients IS 'Care-seeker master profile with unique OP number; soft-deleted via status (UC-03/06/07).';
COMMENT ON COLUMN patients.op_number IS 'Unique, immutable OP number (e.g. OPN0012). Changed only via controlled admin correction (UC-07 BR1).';
COMMENT ON COLUMN patients.merged_into IS 'When status=MERGED, points to the surviving primary patient (UC-19).';
COMMENT ON COLUMN patients.is_historical IS 'TRUE for records migrated from paper/old system from 2022 onward (UC-16).';
COMMENT ON COLUMN patients.search_vector IS 'Generated full-text vector over name/OP/mobile for search (SAD §13).';

CREATE TRIGGER trg_patients_updated_at
    BEFORE UPDATE ON patients
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3.2 patient_aliases ---------------------------------------------------------
-- Retains old/legacy OP numbers (e.g. from merged records or historical systems)
-- so they remain searchable (UC-16 BR3, UC-19 BR3, SAD §7.11).
CREATE TABLE IF NOT EXISTS patient_aliases (
    id            UUID        NOT NULL DEFAULT uuid_generate_v4(),
    patient_id    UUID        NOT NULL,
    old_op_number VARCHAR(30) NOT NULL,
    source        VARCHAR(30) NOT NULL DEFAULT 'MERGE',  -- MERGE | HISTORICAL | CORRECTION
    remarks       VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    CONSTRAINT pk_patient_aliases PRIMARY KEY (id),
    CONSTRAINT uq_patient_aliases_old_op UNIQUE (old_op_number),
    CONSTRAINT ck_patient_aliases_source CHECK (source IN ('MERGE', 'HISTORICAL', 'CORRECTION')),
    CONSTRAINT fk_patient_aliases_patient FOREIGN KEY (patient_id) REFERENCES patients (id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_aliases_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);
COMMENT ON TABLE patient_aliases IS 'Alternate/old OP numbers kept as searchable aliases after merge or migration (UC-16/UC-19).';

-- 3.3 merge_requests ----------------------------------------------------------
-- Supports the two-step duplicate-merge workflow (UC-18/UC-19, SAD §11.5/§12.2):
-- Receptionist/Data Entry may *request* a merge (status PENDING); an Administrator
-- reviews and APPROVES (executes the merge) or REJECTS it. The actual merge is
-- performed in a single transaction by the service layer when approved. This row
-- records the request, the decision, and who/when — fully audited.
CREATE TABLE IF NOT EXISTS merge_requests (
    id                   UUID        NOT NULL DEFAULT uuid_generate_v4(),
    primary_patient_id   UUID        NOT NULL,            -- record proposed to survive
    duplicate_patient_id UUID        NOT NULL,            -- record proposed to be merged away
    status               VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING | APPROVED | REJECTED | CANCELLED
    reason               TEXT,                            -- requester's justification
    decision_remarks     TEXT,                            -- admin's approve/reject note
    requested_by         UUID        NOT NULL,            -- receptionist/data-entry/admin
    requested_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by          UUID,                            -- admin who approved/rejected
    reviewed_at          TIMESTAMPTZ,
    merged_at            TIMESTAMPTZ,                      -- set when the merge actually executes
    version              INTEGER     NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_merge_requests PRIMARY KEY (id),
    CONSTRAINT ck_merge_requests_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    -- A record cannot be merged into itself.
    CONSTRAINT ck_merge_requests_distinct CHECK (primary_patient_id <> duplicate_patient_id),
    CONSTRAINT fk_merge_requests_primary FOREIGN KEY (primary_patient_id) REFERENCES patients (id),
    CONSTRAINT fk_merge_requests_duplicate FOREIGN KEY (duplicate_patient_id) REFERENCES patients (id),
    CONSTRAINT fk_merge_requests_requested_by FOREIGN KEY (requested_by) REFERENCES users (id),
    CONSTRAINT fk_merge_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users (id)
);
COMMENT ON TABLE  merge_requests IS 'Two-step merge workflow: staff request, Administrator approves/executes or rejects (UC-19, SAD §11.5/§12.2).';
COMMENT ON COLUMN merge_requests.status IS 'PENDING (requested) -> APPROVED (merge executed) | REJECTED | CANCELLED.';
COMMENT ON COLUMN merge_requests.merged_at IS 'Timestamp when the approved merge transaction completed.';

CREATE TRIGGER trg_merge_requests_updated_at
    BEFORE UPDATE ON merge_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 4 — VISITS & CLINICAL RECORDS
-- =============================================================================

-- 4.1 visits ------------------------------------------------------------------
-- One encounter per visit/consultation (UC-08, SAD §7.8). History is preserved —
-- visits are never overwritten.
CREATE TABLE IF NOT EXISTS visits (
    id                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
    patient_id            UUID         NOT NULL,
    visit_date            DATE         NOT NULL,
    visit_type_code       VARCHAR(40)  NOT NULL,          -- master_data(visit_type).code
    consultation_category VARCHAR(40),                    -- master_data(consultation_category).code
    doctor_id             UUID,                           -- users.id where is_doctor = TRUE
    is_scheduled          BOOLEAN      NOT NULL DEFAULT FALSE, -- TRUE allows future visit_date (UC-08 BR4)
    status                VARCHAR(20)  NOT NULL DEFAULT 'OPEN',  -- OPEN | COMPLETED | CANCELLED
    reason                VARCHAR(255),
    version               INTEGER      NOT NULL DEFAULT 1, -- optimistic concurrency (UC-29)
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by            UUID,
    CONSTRAINT pk_visits PRIMARY KEY (id),
    CONSTRAINT ck_visits_status CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
    -- A non-scheduled visit cannot be future-dated (UC-08 BR4).
    CONSTRAINT ck_visits_date_not_future CHECK (is_scheduled = TRUE OR visit_date <= CURRENT_DATE),
    CONSTRAINT fk_visits_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_visits_doctor FOREIGN KEY (doctor_id) REFERENCES users (id),
    CONSTRAINT fk_visits_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_visits_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  visits IS 'Patient encounters (consultation/review/online/camp). One row per visit; never overwritten (UC-08).';
COMMENT ON COLUMN visits.is_scheduled IS 'TRUE permits a future visit_date for scheduled/planned visits (UC-08 BR4).';

CREATE TRIGGER trg_visits_updated_at
    BEFORE UPDATE ON visits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.2 case_sheets -------------------------------------------------------------
-- Structured online consultation case sheet, one per visit (UC-09, SAD §7.6/§7.8).
CREATE TABLE IF NOT EXISTS case_sheets (
    id                  UUID        NOT NULL DEFAULT uuid_generate_v4(),
    visit_id            UUID        NOT NULL,
    patient_id          UUID        NOT NULL,             -- denormalized for direct patient queries
    appetite            TEXT,
    sleep               TEXT,
    motion              TEXT,
    energy_level        TEXT,
    hereditary_diseases TEXT,
    past_ailments       TEXT,
    surgeries           TEXT,
    exercise_routine    TEXT,
    deliveries          TEXT,                             -- normal/caesarean where applicable (UC-09)
    present_complaints  TEXT,
    other_observations  TEXT,
    remarks             TEXT,
    version             INTEGER     NOT NULL DEFAULT 1,   -- optimistic concurrency / versioned edits
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID,
    CONSTRAINT pk_case_sheets PRIMARY KEY (id),
    CONSTRAINT uq_case_sheets_visit UNIQUE (visit_id),    -- at most one case sheet per visit
    CONSTRAINT fk_case_sheets_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE,
    CONSTRAINT fk_case_sheets_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_case_sheets_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_case_sheets_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE case_sheets IS 'Structured online consultation case sheet, one per visit; edits are audited (UC-09).';

CREATE TRIGGER trg_case_sheets_updated_at
    BEFORE UPDATE ON case_sheets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.3 consultation_notes ------------------------------------------------------
-- Doctor's clinical notes per visit (UC-10, SAD §7.8). Not deleted by normal
-- users; corrections recorded via audit trail / amended entries.
CREATE TABLE IF NOT EXISTS consultation_notes (
    id               UUID        NOT NULL DEFAULT uuid_generate_v4(),
    visit_id         UUID        NOT NULL,
    patient_id       UUID        NOT NULL,                -- denormalized for direct patient queries
    doctor_id        UUID,                                -- users.id (authoring doctor)
    presenting_complaints TEXT,
    diagnosis        TEXT,                                -- diagnosis / programme
    observations     TEXT,
    treatment_advice TEXT,
    diet_advice      TEXT,
    yoga_advice      TEXT,                                -- yoga/practice advice where applicable
    review_date      DATE,
    version          INTEGER     NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by       UUID,
    CONSTRAINT pk_consultation_notes PRIMARY KEY (id),
    CONSTRAINT fk_consultation_notes_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE,
    CONSTRAINT fk_consultation_notes_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_consultation_notes_doctor FOREIGN KEY (doctor_id) REFERENCES users (id),
    CONSTRAINT fk_consultation_notes_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_consultation_notes_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  consultation_notes IS 'Doctor consultation notes (diagnosis, advice, review date) per visit; date/time stamped (UC-10).';
COMMENT ON COLUMN consultation_notes.review_date IS 'Advised review/follow-up date; may drive a follow_ups record.';

CREATE TRIGGER trg_consultation_notes_updated_at
    BEFORE UPDATE ON consultation_notes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.4 prescriptions -----------------------------------------------------------
-- Prescription header per visit (UC-11, SAD §7.9). Individual medicines are kept
-- in prescription_items for structured entry; free-text remains available too.
CREATE TABLE IF NOT EXISTS prescriptions (
    id                UUID        NOT NULL DEFAULT uuid_generate_v4(),
    visit_id          UUID        NOT NULL,
    patient_id        UUID        NOT NULL,
    doctor_id         UUID,
    prescription_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    instructions      TEXT,                               -- general usage/instructions
    review_advice     TEXT,
    medicine_details  TEXT,                               -- free-text fallback / externally captured
    version           INTEGER     NOT NULL DEFAULT 1,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by        UUID,
    CONSTRAINT pk_prescriptions PRIMARY KEY (id),
    CONSTRAINT fk_prescriptions_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE,
    CONSTRAINT fk_prescriptions_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_prescriptions_doctor FOREIGN KEY (doctor_id) REFERENCES users (id),
    CONSTRAINT fk_prescriptions_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_prescriptions_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE prescriptions IS 'Prescription header linked to a visit; includes doctor and date (UC-11).';

CREATE TRIGGER trg_prescriptions_updated_at
    BEFORE UPDATE ON prescriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4.5 prescription_items ------------------------------------------------------
-- Structured medicine lines for a prescription (UC-11: name, dosage, timing,
-- duration, instruction, application route).
CREATE TABLE IF NOT EXISTS prescription_items (
    id                UUID        NOT NULL DEFAULT uuid_generate_v4(),
    prescription_id   UUID        NOT NULL,
    line_no           SMALLINT    NOT NULL DEFAULT 1,
    medicine_name     VARCHAR(200) NOT NULL,
    dosage            VARCHAR(100),
    timing            VARCHAR(100),                       -- e.g. morning/night, before/after food
    duration          VARCHAR(100),                       -- e.g. 7 days
    usage_instruction TEXT,
    application_route VARCHAR(20),                        -- INTERNAL | EXTERNAL
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_prescription_items PRIMARY KEY (id),
    CONSTRAINT uq_prescription_items_line UNIQUE (prescription_id, line_no),
    CONSTRAINT ck_prescription_items_route CHECK (application_route IS NULL OR application_route IN ('INTERNAL', 'EXTERNAL')),
    CONSTRAINT fk_prescription_items_prescription FOREIGN KEY (prescription_id) REFERENCES prescriptions (id) ON DELETE CASCADE
);
COMMENT ON TABLE prescription_items IS 'Structured medicine lines (name/dosage/timing/duration/route) under a prescription (UC-11).';

-- 4.6 discharge_summaries -----------------------------------------------------
-- Discharge summary per treatment programme/visit (UC-13, SAD §7.9).
-- Immutable once finalized; controlled amendment creates an audited new version.
CREATE TABLE IF NOT EXISTS discharge_summaries (
    id                       UUID        NOT NULL DEFAULT uuid_generate_v4(),
    visit_id                 UUID        NOT NULL,
    patient_id               UUID        NOT NULL,
    doctor_id                UUID,
    admission_date           DATE,
    discharge_date           DATE,
    diagnosis                TEXT,                        -- diagnosis / programme
    presenting_complaints    TEXT,
    investigations_admission TEXT,
    treatments               TEXT,                        -- treatments undertaken
    condition_at_discharge   VARCHAR(40),                 -- master_data(condition_at_discharge).code
    follow_up_period         VARCHAR(100),
    discharge_advice         TEXT,
    medications              TEXT,
    yoga_guidance            TEXT,                        -- yoga/asana guidance where applicable
    is_finalized             BOOLEAN     NOT NULL DEFAULT FALSE, -- finalized => immutable (UC-13 BR3)
    finalized_at             TIMESTAMPTZ,
    finalized_by             UUID,
    amends_id                UUID,                        -- prior summary this amends (controlled amendment)
    version                  INTEGER     NOT NULL DEFAULT 1,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by               UUID,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by               UUID,
    CONSTRAINT pk_discharge_summaries PRIMARY KEY (id),
    -- Discharge date cannot precede admission date (UC-13 BR2).
    CONSTRAINT ck_discharge_dates CHECK (
        admission_date IS NULL OR discharge_date IS NULL OR discharge_date >= admission_date
    ),
    CONSTRAINT fk_discharge_visit FOREIGN KEY (visit_id) REFERENCES visits (id) ON DELETE CASCADE,
    CONSTRAINT fk_discharge_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_discharge_doctor FOREIGN KEY (doctor_id) REFERENCES users (id),
    CONSTRAINT fk_discharge_finalized_by FOREIGN KEY (finalized_by) REFERENCES users (id),
    CONSTRAINT fk_discharge_amends FOREIGN KEY (amends_id) REFERENCES discharge_summaries (id),
    CONSTRAINT fk_discharge_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_discharge_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  discharge_summaries IS 'Discharge summary per visit/programme; immutable after finalization (UC-13).';
COMMENT ON COLUMN discharge_summaries.amends_id IS 'Links an amendment to the discharge summary it supersedes (controlled amendment).';

CREATE TRIGGER trg_discharge_summaries_updated_at
    BEFORE UPDATE ON discharge_summaries
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 5 — DOCUMENTS (metadata only; binaries in MinIO/S3)
-- =============================================================================

-- 5.1 documents ---------------------------------------------------------------
-- Uploaded file metadata (UC-12, UC-14, UC-15, UC-16, UC-30, SAD §7.9/§8.1).
-- The binary lives in object storage; only storage_ref is kept here. Files are
-- never public; access is permission-checked and logged. Soft-deleted via status.
CREATE TABLE IF NOT EXISTS documents (
    id                 UUID        NOT NULL DEFAULT uuid_generate_v4(),
    patient_id         UUID        NOT NULL,
    visit_id           UUID,                              -- optional link to a specific visit
    document_type_code VARCHAR(40) NOT NULL,              -- master_data(document_type).code
    title              VARCHAR(200),
    file_name          VARCHAR(255) NOT NULL,             -- original file name
    storage_ref        VARCHAR(500) NOT NULL,             -- object-storage key/path (MinIO/S3)
    content_type       VARCHAR(100),                      -- MIME type
    file_size_bytes    BIGINT,
    checksum_sha256    VARCHAR(64),                       -- integrity / dedup
    document_date      DATE,                              -- date the document pertains to
    is_historical      BOOLEAN     NOT NULL DEFAULT FALSE,    -- migrated/old record (UC-16)
    status             VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | ARCHIVED | DELETED (soft delete)
    remarks            TEXT,
    uploaded_by        UUID,
    uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by         UUID,
    CONSTRAINT pk_documents PRIMARY KEY (id),
    CONSTRAINT ck_documents_status CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
    CONSTRAINT ck_documents_size CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
    CONSTRAINT fk_documents_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_documents_visit FOREIGN KEY (visit_id) REFERENCES visits (id),
    CONSTRAINT fk_documents_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id),
    CONSTRAINT fk_documents_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  documents IS 'Metadata for uploaded files; binaries live in MinIO/S3 (storage_ref). Access is logged, never public (UC-12/14/15/30).';
COMMENT ON COLUMN documents.storage_ref IS 'Object-storage key/path; the file itself is never served via a public URL (UC-30).';
COMMENT ON COLUMN documents.status IS 'Soft-delete state: ACTIVE | ARCHIVED | DELETED (UC-30 BR4).';

CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 6 — FOLLOW-UP TRACKING
-- =============================================================================

-- 6.1 follow_ups --------------------------------------------------------------
-- Review/action-item tracking (UC-20, UC-21, SAD §7.10). Status lifecycle:
-- Pending → Contacted/NotReachable → Completed/Rescheduled (SAD §12.1).
CREATE TABLE IF NOT EXISTS follow_ups (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
    patient_id      UUID        NOT NULL,
    visit_id        UUID,
    follow_up_date  DATE        NOT NULL,
    reason          VARCHAR(255),
    assigned_to     UUID,                                 -- users.id (staff/doctor responsible)
    status_code     VARCHAR(40) NOT NULL DEFAULT 'PENDING', -- master_data(follow_up_status).code
    next_followup_id UUID,                                -- chains a rescheduled follow-up (UC-21 BR3)
    remarks         TEXT,
    version         INTEGER     NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    CONSTRAINT pk_follow_ups PRIMARY KEY (id),
    CONSTRAINT fk_follow_ups_patient FOREIGN KEY (patient_id) REFERENCES patients (id),
    CONSTRAINT fk_follow_ups_visit FOREIGN KEY (visit_id) REFERENCES visits (id),
    CONSTRAINT fk_follow_ups_assigned_to FOREIGN KEY (assigned_to) REFERENCES users (id),
    CONSTRAINT fk_follow_ups_next FOREIGN KEY (next_followup_id) REFERENCES follow_ups (id),
    CONSTRAINT fk_follow_ups_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_follow_ups_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);
COMMENT ON TABLE  follow_ups IS 'Follow-up/review tasks surfaced on the dashboard; status-tracked, not deletable by normal users (UC-20/21).';
COMMENT ON COLUMN follow_ups.next_followup_id IS 'On reschedule, links to the newly created follow-up (UC-21 BR3).';

CREATE TRIGGER trg_follow_ups_updated_at
    BEFORE UPDATE ON follow_ups
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- SECTION 7 — AUDIT & OPERATIONS
-- =============================================================================

-- 7.1 audit_log ---------------------------------------------------------------
-- Append-only audit trail (UC-25, SAD §7.13/§10). This is the ONLY table allowed
-- to hold patient/clinical detail in a log context; it is admin-readable only and
-- must not be editable by normal users. Captures create/view/update/upload/
-- export/merge/login actions with old/new values where applicable.
CREATE TABLE IF NOT EXISTS audit_log (
    id            BIGSERIAL   NOT NULL,
    user_id       UUID,                                  -- actor (NULL for failed logins on unknown user)
    user_role     VARCHAR(60),                           -- role snapshot at action time
    action        VARCHAR(40) NOT NULL,                  -- LOGIN | VIEW | CREATE | UPDATE | UPLOAD | EXPORT | MERGE | ...
    entity_type   VARCHAR(60),                           -- e.g. patient, visit, document
    entity_id     VARCHAR(64),                           -- string form of the affected record id
    patient_id    UUID,                                  -- affected patient where relevant (UC-25)
    old_value     JSONB,                                 -- prior values (redacted as policy requires)
    new_value     JSONB,                                 -- new values
    description   VARCHAR(255),
    ip_address    INET,
    user_agent    VARCHAR(255),
    request_id    VARCHAR(64),                           -- correlation id to app logs (SAD §10.1)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_audit_log PRIMARY KEY (id),
    CONSTRAINT fk_audit_log_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_audit_log_patient FOREIGN KEY (patient_id) REFERENCES patients (id)
);
COMMENT ON TABLE  audit_log IS 'Append-only audit trail of sensitive actions; admin-read-only, never edited by normal users (UC-25).';
COMMENT ON COLUMN audit_log.request_id IS 'Correlation id linking an audit entry to redacted application logs (SAD §10.1).';

-- 7.2 backup_log --------------------------------------------------------------
-- Records backup runs and outcomes (UC-26, SAD §7.14/§16).
CREATE TABLE IF NOT EXISTS backup_log (
    id            BIGSERIAL   NOT NULL,
    backup_type   VARCHAR(20) NOT NULL,                  -- DATABASE | DOCUMENTS | FULL
    status        VARCHAR(20) NOT NULL,                  -- STARTED | SUCCESS | FAILED
    location_ref  VARCHAR(500),                          -- backup target path/bucket
    size_bytes    BIGINT,
    message       TEXT,                                  -- error/details on failure
    triggered_by  UUID,                                  -- NULL for scheduled/cron-triggered
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ,
    CONSTRAINT pk_backup_log PRIMARY KEY (id),
    CONSTRAINT ck_backup_log_type CHECK (backup_type IN ('DATABASE', 'DOCUMENTS', 'FULL')),
    CONSTRAINT ck_backup_log_status CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED')),
    CONSTRAINT fk_backup_log_triggered_by FOREIGN KEY (triggered_by) REFERENCES users (id)
);
COMMENT ON TABLE backup_log IS 'Backup run history and status for monitoring/alerts (UC-26).';

-- =============================================================================
-- SECTION 8 — INDEXES
-- =============================================================================

-- 8.1 Search & lookup indexes (SAD §13) --------------------------------------
-- OP number / mobile exact lookups (B-tree). op_number already UNIQUE.
CREATE INDEX IF NOT EXISTS idx_patients_mobile        ON patients (mobile);
CREATE INDEX IF NOT EXISTS idx_patients_op_category   ON patients (op_category_code);
CREATE INDEX IF NOT EXISTS idx_patients_status        ON patients (status);
CREATE INDEX IF NOT EXISTS idx_patients_registration  ON patients (registration_date);
CREATE INDEX IF NOT EXISTS idx_patients_merged_into   ON patients (merged_into);
-- Partial/fuzzy name search (trigram) and full-text (tsvector).
CREATE INDEX IF NOT EXISTS idx_patients_name_trgm     ON patients USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_search_vector ON patients USING gin (search_vector);
-- Alias lookup by old OP number.
CREATE INDEX IF NOT EXISTS idx_patient_aliases_patient ON patient_aliases (patient_id);
-- Merge-request queues (admin "pending requests" view + per-patient lookup).
CREATE INDEX IF NOT EXISTS idx_merge_requests_status    ON merge_requests (status);
CREATE INDEX IF NOT EXISTS idx_merge_requests_primary   ON merge_requests (primary_patient_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_duplicate ON merge_requests (duplicate_patient_id);

-- 8.2 Foreign-key / timeline indexes -----------------------------------------
CREATE INDEX IF NOT EXISTS idx_visits_patient         ON visits (patient_id);
CREATE INDEX IF NOT EXISTS idx_visits_doctor          ON visits (doctor_id);
CREATE INDEX IF NOT EXISTS idx_visits_date            ON visits (visit_date);
CREATE INDEX IF NOT EXISTS idx_case_sheets_patient    ON case_sheets (patient_id);
CREATE INDEX IF NOT EXISTS idx_consult_notes_visit    ON consultation_notes (visit_id);
CREATE INDEX IF NOT EXISTS idx_consult_notes_patient  ON consultation_notes (patient_id);
CREATE INDEX IF NOT EXISTS idx_consult_notes_review   ON consultation_notes (review_date);
CREATE INDEX IF NOT EXISTS idx_prescriptions_visit    ON prescriptions (visit_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient  ON prescriptions (patient_id);
CREATE INDEX IF NOT EXISTS idx_prescription_items_rx  ON prescription_items (prescription_id);
CREATE INDEX IF NOT EXISTS idx_discharge_visit        ON discharge_summaries (visit_id);
CREATE INDEX IF NOT EXISTS idx_discharge_patient      ON discharge_summaries (patient_id);

-- 8.3 Document indexes --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_patient      ON documents (patient_id);
CREATE INDEX IF NOT EXISTS idx_documents_visit        ON documents (visit_id);
CREATE INDEX IF NOT EXISTS idx_documents_type         ON documents (document_type_code);
CREATE INDEX IF NOT EXISTS idx_documents_status       ON documents (status);

-- 8.4 Follow-up dashboard indexes --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient     ON follow_ups (patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned    ON follow_ups (assigned_to);
-- Composite index for the common "pending follow-ups by date" dashboard query.
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_date ON follow_ups (status_code, follow_up_date);

-- 8.5 Audit / lookup indexes --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_user         ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_patient      ON audit_log (patient_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity       ON audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created      ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_master_data_type       ON master_data (type, is_active);
CREATE INDEX IF NOT EXISTS idx_backup_log_started     ON backup_log (started_at);

-- =============================================================================
-- SECTION 9 — REFERENCE / SEED DATA
-- =============================================================================
-- Idempotent inserts (ON CONFLICT DO NOTHING) for required lookup values.

-- 9.1 Roles -------------------------------------------------------------------
INSERT INTO roles (code, name, description) VALUES
    ('ADMIN',       'Administrator',     'Full system configuration, users, master data, audit, backup, reporting.'),
    ('DOCTOR',      'Doctor',            'Clinical: history, consultation notes, prescriptions, discharge summaries.'),
    ('RECEPTION',   'Receptionist',      'Front office: registration, search, visits, demographic updates, uploads.'),
    ('DATA_ENTRY',  'Data Entry Staff',  'Historical record digitization, scanned uploads, linking.')
ON CONFLICT (code) DO NOTHING;

-- 9.2 Master data: consultation categories ------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('consultation_category', 'REGULAR', 'Regular Consultation',   1),
    ('consultation_category', 'VILLAGE', 'Village Consultation',   2),
    ('consultation_category', 'CAMP',    'Free Camp Consultation', 3)
ON CONFLICT (type, code) DO NOTHING;

-- 9.3 OP sequences (one per consultation category, UC-04) ----------------------
INSERT INTO op_sequence (category_code, prefix, last_sequence, padding_width) VALUES
    ('REGULAR', 'OPN', 0, 4),
    ('VILLAGE', 'OPV', 0, 4),
    ('CAMP',    'FC',  0, 4)
ON CONFLICT (category_code) DO NOTHING;

-- 9.4 Master data: visit types ------------------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('visit_type', 'NEW',      'New Consultation',        1),
    ('visit_type', 'REVIEW',   'Review / Follow-up',      2),
    ('visit_type', 'ONLINE',   'Online Consultation',     3),
    ('visit_type', 'INPERSON', 'In-person Consultation',  4),
    ('visit_type', 'CAMP',     'Camp / Village Consultation', 5)
ON CONFLICT (type, code) DO NOTHING;

-- 9.5 Master data: document types (UC-15) -------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('document_type', 'LAB_REPORT',      'Lab Report',          1),
    ('document_type', 'PHOTOGRAPH',      'Photograph',          2),
    ('document_type', 'INVESTIGATION',   'Investigation Report',3),
    ('document_type', 'CASE_SHEET',      'Case Sheet',          4),
    ('document_type', 'PRESCRIPTION',    'Prescription',        5),
    ('document_type', 'DISCHARGE_SUMMARY','Discharge Summary',  6),
    ('document_type', 'OTHER',           'Other',               7)
ON CONFLICT (type, code) DO NOTHING;

-- 9.6 Master data: follow-up statuses (UC-21, SAD §12.1) ----------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('follow_up_status', 'PENDING',     'Pending',       1),
    ('follow_up_status', 'CONTACTED',   'Contacted',     2),
    ('follow_up_status', 'COMPLETED',   'Completed',     3),
    ('follow_up_status', 'RESCHEDULED', 'Rescheduled',   4),
    ('follow_up_status', 'NOT_REACHABLE','Not Reachable',5)
ON CONFLICT (type, code) DO NOTHING;

-- 9.7 Master data: blood groups -----------------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('blood_group', 'A_POS',  'A+',  1),
    ('blood_group', 'A_NEG',  'A-',  2),
    ('blood_group', 'B_POS',  'B+',  3),
    ('blood_group', 'B_NEG',  'B-',  4),
    ('blood_group', 'AB_POS', 'AB+', 5),
    ('blood_group', 'AB_NEG', 'AB-', 6),
    ('blood_group', 'O_POS',  'O+',  7),
    ('blood_group', 'O_NEG',  'O-',  8)
ON CONFLICT (type, code) DO NOTHING;

-- 9.8 Master data: dietary preferences ----------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('dietary_preference', 'VEG',     'Vegetarian',     1),
    ('dietary_preference', 'NONVEG',  'Non-Vegetarian', 2),
    ('dietary_preference', 'VEGAN',   'Vegan',          3),
    ('dietary_preference', 'EGGETARIAN','Eggetarian',   4)
ON CONFLICT (type, code) DO NOTHING;

-- 9.9 Master data: marital status ---------------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('marital_status', 'SINGLE',   'Single',   1),
    ('marital_status', 'MARRIED',  'Married',  2),
    ('marital_status', 'DIVORCED', 'Divorced', 3),
    ('marital_status', 'WIDOWED',  'Widowed',  4)
ON CONFLICT (type, code) DO NOTHING;

-- 9.10 Master data: gender ----------------------------------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('gender', 'MALE',   'Male',   1),
    ('gender', 'FEMALE', 'Female', 2),
    ('gender', 'OTHER',  'Other',  3)
ON CONFLICT (type, code) DO NOTHING;

-- 9.11 Master data: condition at discharge (UC-13) ----------------------------
INSERT INTO master_data (type, code, label, sort_order) VALUES
    ('condition_at_discharge', 'IMPROVED',  'Improved',           1),
    ('condition_at_discharge', 'STABLE',    'Stable',             2),
    ('condition_at_discharge', 'UNCHANGED', 'Unchanged',          3),
    ('condition_at_discharge', 'REFERRED',  'Referred',           4),
    ('condition_at_discharge', 'LAMA',      'Left Against Advice', 5)
ON CONFLICT (type, code) DO NOTHING;

-- =============================================================================
-- END OF DDL — ArogyaM PMS Phase 1 Data Model
-- =============================================================================
