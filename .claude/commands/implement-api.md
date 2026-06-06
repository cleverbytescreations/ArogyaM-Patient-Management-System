---
description: Implement (or validate) backend API tasks from the Phase 1 task list
argument-hint: <TASK-IDS comma-separated, e.g. SEC-T1.1, SEC-T0.1–SEC-T0.3>
---

# /implement-api

>>=> API Task implementation

Files to refer (if required - lazy loading):
---------------
1. Docs/PHASE1_IMPLEMENTATION_PLAN.md
2. Docs/DDL_DATAMODEL.sql
3. Docs/PHASE_1_API_TASK_CHECKLIST.md
4. Docs/PHASE_1_SPRINT_PLAN.md
5. docker-compose.dev.yml

Objective:
----------
Implement the following task from the task list. If any task is already implemented, please validate the feature:

$ARGUMENTS

Instructions:
-------------
1. Review the referenced files before implementation.
2. Follow the existing project architecture and coding standards.
3. Add or update required backend, frontend, API, database, validation, security, logging, and test files as needed.
4. When creating a new Alembic migration, set down_revision to the current single head by running `alembic heads` first and chaining to it — never hardcode a revision without verifying it is the actual head.
5. When creating a new Alembic migration, make sure that these migrations will be executed during docker startup.
6. Create related test cases to cover the new feature changes. Show me the test execution output.
7. Mark the completed tasks [x] after all changes & testing are completed successfully.
