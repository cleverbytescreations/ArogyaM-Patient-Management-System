---
name: testing-quality-gates
description: Use for linting, formatting, type checking, builds, tests, coverage, CI, migration verification, and Codex-safe test execution.
---

# Testing Quality Gates

Use this skill when the task involves:
- choosing or running tests
- measuring coverage
- fixing lint, format, type, or CI failures
- verifying migrations or database behavior
- deciding whether to run host, Docker, or CI-style checks

## Tooling Baseline

- Backend linter: `cd backend && ruff check app/`
- Backend format check: `cd backend && ruff format --check app/`
- Backend type checker: `cd backend && mypy app/ --ignore-missing-imports`
- Backend test runner: `cd backend && python3 -m pytest app/tests/ -q -p no:cacheprovider`
- Backend coverage: `cd backend && COVERAGE_FILE=.coverage.codex python3 -m pytest app/tests/ --cov=app --cov-report=term-missing -p no:cacheprovider`
- Migration status: `cd backend && alembic current`
- Migration apply: `cd backend && alembic upgrade head`
- Frontend lint: `cd frontend && npm run lint`
- Frontend type checker: `cd frontend && npm run type-check`
- Frontend tests: `cd frontend && npm test`
- Frontend coverage: `cd frontend && npm run test:coverage`
- Frontend build: `cd frontend && npm run build`

## Default Verification Order

1. Run the narrowest relevant test or checker for edited files.
2. Run lint/type checks for the affected package.
3. Run focused coverage when the user requests coverage or the change touches shared backend logic.
4. Run migration verification when schema/migration files changed.
5. Use the Docker Compose/Postgres environment for integration, migration, and PostgreSQL-specific behavior.

## Codex Python / PostgreSQL Rules

- Run pytest with module invocation and disabled cache metadata when running on the host:
  ```bash
  cd backend && python3 -m pytest app/tests/<scope> -q -p no:cacheprovider
  ```
- For coverage, keep the coverage file inside the repo or a known writable temp directory:
  ```bash
  cd backend && COVERAGE_FILE=.coverage.codex python3 -m pytest app/tests/<scope> --cov=app --cov-report=term-missing -p no:cacheprovider
  ```
- If coverage.py raises a file permission, SQLite data-file, or rename error while tests pass, report the pytest pass count separately and mark coverage as environment-blocked. Coverage.py uses a SQLite-backed data file even though the application database is PostgreSQL.
- Do not use SQLite for Alembic migrations, DDL parity, OP-number concurrency, PostgreSQL FTS/trigram, CITEXT, triggers, `ON CONFLICT`, or JSONB-like behavior.
- Use Docker/Postgres or the CI-style PostgreSQL service for migration and integration checks.

## Docker Compose Checks

The development compose file is `docker-compose.dev.yml` and the app service is `api`.

Readiness check:
```bash
docker compose -f docker-compose.dev.yml ps api
```

Start the API stack when needed:
```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d api
```

Run backend tests in the container when the stack is available:
```bash
docker compose -f docker-compose.dev.yml exec api python -m pytest app/tests/ -q -p no:cacheprovider
```

Run migrations in the container:
```bash
docker compose -f docker-compose.dev.yml exec api alembic upgrade head
```

## Failure Handling

- Rerun the specific failing test before the full suite.
- Treat SQLite disk I/O errors, temp-file locks, or pytest cache-provider failures as environment signals before rewriting application logic.
- For migration failures, fix the model or migration and rerun Alembic; do not edit the database manually.
- Report exact pass/fail counts, skipped tests, and coverage percentages when requested.
- If Docker is not running or `.env.dev` is missing, say the Docker-backed verification is blocked and run safe host checks where dependencies are installed.
