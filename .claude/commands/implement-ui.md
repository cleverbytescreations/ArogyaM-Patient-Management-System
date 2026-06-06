---
description: Implement (or review) frontend UI tasks from the Phase 1 UI task checklist
argument-hint: <TASK-IDS comma-separated, e.g. UI-T3.1, UI-T5.1, UI-TF.6>
---

# /implement-ui

>>> UI implementation tasks (Lite - React)

Files to refer (if required - lazy loading):
---------------
1. Docs/PHASE1_IMPLEMENTATION_PLAN.md
2. Docs/API_SPECIFICATION_OPENAPI.md
3. Docs/PHASE_1_UI_TASK_CHECKLIST.md
4. Docs/PHASE_1_SPRINT_PLAN.md
5. docker-compose.dev.yml

Objective:
----------
Implement the following UI task from the checklist: If any task is already implemented, please review the changes are in alignment with the scope.

$ARGUMENTS

Instructions:
-------------
1. Review only the sections relevant to the selected UI task, architecture, routing, API integration, RBAC, and UI conventions.
2. Follow the existing React UI architecture, folder structure, coding standards, and design patterns.
3. Use the approved UI stack where applicable:
   React + TypeScript, Vite, React Router, TanStack Query, Zustand, Axios, Tailwind CSS, Shadcn/UI, React Hook Form, Zod, XState, Recharts, SSE/EventSource.
4. Add or update all required UI files:
   pages, components, hooks, API services, query hooks, stores, types, validation schemas, routes, RBAC guards, and tests.
5. Use the existing Axios API client and TanStack Query for all API calls.
   - Do not duplicate API client logic.
   - Use typed request/response models.
   - Invalidate relevant query keys after mutations.
   - Do not refactor, reformat, or rewrite unrelated files.
   - Prefer minimal, focused changes required to complete the task.
6. Implement proper UI states:
   loading, empty, error, success toast, validation errors, mutation loading, and confirmation dialog for destructive actions.
7. Apply RBAC:
   - Protect routes where required.
   - Hide or disable unauthorized actions.
8. Forms must use React Hook Form + Zod validation.
9. Ensure responsive UI, dark/light mode support, keyboard accessibility, labels, aria attributes, and focus handling.
10. Add or update tests using Vitest + React Testing Library/MSW.
    Cover happy path, validation, loading, empty, error, mutation, and RBAC behavior where relevant.
11. Run and show final successful output:
    - npm run type-check
    - npm run lint
    - npm run test
    - npm run build
12. Fix any failures and re-run the failed command.
13. Mark the completed tasks [x] in the UI task checklist, after all changes & testing are completed successfully.

Important:
----------
Do not mark a task as complete unless implementation, tests, type-check, lint, and build are successful.

Expected Output:
----------------
1. Summary of changes
2. Files created/modified
3. API endpoints integrated
4. Tests added/updated
5. Command outputs
6. Checklist items marked complete
7. Assumptions or pending backend dependencies
