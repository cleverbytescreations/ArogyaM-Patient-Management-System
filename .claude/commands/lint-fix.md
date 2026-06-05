# /lint-fix

Run linter and type checker, then fix all issues found.

## Instructions

1. Auto-fix safe issues:
   ```bash
   cd backend && ruff check app/ --fix -q
   ```

2. Run type checker:
   ```bash
   cd backend && mypy app/ --ignore-missing-imports
   ```

3. Fix remaining errors manually:
   - Use LSP `hover` to check types before adding annotations
   - Do not suppress with `# type: ignore` or `# noqa` unless truly unavoidable

4. For frontend TypeScript errors:
   ```bash
   cd frontend && npx tsc --noEmit --pretty false 2>&1 | head -50
   ```

5. Confirm clean:
   ```bash
   cd backend && ruff check app/ -q && echo "ruff OK"
   cd backend && mypy app/ --ignore-missing-imports && echo "mypy OK"
   ```

6. Report: count fixed, any remaining issues with file:line.