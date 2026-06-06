# /update-checklist

Verify and mark completed tasks in the checklists.

## Argument
Pass stage number: `/update-checklist 3`

## Instructions

1. Read only the relevant stage section from:
   - `Docs/PHASE_1_API_TASK_CHECKLIST.md`
   - `Docs/PHASE_1_UI_TASK_CHECKLIST.md`

2. For each unchecked backend task, verify completion through code evidence:
   - Models/entities exist in `backend/app/modules/<domain>/models.py`
   - Schemas/DTOs exist in `backend/app/modules/<domain>/schemas.py`
   - Repository/data-access functions exist in `backend/app/modules/<domain>/repository.py`
   - Services/functions exist in `backend/app/modules/<domain>/service.py`
   - Service files do not contain raw SQLAlchemy query construction such as `select()`, `insert()`, `update()`, `delete()`, joins, filters, ordering, or pagination
   - Endpoints/routes exist in `backend/app/modules/<domain>/router.py`
   - Migrations exist in `backend/app/migrations/versions/` when the task requires schema changes
   - Tests exist or pass when the task requires tests

3. For each unchecked frontend task, verify:
   - API/client functions exist in `frontend/src/api/` or the relevant feature API file
   - Components exist in `frontend/src/features/<domain>/` or `frontend/src/components/`
   - Routes are registered in `frontend/src/routes/` when the task requires a page route
   - Tests exist or pass when the task requires tests

4. Mark only verified items `[x]`; leave uncertain items unchecked.
5. If all tasks in a stage are complete, update the stage status using the checklist's existing format.
6. Update any overall progress table using the checklist's existing format.
7. Save related checklist edits together.

## Token rule
Read only the relevant checklist section unless the progress table must be updated.
