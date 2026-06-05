# /session-end

Wrap up: verify work, update checklists, commit.

## Argument
Pass the stage number: `/session-end 3`

## Instructions

### 1. Verify lint is clean
```bash
cd backend && ruff check app/ -q && echo "ruff OK"
cd backend && mypy app/ --ignore-missing-imports && echo "mypy OK"
```

### 2. Run tests inside Docker
```bash
docker compose exec api pytest tests/ -x -q --tb=short 2>&1 | tail -20
```
Do not commit if tests are red.

### 3. Update checklists
Run `/update-checklist $STAGE` — mark all verified tasks `[x]` in both:
- `Docs/PHASE_1_API_TASK_CHECKLIST.md`
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md`

### 4. Commit
```bash
git status
git add backend/ frontend/ Docs/PHASE_1_API_TASK_CHECKLIST.md Docs/PHASE_1_UI_TASK_CHECKLIST.md
git commit -m "Stage $STAGE: <summary>"
```

### 5. Session summary (max 10 lines)
```
Stage N — <name>
Files added : <count> (<list>)
Files edited: <count> (<list>)
Tests       : <pass>/<total>
Checklist   : <X> tasks marked complete
Next session: Stage N+1 — <first task>
```