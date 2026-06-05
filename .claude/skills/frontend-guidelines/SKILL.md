---
name: frontend-guidelines
description: Use for all work inside frontend/, including React, TypeScript, Radix UI,
  Tailwind CSS, TanStack Query, forms, mocks, API contracts, routing, and UI tasks.
---

# Frontend Guidelines

Use this skill when the task involves:
- Creating or editing React pages, components, or features
- API client functions, Axios configuration, or typed response models
- TanStack Query hooks (queries, mutations, invalidation)
- Form creation with React Hook Form + Zod validation
- Zustand store design (auth state, role state)
- Route guards, permission hooks, or role-based UI gating
- MSW mock handler authoring
- Accessibility (WCAG 2.1 AA) improvements
- Vitest + React Testing Library test authoring
- Tailwind CSS layout or Radix UI component usage

## Scope Rules
- All frontend work must stay inside `frontend/`
- Do not create files outside `frontend/` unless adding root-level docs
- Use the existing module structure — do not create new top-level directories without discussion

## Frontend Stack
| Concern | Library |
|---------|---------|
| Framework | React 18 + Vite + TypeScript |
| UI primitives | Radix UI (`@radix-ui/*`) |
| Icons | lucide-react |
| Styling | Tailwind CSS + `clsx` + `tailwind-merge` + `class-variance-authority` |
| Data fetching | TanStack React Query v5 (`@tanstack/react-query`) |
| Global state | Zustand v4 |
| HTTP client | Axios with JWT interceptor (attach access token, auto-refresh on 401) |
| Forms | React Hook Form v7 + `@hookform/resolvers` |
| Validation | Zod v3 |
| Routing | React Router DOM v6 |
| Toasts | sonner |
| Dates | date-fns |
| Mocks | MSW v2 (`msw`) |
| Testing | Vitest + @testing-library/react + jest-axe |
| A11y lint | eslint-plugin-jsx-a11y |

## Import Rules
- Use `@/` path alias for all `src/` imports (e.g. `import { client } from "@/api/client"`)
- Avoid deep relative imports across module boundaries (e.g. `../../../features/patients`)
- Import Radix UI primitives directly: `import * as Dialog from "@radix-ui/react-dialog"`

## UI Design Rules
- Use **Radix UI primitives** for interactive elements: dialogs, dropdown menus, selects, labels,
  switches, alert dialogs, separators, avatars
- Use **Tailwind CSS** for layout, spacing, typography, and colour — not inline styles
- Interactive feedback: use **sonner** toasts for success/error notifications
- Medical data is never shown in search result lists — only minimal identifiers (OP number, name, mobile)
- Follow-up status: always use text + icon, never colour-as-only-signal (WCAG AA)
- Mandatory form fields must be clearly marked (asterisk + programmatic `required`)

## Component Rules
- PascalCase file names for components (e.g. `PatientSearchBar.tsx`)
- One component per file unless a tiny local helper is justified
- Keep components presentation-focused; no business logic or API calls in UI components
- Shared components live in `frontend/src/components/` and `frontend/src/components/ui/`
- Feature-specific components live in their feature folder (`frontend/src/features/<domain>/`)

## Data Fetching Rules
- All server state goes through **TanStack Query** (`useQuery`, `useMutation`)
- API call functions live in `frontend/src/api/` (typed with TypeScript interfaces)
- Use `queryClient.invalidateQueries` after mutations to keep data fresh
- Align request/response types with `Docs/API_SPECIFICATION_OPENAPI.md` and `Docs/PHASE1_IMPLEMENTATION_PLAN.md`
- Axios base URL from `import.meta.env.VITE_API_BASE_URL` — never hard-code

## Forms Rules
- Use **React Hook Form** with **Zod** resolvers for all forms
- Keep Zod validation schemas in a dedicated `schemas.ts` file within the feature folder
- Surface field-level validation errors directly beneath the input (not only on submit)
- Confirmation dialogs for destructive actions: use Radix UI `AlertDialog`

## State Rules
- Use **Zustand** for: auth state (user, tokens, roles, permissions), lightweight shared UI state
- Do NOT put server state in Zustand when TanStack Query already owns it
- Auth store lives in `frontend/src/auth/`; clear it fully on logout

## Mock / Demo Mode Rules
MSW v2 handlers live in `frontend/src/test/mocks/`.
When `VITE_MOCK=true` (or MSW is initialised in tests):
- Handlers must match the actual API contract shape (same URL, same response envelope)
- Include realistic latency (200–400 ms)
- Use realistic fixture data (no "foo"/"bar" placeholder strings in patient-facing data)
- All clinical and patient endpoints must be covered for E2E test isolation

## Accessibility (WCAG 2.1 AA)
- Use Radix UI primitives — they ship correct ARIA roles/attributes out of the box
- Every form input must have a programmatically associated `<label>` (via Radix UI Label or `htmlFor`)
- Error announcements must be in an `aria-live` region (RTL's `getByRole("alert")`)
- Colour is never the only signal (follow-up status, document status, badges: icon + text)
- Full keyboard navigation on all forms and dialogs (Tab, Enter, Escape)
- Run `jest-axe` on key screens in the component test suite

## Source of Truth
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md` — UI task checklist
- `Docs/PHASE_1_API_TASK_CHECKLIST.md` — Backend task checklist (API contracts)
- `Docs/API_SPECIFICATION_OPENAPI.md` — API contract source of truth
- `Docs/PHASE1_IMPLEMENTATION_PLAN.md` — implementation context

## Directory Guidance

| Concern | Location |
|---------|----------|
| API client + typed helpers | `frontend/src/api/` |
| Auth store + route guards + permission hooks | `frontend/src/auth/` |
| Shared reusable UI components | `frontend/src/components/` |
| Radix UI wrappers / design-system primitives | `frontend/src/components/ui/` |
| Feature modules (one folder per domain) | `frontend/src/features/` |
| Global state stores | `frontend/src/lib/` or co-located with feature |
| Zod validation schemas | `frontend/src/lib/validation/` |
| Route definitions + page-level guards | `frontend/src/routes/` |
| TypeScript shared types | `frontend/src/types/` |
| MSW handlers + fixtures | `frontend/src/test/mocks/` |

### Key shared components (place in `components/`)
- `DataTable.tsx` — paginated/sortable table with loading + empty states
- `ConfirmDialog.tsx` — Radix UI AlertDialog wrapper for destructive confirmations
- `PageLoader.tsx` — full-page skeleton/spinner
- `Nav.tsx` — main navigation bar (role-gated menu items)
- `AppShell.tsx` — layout wrapper (nav + main content area)

### Key pages / routes
| Route | Component | Location |
|-------|-----------|----------|
| `/login` | `LoginPage.tsx` | `features/auth/` |
| `/dashboard` | `DashboardPage.tsx` | `features/dashboard/` |
| `/patients` | `PatientSearchPage.tsx` | `features/patients/` |
| `/patients/new` | `PatientRegistrationPage.tsx` | `features/patients/` |
| `/patients/:id` | `PatientProfilePage.tsx` | `features/patients/` |
| `/follow-ups` | `FollowUpRegisterPage.tsx` | `features/followups/` |
| `/documents` | `DocumentsRegisterPage.tsx` | `features/documents/` |
| `/admin/users` | `UserManagementPage.tsx` | `features/users/` |
| `/admin/audit` | `AuditLogsPage.tsx` | `features/audit/` |
| `/admin/backup` | `BackupStatusPage.tsx` | `features/backup/` |

### Key feature components
| Component | Domain | Location |
|-----------|--------|----------|
| `PatientSearchBar.tsx` | patients | `features/patients/` |
| `VisitCard.tsx` | visits | `features/visits/` |
| `CaseSheetForm.tsx` | clinical | `features/clinical/` |
| `DocumentUploader.tsx` | documents | `features/documents/` |
| `FollowUpStatusBadge.tsx` | follow-ups | `features/followups/` |

## When generating frontend output
Prefer: exact file paths, minimal production-usable code, typed props,
reusable patterns aligned to the current directory structure, short placement explanation.

## Avoid
- Using MUI — the project uses Radix UI + Tailwind CSS exclusively
- Direct `fetch()` calls — use the Axios client from `@/api/client`
- Storing server state in Zustand — use TanStack Query
- Inline styles — use Tailwind classes
- Skipping `aria-label` or `htmlFor` on interactive elements
- Using `any` TypeScript type — prefer explicit interfaces or `unknown`