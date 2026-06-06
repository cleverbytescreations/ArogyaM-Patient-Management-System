---
name: frontend-guidelines
description: Use for all work inside frontend/, including React, TypeScript, Radix UI, Tailwind CSS, TanStack Query, forms, mocks, API contracts, routing, and UI task execution.
---

# Frontend Guidelines

Use this skill when the task involves:
- React pages, components, routes, or feature folders
- API client functions, TanStack Query hooks, Axios interceptors, or typed response models
- Forms with React Hook Form and Zod
- Zustand auth/shared UI state
- MSW mocks, Vitest/RTL tests, or jest-axe accessibility checks
- RBAC route guards, permission hooks, and role-gated UI

## Scope Rules
- All frontend work must stay inside `frontend/`
- Do not create files outside `frontend/` unless adding root-level docs
- Use the existing module structure in `frontend/src/`

## Frontend Stack
- Framework: React 18 + Vite + TypeScript
- UI library: Radix UI primitives plus local wrappers in `frontend/src/components/ui/`
- Icons: lucide-react
- Styling: Tailwind CSS, `clsx`, `tailwind-merge`, `class-variance-authority`
- Data fetching: TanStack React Query v5
- State: Zustand for auth and lightweight shared UI state
- Forms: React Hook Form v7 with `@hookform/resolvers`
- Validation: Zod v3
- HTTP: Axios with JWT interceptor
- Routing: React Router DOM v6
- Toasts/dates: sonner, date-fns
- Mocks/demo: MSW v2 in tests
- i18n: none detected
- Tests: Vitest, React Testing Library, jest-axe, eslint-plugin-jsx-a11y

## Import Rules
- Use `@/` for imports from `frontend/src/`
- Avoid deep relative imports across module boundaries
- Import Radix primitives directly when building wrappers

## UI Design Rules
- Prefer Radix UI primitives for dialogs, dropdowns, selects, labels, switches, alert dialogs, separators, and avatars.
- Use Tailwind CSS for layout, spacing, typography, state styling, and responsive behavior.
- Use lucide-react icons where an icon improves button or status recognition.
- Search results must show minimal identifiers only; never show clinical details in search lists.
- Follow-up and document statuses use icon plus text; never rely on color alone.
- Mandatory fields must have visual and programmatic required signals.

## Component Rules
- Use PascalCase component files, such as `PatientSearchPage.tsx`.
- One component per file unless a small local helper is clearer.
- Keep shared UI in `frontend/src/components/` and feature-specific UI in `frontend/src/features/<domain>/`.
- Keep business rules out of presentation components; route through API functions and query hooks.

## Data Fetching Rules
- API calls go through typed functions in `frontend/src/api/` or feature API modules.
- Server state belongs in TanStack Query, not Zustand.
- Invalidate relevant query keys after mutations.
- Parse the backend error envelope and surface `request_id` where useful.
- Align request/response shapes with `Docs/API_SPECIFICATION_OPENAPI.md` and implementation plan tasks.

## Forms Rules
- Use React Hook Form with Zod resolvers for all nontrivial forms.
- Keep validation schemas explicit in feature `schemas.ts` or `frontend/src/lib/validation/`.
- Show field-level errors near fields and announce errors accessibly.
- Use confirmation dialogs for destructive or irreversible actions.

## State Rules
- Use Zustand only for auth identity/tokens/permissions and lightweight shared UI state.
- Clear auth and any patient-related UI state on logout/session timeout.
- Do not cache patient data beyond the session.

## Mock / Demo Mode Rules
When MSW is initialized in tests:
- Use handlers in `frontend/src/test/mocks/`
- Match real API paths and response envelope shapes
- Include realistic clinic fixture data
- Keep latency realistic enough to exercise loading states

## Source of Truth
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md` - UI task checklist
- `Docs/PHASE_1_API_TASK_CHECKLIST.md` - backend/API checklist
- `Docs/API_SPECIFICATION_OPENAPI.md` - API contract source of truth
- `Docs/PHASE1_IMPLEMENTATION_PLAN.md` - implementation context

## Directory Guidance
- pages/routes -> `frontend/src/routes/`
- reusable UI -> `frontend/src/components/`
- design-system wrappers -> `frontend/src/components/ui/`
- feature UI -> `frontend/src/features/<domain>/`
- API helpers -> `frontend/src/api/` or feature API files
- auth/permissions -> `frontend/src/auth/`
- shared types -> `frontend/src/types/`
- mocks -> `frontend/src/test/mocks/`
- validation -> `frontend/src/lib/validation/`

## When Generating Frontend Output
Prefer exact file paths, minimal production-usable code, typed props, reusable patterns aligned to current structure, and short placement explanations.

## Avoid
- MUI; this scaffold uses Radix UI plus Tailwind CSS.
- Direct `fetch()` calls when the Axios client is available.
- Storing server state in Zustand.
- Inline styles for ordinary layout or component states.
- Unlabeled controls, color-only status, or inaccessible dialogs.
- `any` TypeScript types unless a boundary genuinely requires it.
