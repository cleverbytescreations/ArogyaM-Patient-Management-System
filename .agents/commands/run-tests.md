# /run-tests

Run the ArogyaM PMS test suite and report results.

## Argument
Optional: `/run-tests backend` | `/run-tests frontend` | `/run-tests all` | `/run-tests <specific path>`

## Instructions

1. Prefer Docker Compose for backend integration, migration, and PostgreSQL-specific behavior. Check the API service first:
   ```bash
   docker compose -f docker-compose.dev.yml ps api
   ```

2. If the API stack is not running and `.env.dev` exists, start it:
   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.dev up -d api
   ```

3. Run backend tests in the container when available:
   ```bash
   docker compose -f docker-compose.dev.yml exec api python -m pytest app/tests/ -q -p no:cacheprovider
   ```

4. If Docker is unavailable but backend dependencies are installed on the host, use:
   ```bash
   cd backend && python -m pytest app/tests/ -q -p no:cacheprovider
   ```

5. Scoped backend variants:
   ```bash
   cd backend && python -m pytest app/tests/<file>.py -q -p no:cacheprovider
   cd backend && python -m pytest app/tests/<file>.py::<test_name> -q -p no:cacheprovider
   ```

6. Coverage, when requested:
   ```bash
   cd backend && COVERAGE_FILE=.coverage.codex python -m pytest app/tests/ --cov=app --cov-report=term-missing -p no:cacheprovider
   ```

7. Frontend checks:
   ```bash
   cd frontend && npm run type-check
   cd frontend && npm test
   ```

8. If tests fail:
   - Rerun the specific failing test in the same execution mode before rerunning the suite.
   - Read only the failing test and the module it targets.
   - Do not replace PostgreSQL migration, FTS/trigram, CITEXT, trigger, or OP-concurrency checks with SQLite.

9. Report pass/fail count, skipped tests, coverage if run, and the next specific file:line if red.
