# /impl-phase

Implement the next incomplete phase of ArogyaM PMS, following the project checklists exactly.

## Argument
Pass the stage number: `/impl-phase 3`
If no argument is given, detect the next incomplete stage from `Docs/PHASE_1_API_TASK_CHECKLIST.md` and `Docs/PHASE_1_UI_TASK_CHECKLIST.md`.

Stage map: 0 Foundations · 1 Auth & Access · 2 Master Data & OP Numbering · 3 Patient Core · 4 Visits & Clinical · 5 Documents & Timeline · 6 Follow-Ups · 7 Audit & Backup hardening · 8 Full-Scope.

## Instructions

### Step 1 - Scope
Read only the relevant stage sections from:
- `Docs/PHASE_1_API_TASK_CHECKLIST.md`
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md`

Use `AGENTS.md` and applicable `.agents/skills/*` files for architecture and coding rules. Do not re-read the full implementation plan unless the selected task explicitly requires it.

### Step 2 - Navigate with symbols first
- Use LSP definition/references for models, schemas, services, endpoints, and shared utilities.
- Use targeted file reads only for known sections.
- Avoid broad searches except for config strings, comments, TODOs, or non-symbol literals.

### Step 3 - Implementation order
Follow the discovered project structure. For backend feature stages, prefer:
1. Models/entities -> `backend/app/modules/<domain>/models.py`
2. Migration -> generate, review, apply under `backend/app/migrations/versions/`
3. Schemas/DTOs -> `backend/app/modules/<domain>/schemas.py`
4. Repository/data-access -> `backend/app/modules/<domain>/repository.py`
5. Service/business logic -> `backend/app/modules/<domain>/service.py`
6. Endpoint/controller/router -> `backend/app/modules/<domain>/router.py`
7. Router registration -> `backend/app/main.py`
8. Workers/tasks/jobs -> FastAPI background tasks only when the selected task needs them
9. Frontend API/types/hooks/components/routes under `frontend/src/` when in scope

### Step 4 - Quality gates
Run after meaningful edit groups:
```bash
cd backend && ruff check app/
cd backend && mypy app/ --ignore-missing-imports
cd frontend && npm run type-check
```

### Step 5 - Test
```bash
cd backend && python3 -m pytest app/tests/ -q -p no:cacheprovider
cd frontend && npm test
```

### Step 6 - Update checklist
Mark verified completed items `[x]` in the relevant checklist file. Leave uncertain items unchecked.

## Safety rules
- Do not re-read files you just edited.
- Batch related edits where safe.
- Stop before destructive database or filesystem operations.
