# Dashboard Implementation Plan — ArogyaM PMS

**Status:** Proposed
**Author:** Engineering
**Last updated:** 2026-06-12
**Related:** `SYSTEM_ARCHITECTURE_DOCUMENT.md`, `API_SPECIFICATION_OPENAPI.md`,
`backend/app/core/permissions.py`, `frontend/src/routes/index.tsx`

---

## 1. Goal

Replace the static `DashboardPlaceholder` (currently in
[`frontend/src/routes/index.tsx`](../frontend/src/routes/index.tsx)) with a
**permission-driven dashboard shell** that renders a role-appropriate set of
widgets for each of the four roles:

| Role | DB code | Permissions (source: `permissions.py`) |
|------|---------|----------------------------------------|
| Administrator | `ADMIN` | all 15 |
| Doctor | `DOCTOR` | view_patient, view_medical_history, add_consultation, add_prescription, manage_followups, export, view_reports |
| Receptionist | `RECEPTION` | create_patient, view_patient, edit_patient, manage_followups, request_merge |
| Data Entry Staff | `DATA_ENTRY` | create_patient, view_patient, edit_patient, manage_followups, request_merge |

### Design principle
The dashboard is a **permission-driven shell, not four hand-built pages**. Build one
`<Dashboard>` that composes widgets, each guarded by a permission check. A role simply
sees the subset of widgets its permissions unlock. This keeps you honest with the
deny-by-default rule and means adding a permission to a role automatically lights up
its widget.

---

### 1. Administrator (ADMIN — all 15 permissions)
The oversight cockpit. Admin does little clinical data entry; the dashboard is about
system health, governance, and people.

- **Top KPI row:** patients registered today / this week, active users online, pending
  merge requests, last backup status + age.
- **Audit trail panel** (`view_audit`): live feed of recent sensitive actions (logins,
  profile views, exports, merges) with a "View full audit" link. This is the marquee
  admin widget.
- **User management card** (`manage_users`): count of active/locked accounts, "Add
  user", recent role changes.
- **Backup & system health** (`backup_control`): last backup time, success/fail, "Run
  backup now", storage usage.
- **Master data** (`manage_master_data`): quick links to manage categories, OP-sequence
  config, departments.
- **Merge queue** (`merge_records`): pending merge requests awaiting approval — admin is
  the approver.
- **Reports** (`view_reports` / `export`): registration trends, visit volume, export
  buttons.
- **Hide:** nothing structurally, but keep clinical entry actions secondary — admin
  isn't the consultation author.

---

### 2. Doctor (DOCTOR)
A clinical worklist. Doctors view patients and author consultations/prescriptions; they
have no create/edit-patient, user, backup, or audit access.

- **My patient queue / today's visits** (`view_patient` + visits): patients checked in
  and waiting, ordered by arrival. This is the primary widget — the doctor's working
  list.
- **Quick patient search** (`view_patient`): jump to any record by OP number / name /
  mobile.
- **Pending consultations:** visits registered but not yet consulted → deep-link
  straight into the consultation form (`add_consultation`, `add_prescription`).
- **Follow-ups due** (`manage_followups`): patients with follow-up visits due
  today/this week.
- **Reports** (`view_reports`): personal/clinic consultation counts; Export (`export`)
  for discharge summaries.
- On opening a patient: full medical history timeline (`view_medical_history`).
- **Hide:** register-patient button, user mgmt, backup, audit, master data, merge
  approval (doctor can't request or approve merges per the matrix).

---

### 3. Receptionist (RECEPTION)
The front-desk intake console. Permissions: `create_patient`, `view_patient`,
`edit_patient`, `manage_followups`, `request_merge`.

- **Big primary CTA: "Register New Patient"** (`create_patient`) — front and center,
  this is the role's main job.
- **Today's registrations / live OP queue:** patients registered today with their
  generated OP numbers and visit status.
- **Patient search + quick edit** (`view_patient`, `edit_patient`): correct
  demographics, contact details.
- **Follow-up scheduling** (`manage_followups`): today's expected follow-ups, register
  a follow-up visit. (`RegisterFollowUpVisitDialog.tsx` in active development — surface
  it here.)
- **Possible duplicates → "Request merge"** (`request_merge`): flags likely duplicate
  registrations; reception requests, admin approves.
- **Hide:** all clinical content (no `view_medical_history`, `add_consultation` — they
  see the patient record but not clinical detail), users, backup, audit, reports,
  master data.

---

### 4. Data Entry Staff (DATA_ENTRY)
> ⚠️ **Important:** Data Entry has an identical permission set to Reception
> (`create_patient`, `view_patient`, `edit_patient`, `manage_followups`,
> `request_merge`). By RBAC they can see the same widgets. Differentiate by **workflow
> emphasis and layout**, not by locking things down — otherwise the two dashboards are
> technically the same page.

- **Bulk / backlog entry focus:** lead with a "Register Patient" form optimised for
  fast keyboard entry and a "Records pending completion" worklist (registrations missing
  fields) rather than a live front-desk queue.
- **Data quality widget:** incomplete-profile count, "Request merge" for duplicates
  spotted during entry.
- **Recently entered by me:** lets them review/correct their own entries (`edit_patient`).
- **De-emphasize** the real-time today's-arrivals queue (that's reception's live view);
  emphasize batch correctness.
- **Recommendation:** since the permission sets are identical, consider whether
  `DATA_ENTRY` should keep `manage_followups`/`request_merge` or whether Reception
  should have something extra. Right now any "difference" lives only in the UI, which is
  cosmetic and bypassable. If the business intends them to differ, the permission matrix
  must reflect it. **Decision needed before Phase 2** (see §9).

---

### Shared shell (all roles)
Every authenticated user gets the same outer shell (`AppShell`, nav, header). The
dashboard itself renders only the widgets whose `permission` check passes for that
user's effective permission set — no role-switch logic in the shell, no duplicated
page components.

### ⚠️ Known constraint — RECEPTION and DATA_ENTRY are identical at the RBAC layer
The two roles share an identical permission set in
[`permissions.py:73-90`](../backend/app/core/permissions.py#L73-L90). Any
difference between their dashboards is **cosmetic layout only** and is bypassable
— it is NOT a security boundary. This plan differentiates them by widget *emphasis*
(reception = live front-desk queue; data entry = backlog/quality worklist) but
flags that if the business needs a real distinction, the permission matrix must
change first. **Decision needed before Phase 2** (see §9).

---

## 2. Architecture Overview

```
GET /dashboard/summary                 ← single aggregated endpoint, role-filtered
        │
        ▼
useDashboardSummary()  (TanStack Query)
        │
        ▼
<Dashboard>                            ← composes widgets from a registry
        │
        ├── widgetRegistry[]           ← {key, permission, component, span}
        ▼
<WidgetGuard permission=...>           ← renders widget only if hasPermission()
        └── <KpiCard> / <AuditFeedWidget> / <TodaysQueueWidget> / ...
```

### Why one aggregated endpoint (`/dashboard/summary`) instead of N calls
- One round-trip → fast first paint; dashboard is the landing page.
- The **backend returns only the sections the caller is permitted to see** — a
  receptionist's response never contains audit or backup data, so nothing
  sensitive reaches a client that shouldn't have it (defense in depth on top of
  the per-widget API calls).
- Heavy/real-time widgets (audit feed, live queue) may still call their existing
  module endpoints directly for polling; `/dashboard/summary` provides the
  initial KPI snapshot.

---

## 3. Backend Tasks

> New module: `backend/app/modules/dashboard/`
> Follows the standard seam: `router.py → service.py → repository.py`. No SQL
> outside the repository; service owns the transaction boundary (read-only here,
> so no commit). Every counted action that is itself sensitive is already audited
> at its own endpoint — the summary is read-only and is NOT individually audited
> beyond normal request logging (no PII in the payload; counts only).

### BE-DASH.1 — Module scaffold
- [ ] Create `dashboard/{__init__.py,router.py,service.py,repository.py,schemas.py}`.
- [ ] Register router in the app router aggregator with prefix `/dashboard`.

### BE-DASH.2 — Summary schema (`schemas.py`)
- [ ] `DashboardSummary` Pydantic v2 model, all sections `Optional`, populated
      per-permission. Counts only — **no patient-identifying fields**.
- [ ] Sub-sections:
  - `registrations`: `{today, this_week}`
  - `visits`: `{waiting_today, consulted_today}`
  - `followups`: `{due_today, overdue}`
  - `merge_requests`: `{pending}`
  - `users`: `{active, locked}` (admin only)
  - `backup`: `{last_run_at, last_status, age_hours}` (admin only)
  - `audit_recent`: `list[AuditEntrySummary]` (admin only, last 10, no PHI)

### BE-DASH.3 — Repository (read-only aggregation queries)
- [ ] `count_registrations(db, since)` — patients created today / this week.
- [ ] `count_visits_by_status(db, on_date)` — waiting vs consulted today.
- [ ] `count_followups_due(db, as_of)` — due today / overdue. Reuse followups repo
      query helpers where they exist rather than duplicating SQL.
- [ ] `count_pending_merge_requests(db)`.
- [ ] `count_users_by_status(db)` (admin).
- [ ] `latest_backup(db)` (admin) — reuse backup module repo if available.
- [ ] `recent_audit(db, limit=10)` (admin) — reuse audit module repo.
- [ ] All queries indexed-friendly (filter on `created_at`/date columns); confirm
      supporting indexes exist, add migration if a new one is needed.

### BE-DASH.4 — Service (permission-filtered assembly)
- [ ] `get_summary(db, current_user) -> DashboardSummary`.
- [ ] Resolve caller permissions via existing `resolve_permissions` / the
      `current_user` permission set; populate a section **only if** the caller
      holds the gating permission:
  - `registrations` ← `view_patient`
  - `visits` ← `view_patient`
  - `followups` ← `manage_followups`
  - `merge_requests` ← `merge_records` (pending-approval count; admins)
  - `users` ← `manage_users`
  - `backup` ← `backup_control`
  - `audit_recent` ← `view_audit`
- [ ] Never query a section the caller can't see (saves work + avoids leakage).

### BE-DASH.5 — Router
- [ ] `GET /dashboard/summary` with `Depends(get_db)` + `require_permission` —
      gate on the lowest common permission (`view_patient`) so all four roles can
      hit it; finer gating happens inside the service per section.
- [ ] `db: Session = Depends(get_db)` injected → passed to service → service to
      repo, per the project session-flow rule.

### BE-DASH.6 — Tests (`backend/app/tests/`)
- [ ] `test_dashboard_summary_admin` — all sections present.
- [ ] `test_dashboard_summary_doctor` — visits/followups/registrations present;
      `users`/`backup`/`audit_recent` **absent**.
- [ ] `test_dashboard_summary_reception` — registrations/visits/followups present;
      admin sections absent.
- [ ] `test_dashboard_summary_unauthenticated_401`.
- [ ] Assert payload contains **no PII** (counts/ids/timestamps only).
- [ ] Run: `docker compose exec api pytest tests/test_dashboard*.py -x -q --tb=short`.

### BE-DASH.7 — OpenAPI
- [ ] Add `/dashboard/summary` to `Docs/API_SPECIFICATION_OPENAPI.md`.

---

## 4. Frontend Tasks

> New feature dir: `frontend/src/features/dashboard/`
> Conventions to follow (already in the repo): API module in `src/api/`, typed
> via `src/types/`, data fetched with TanStack Query v5, permission checks via
> `usePermissions()` and `PERMISSIONS` from `@/lib/constants`.

### FE-DASH.1 — API + types
- [ ] `frontend/src/types/dashboard.ts` — mirror `DashboardSummary` (all sections
      optional).
- [ ] `frontend/src/api/dashboardApi.ts` — `dashboardApi.getSummary()` following
      the existing `followupsApi` pattern (`apiClient.get(...).then(r => r.data)`).

### FE-DASH.2 — Query hook
- [ ] `features/dashboard/useDashboardSummary.ts` — `useQuery({ queryKey:
      ['dashboard','summary'], queryFn: dashboardApi.getSummary })`.
- [ ] Reasonable `staleTime` (e.g. 60s, matching the app default in `App.tsx`);
      real-time widgets can set shorter `refetchInterval`.

### FE-DASH.3 — Widget guard + registry
- [ ] `features/dashboard/WidgetGuard.tsx` — thin wrapper: `usePermissions()`,
      render `children` only if `hasPermission(permission)`; render nothing
      otherwise (unlike route-level `RequirePermission`, no redirect).
- [ ] `features/dashboard/widgetRegistry.ts` — ordered array of
      `{ key, permission, span, Component }`. The `Dashboard` maps over it.

### FE-DASH.4 — Shared presentational widgets
- [ ] `KpiCard` — label, value, optional trend/icon (Radix + Tailwind, reuse
      `components/ui`).
- [ ] `WidgetCard` — consistent card frame (title, body, optional action link).
- [ ] Loading skeletons + empty/error states for each widget (use existing
      `PageLoader`/skeleton patterns).

### FE-DASH.5 — Role/feature widgets (each guarded)
| Widget | Permission | Primary content | Deep-link |
|--------|-----------|-----------------|-----------|
| `RegistrationsKpi` | `view_patient` | today / this-week counts | `/patients/search` |
| `TodaysQueueWidget` | `view_patient` | waiting / consulted today | `/patients/search` |
| `RegisterPatientCta` | `create_patient` | big primary CTA | `/patients/new` |
| `FollowupsDueWidget` | `manage_followups` | due today / overdue | `/follow-ups` |
| `PendingMergeWidget` | `merge_records` | pending merge queue | merge view |
| `RequestMergeHint` | `request_merge` | suspected duplicates → request | — |
| `UsersWidget` | `manage_users` | active / locked, add user | `/users` |
| `BackupWidget` | `backup_control` | last backup, run now | `/backup` |
| `AuditFeedWidget` | `view_audit` | last 10 sensitive actions | `/audit-logs` |
| `ReportsWidget` | `view_reports` | trend snapshot, export | reports |

### FE-DASH.6 — Dashboard container + role layout
- [ ] `features/dashboard/DashboardPage.tsx` — renders `widgetRegistry` through
      `WidgetGuard`; responsive grid (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`).
- [ ] **Role emphasis** via ordering, not hiding (RBAC already hides):
  - Admin → audit feed, users, backup, merge queue lead.
  - Doctor → today's queue + pending consultations + followups lead.
  - Reception → `RegisterPatientCta` first, live today's queue second.
  - Data Entry → registration form + "records pending completion" worklist;
    de-emphasize the live arrivals queue.
- [ ] Implement role ordering with a small `orderForRole(roles)` helper keyed off
      `usePermissions().roles`; default order for any unmatched role.

### FE-DASH.7 — Wire into routing
- [ ] Replace `DashboardPlaceholder` in
      [`routes/index.tsx`](../frontend/src/routes/index.tsx) with a lazy-loaded
      `DashboardPage` at path `/` (keep it inside `RequireAuth` + `AppShell`).
- [ ] No route-level `RequirePermission` on `/` — guarding is per-widget so every
      authenticated user gets a (possibly minimal) dashboard.

### FE-DASH.8 — Nav consistency
- [ ] Confirm `components/Nav.tsx` already gates links by permission; ensure the
      dashboard/home link is always present for authenticated users.

---

## 5. MSW Mocks (`frontend/src/test/mocks/`)
- [ ] Add a handler for `GET /dashboard/summary` returning a fixture that varies
      by a configurable role, so Storybook/tests can render each role's dashboard.
- [ ] Fixtures: `adminSummary`, `doctorSummary`, `receptionSummary`,
      `dataEntrySummary` (admin sections absent in non-admin fixtures).

## 6. Frontend Tests (Vitest + RTL)
- [ ] `WidgetGuard` renders/omits children by permission.
- [ ] `DashboardPage` for each role: asserts the correct widget set is present
      and admin-only widgets are absent for non-admins (drive via mocked
      `usePermissions`/AuthContext + MSW fixture).
- [ ] Loading and error states render without crashing.
- [ ] Deep-link CTAs navigate to expected routes.

## 7. Accessibility & UX
- [ ] Each widget card has a heading (`h2`/`h3`) for screen-reader landmarks.
- [ ] KPI numbers have descriptive `aria-label`s ("12 patients registered today").
- [ ] Keyboard-reachable CTAs; visible focus rings (Tailwind focus styles).
- [ ] No layout shift between skeleton and loaded state (reserve card height).

---

## 8. Sequenced Task List (execution order)

**Phase 1 — Backend data (no UI risk)**
1. BE-DASH.1 scaffold
2. BE-DASH.2 schema
3. BE-DASH.3 repository
4. BE-DASH.4 service (permission filtering)
5. BE-DASH.5 router
6. BE-DASH.6 tests → green in Docker
7. BE-DASH.7 OpenAPI

**Phase 2 — Frontend shell**
8. FE-DASH.1 api + types
9. FE-DASH.2 query hook
10. FE-DASH.3 guard + registry
11. FE-DASH.4 shared widgets
12. MSW mocks (§5)

**Phase 3 — Widgets + assembly**
13. FE-DASH.5 feature widgets (incrementally, each guarded)
14. FE-DASH.6 container + role ordering
15. FE-DASH.7 routing swap
16. FE-DASH.8 nav check

**Phase 4 — Quality**
17. FE-DASH frontend tests (§6)
18. A11y pass (§7)
19. `lint-fix` + typecheck (ruff/mypy backend, eslint/tsc frontend)

---

## 9. Open Decisions (resolve before building)
1. **RECEPTION vs DATA_ENTRY** — keep them cosmetically different, or change the
   permission matrix so the distinction is real? (Affects §3/§4 only at the
   ordering layer; no rework if decided early.)
2. **Pending-merge count gating** — gate on `merge_records` (approver/admin view)
   vs also showing `request_merge` holders a "my requested merges" count?
3. **Reports widget scope** — does Phase 1 have any reports/aggregate endpoint to
   back `ReportsWidget`, or should it link out as a stub for now?
4. **Real-time vs snapshot** — is polling (e.g. 30–60s `refetchInterval`) on the
   live queue acceptable for v1, or is the one-shot summary enough?

---

## 10. Out of Scope (this iteration)
- Per-user dashboard customization / widget drag-reorder.
- Charts/timeseries beyond simple KPI counts (defer to a reports module).
- WebSocket/SSE live updates (polling only for now).
- Mobile-native layout beyond responsive grid.

---

## 11. Security & Compliance Checklist
- [ ] `/dashboard/summary` payload contains **no PII/PHI** — counts, ids,
      timestamps, statuses only (CLAUDE.md logging rule).
- [ ] Section population is server-enforced by permission; client gating is UX
      only.
- [ ] Endpoint behind auth; gated with `require_permission`.
- [ ] No new SQL outside the repository; no business logic in the router.
- [ ] Frontend never hard-codes the role→permission matrix; reads effective
      permissions from `/me/permissions` via `AuthContext`/`usePermissions`.
