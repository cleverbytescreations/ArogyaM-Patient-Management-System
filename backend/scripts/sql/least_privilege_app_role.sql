-- =============================================================================
-- ArogyaM PMS — Least-privilege application database role (SEC-T0.3)
-- =============================================================================
-- Separates the *migration/owner* role from the *runtime* role so the running
-- API never holds DDL or superuser rights — only the DML it actually needs.
--
-- Topology (production):
--   • Owner role (e.g. `arogyam`)      → owns the schema, runs `alembic upgrade`
--     (the entrypoint migration step). Used ONLY for deploys/migrations.
--   • App role   (`arogyam_app`)       → used by the API at runtime
--     (DATABASE_URL points here). Has SELECT/INSERT/UPDATE/DELETE on data
--     tables, but cannot CREATE/DROP/ALTER, and cannot mutate the audit trail.
--
-- Apply AFTER migrations have created the schema, connected to the app database
-- as the owner/superuser:
--
--   psql "$ADMIN_DATABASE_URL" \
--        -v app_password="$AROGYAM_APP_DB_PASSWORD" \
--        -f backend/scripts/sql/least_privilege_app_role.sql
--
-- Then set the runtime DATABASE_URL to use arogyam_app, e.g.:
--   postgresql+psycopg://arogyam_app:<password>@db:5432/arogyam
--
-- Re-running is safe (idempotent): the role is created only if absent and the
-- grants are reapplied.
-- =============================================================================

\set ON_ERROR_STOP on

-- 1. Create the runtime role if it does not already exist, then (re)set its
--    password. `\gexec` runs the generated statement; `:'app_password'` is
--    substituted by psql here (it is NOT substituted inside a dollar-quoted
--    DO block, so that idiom cannot be used for a parameterized password).
SELECT format('CREATE ROLE arogyam_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arogyam_app')
\gexec

SELECT format('ALTER ROLE arogyam_app LOGIN PASSWORD %L', :'app_password')
\gexec

-- The app role must never accumulate elevated attributes.
ALTER ROLE arogyam_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- 2. Connection + schema usage (no CREATE on schema → cannot add objects). ---
GRANT CONNECT ON DATABASE arogyam TO arogyam_app;
GRANT USAGE  ON SCHEMA public      TO arogyam_app;
REVOKE CREATE ON SCHEMA public FROM arogyam_app;

-- 3. Baseline DML on every existing table + sequence. -----------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO arogyam_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES  IN SCHEMA public TO arogyam_app;

-- 4. Future tables/sequences created by the owner inherit the same grants. ---
--    (Run as / on behalf of the owner role that creates objects via Alembic.)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arogyam_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO arogyam_app;

-- 5. Enforce the append-only audit trail at the privilege layer. -------------
--    The audit_log is append-only by design (CLAUDE.md / SAD §10.1): the app
--    may INSERT and SELECT, but must not UPDATE or DELETE history.
REVOKE UPDATE, DELETE ON TABLE audit_log FROM arogyam_app;

-- 6. Defence-in-depth: the app role has no rights to the migration bookkeeping.
REVOKE ALL ON TABLE alembic_version FROM arogyam_app;
GRANT  SELECT ON TABLE alembic_version TO arogyam_app;
