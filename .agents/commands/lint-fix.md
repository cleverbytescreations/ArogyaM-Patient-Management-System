# /lint-fix

Run linting and type checks, then fix all issues found.

## Instructions

1. Auto-fix safe backend lint issues:
   ```bash
   cd backend && ruff check app/ --fix
   ```

2. Run backend type checker:
   ```bash
   cd backend && mypy app/ --ignore-missing-imports
   ```

3. Run frontend checks:
   ```bash
   cd frontend && npm run lint
   cd frontend && npm run type-check
   ```

4. Fix remaining issues manually:
   - Use LSP hover/type info before adding annotations or changing signatures.
   - Prefer the project's established patterns over broad rewrites.
   - Do not suppress warnings with ignore comments unless there is a documented reason.

5. Confirm clean:
   ```bash
   cd backend && ruff check app/
   cd backend && mypy app/ --ignore-missing-imports
   cd frontend && npm run lint
   cd frontend && npm run type-check
   ```

6. Report the count fixed and any remaining issue with file:line.
