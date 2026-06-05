# /run-tests

Run the ArogyaM test suite and report results.

## Argument
Optional: `/run-tests unit` | `/run-tests integration` | `/run-tests all`
Default: full suite.

## Instructions

> All tests run **inside Docker** via `docker compose exec api`. Never run pytest
> directly on the host — the host has no app Python environment.

1. Verify the api container is running:
   ```bash
   docker compose -f docker-compose.dev.yml ps api
   ```
   If it shows anything other than `Up`, run first:
   ```bash
   docker compose -f docker-compose.dev.yml up -d api
   ```

2. Run the full suite with short tracebacks:
   ```bash
   docker compose exec api pytest tests/ -x -q --tb=short 2>&1 | tail -60
   ```

   Scoped variants:
   ```bash
   # A single test file
   docker compose exec api pytest tests/<file>.py -x -q --tb=short 2>&1 | tail -40

   # A single test
   docker compose exec api pytest tests/<file>.py::<TestClass>::<test_name> -x -v 2>&1 | tail -40

   # Skip integration tests (no live DB required)
   docker compose exec api pytest tests/ -x -q --tb=short -k "not integration" 2>&1 | tail -40
   ```

3. For frontend tests:
   ```bash
   cd frontend && npm test 2>&1 | tail -40
   ```

4. If tests fail:
   - Read only the failing test file and the service/module it targets.
   - Fix the root cause — do not mock away real failures.
   - Re-run the specific failing test to confirm the fix before re-running the suite.

5. Report: pass/fail count, any skipped tests and why, next step if red (specific file:line).