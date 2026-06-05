# /impl-phase

Implement the next incomplete stage of ArogyaM PMS, following the plan exactly.

## Argument
Pass the stage number: `/impl-phase 3`
If no argument given, detect the next incomplete stage from the checklist.

## Instructions

### Step 1 — Scope
Read only the relevant stage section from:
- `Docs/PHASE_1_API_TASK_CHECKLIST.md` (backend tasks)
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md` (frontend tasks)

Stage numbers follow `Docs/PHASE1_IMPLEMENTATION_PLAN.md §14`:
0 Foundations · 1 Auth & Access · 2 Master Data & OP Numbering · 3 Patient Core ·
4 Visits & Clinical · 5 Documents & Timeline · 6 Follow-Ups ·
7 Audit & Backup hardening · 8 Full-Scope (R2)

Do NOT re-read the full implementation plan — all architecture context is in `CLAUDE.md`.

### Step 2 — Navigate with LSP, not file search
- Use `LSP goto_definition` to find base classes, imported symbols.
- Use `LSP find_references` before modifying shared utilities.
- Use `LSP hover` to check types and signatures.
- Use `Read` with `offset`+`limit` only for a known file section.

### Step 3 — Implementation order (always follow this sequence)
1. ORM model → `backend/app/modules/<domain>/models.py`
2. Alembic migration: generate → review → apply (inside Docker)
3. Pydantic schemas → `backend/app/modules/<domain>/schemas.py`
4. Repository → `backend/app/modules/<domain>/repository.py` (all queries here; no raw queries in service)
5. Service → `backend/app/modules/<domain>/service.py` (calls repository; owns `db.commit()` and audit writes)
6. Router → `backend/app/modules/<domain>/router.py` (inject `db: Session = Depends(get_db)`; pass to service)
7. Register router in `backend/app/main.py` if new
8. Frontend: API client → query hook → component → route (if in scope)

### Step 4 — Quality gates (run after each file)
```bash
cd backend && ruff check app/ -q
cd backend && mypy app/ --ignore-missing-imports
```

### Step 5 — Tests (run inside Docker)
```bash
docker compose exec api pytest tests/ -x -q --tb=short 2>&1 | tail -30
```

### Step 6 — Update checklist
Mark completed items `[x]` in both checklist files.

## Token-saving rules
- Do not re-read files you just wrote.
- Do not read the full implementation plan — use `CLAUDE.md` and the skill docs.
- Batch related edits in one `Edit` call where possible.
- Stop and confirm before any destructive DB operations or schema changes.