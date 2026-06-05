# /update-checklist

Verify and mark completed tasks in both API and UI checklists.

## Argument
Pass stage number: `/update-checklist 3`

## Instructions

1. Read only the relevant stage section from:
   - `Docs/PHASE_1_API_TASK_CHECKLIST.md`
   - `Docs/PHASE_1_UI_TASK_CHECKLIST.md`

2. For each backend task, verify completion using LSP:
   - ORM model: symbol exists in `backend/app/modules/<domain>/models.py`
   - Schema: class exists in `backend/app/modules/<domain>/schemas.py`
   - Repository: functions exist in `backend/app/modules/<domain>/repository.py`
   - Service: function exists in `backend/app/modules/<domain>/service.py`
     (confirm no raw `select()`/`insert()`/`update()`/`delete()` calls in service files)
   - Router: route exists in `backend/app/modules/<domain>/router.py`
   - Migration: revision file exists in `backend/app/migrations/versions/`

3. For each frontend task, verify:
   - API client function exists in `frontend/src/api/`
   - Component file exists in `frontend/src/features/<domain>/` or `frontend/src/components/`
   - Route is registered in `frontend/src/routes/`

4. Mark verified items `[x]`. Leave unverified items `[ ]`.

5. If all items in a stage section are `[x]`:
   - Change the section header to indicate completion (e.g., add `✅` prefix)
   - Add: `> **Stage N completed:** YYYY-MM-DD`

6. Save changes with a single `Edit` call per file.

## Token rule
Read only the stage section — never the full checklist.