# /fix-error

Efficiently diagnose and fix a specific error without reading unrelated code.

## Argument
Paste the error/traceback after the command: `/fix-error <traceback>`

## Instructions

### Step 1 — Parse the traceback
Extract: exact file and line number, error type and message, any chained cause.

### Step 2 — Read only what's needed
- Use `Read` with `offset` and `limit` to read ±20 lines around the failing line.
- Use `LSP hover` on the failing symbol to check its type/signature.
- Use `LSP goto_definition` if the error is about a missing or mistyped attribute.

### Step 3 — Fix
Apply the minimal change. Do not refactor surrounding code.

### Step 4 — Verify
```bash
docker compose exec api pytest tests/ -x -q --tb=short -k "<failing_test_name>" 2>&1 | tail -30
```
For frontend errors:
```bash
cd frontend && npx tsc --noEmit --pretty false 2>&1 | head -30
```

### Step 5 — Report
One sentence: what was wrong and what was changed. File:line reference.

## Token rules
- Never read a file in full to find a bug — always use line-targeted `Read`.
- Never re-read a file you just edited.
- If the error is in a dependency, find the last frame that IS your code.
- For Python tracebacks, look for the last `File "backend/app/…"` frame.