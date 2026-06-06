# /fix-error

Efficiently diagnose and fix a specific error without reading unrelated code.

## Argument
Paste the error/traceback after the command: `/fix-error <traceback>`

## Instructions

### Step 1 - Parse the error
Extract the exact file and line number, error type and message, failing symbol, and any chained cause.

### Step 2 - Read only what is needed
- Read only a small window around the failing line.
- Use LSP hover/type info on the failing symbol when available.
- Use LSP definition/references only when the error depends on a declaration or shared utility.
- If the error is in a dependency, find the last stack frame that belongs to this project.

### Step 3 - Fix
Apply the minimal safe change. Do not refactor surrounding code unless the root cause requires it.

### Step 4 - Verify
Run the narrowest relevant test or checker:
```bash
cd backend && python3 -m pytest app/tests/<specific_test_or_file> -q -p no:cacheprovider
```

For frontend errors:
```bash
cd frontend && npm run type-check
```

### Step 5 - Report
State what was wrong, what changed, and the file:line reference.
