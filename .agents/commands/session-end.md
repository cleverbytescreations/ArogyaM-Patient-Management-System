# /session-end

Wrap up the session: verify work, update checklist, and prepare a commit if requested.

## Argument
Optional stage number: `/session-end 3`

## Instructions

1. Check status:
   ```bash
   git status
   ```

2. Verify backend lint/type checks:
   ```bash
   cd backend && ruff check app/
   cd backend && mypy app/ --ignore-missing-imports
   ```

3. Verify frontend checks when frontend files changed:
   ```bash
   cd frontend && npm run lint
   cd frontend && npm run type-check
   ```

4. Run tests:
   ```bash
   cd backend && python3 -m pytest app/tests/ -q -p no:cacheprovider
   cd frontend && npm test
   ```
   Do not commit if required tests are red.

5. Update checklist:
   Run `/update-checklist <stage>` when a stage number is known.

6. If the user asked to commit, stage only relevant project files:
   ```bash
   git add backend frontend Docs/PHASE_1_API_TASK_CHECKLIST.md Docs/PHASE_1_UI_TASK_CHECKLIST.md AGENTS.md .agents .gitignore
   git commit -m "Stage <N>: <summary>"
   ```

7. Session summary:
   - Files changed
   - Checks run and result
   - Checklist updates
   - Remaining risks or next task
