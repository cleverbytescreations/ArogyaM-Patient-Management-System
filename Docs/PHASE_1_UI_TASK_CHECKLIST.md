# Phase 1 — UI / Frontend Developer Task Checklist

**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Scope source:** `Docs/SYSTEM_ARCHITECTURE_DOCUMENT.md` (SAD v1.0) · `Docs/PHASE1_IMPLEMENTATION_PLAN.md` · `Docs/API_SPECIFICATION_OPENAPI.md`
**Companion:** Backend/API/DB/security/testing tasks are in `Docs/PHASE_1_API_TASK_CHECKLIST.md`
**Date:** 2026-06-04
**Status:** For build

> **How to read this checklist**
> - All UI/frontend work lives here; everything else lives in the API checklist.
> - Tasks are grouped under **Module** headings (numbering follows Plan §3 / SAD §7), within the single required `## 1. Frontend Tasks` section.
> - Task ID pattern: `UI-T<module>.<seq>`. Foundation tasks use `UI-TF.x`.
> - Effort tags: **[S]** ≤0.5 day · **[M]** ~1–2 days · **[L]** ~3+ days. Tier: **(MVP)** R1 · **(R2)** Full-Scope.
> - All tasks unchecked `[ ]` by default. **No code is to be written in this planning step.**
> - **Stack (Plan §5.1):** Vite + React + TypeScript + MUI; axios client with JWT interceptor; zod validation; route guards + `usePermissions()`.
> - **Cross-cutting UX rules (Plan §5.3):** mandatory fields clearly marked; clinical forms mirror paper case sheets; **no medical detail in search result lists**; 409 conflict shows a reload prompt; no patient data cached beyond session.
> - **Accessibility baseline (Plan §5.4, SAD §21):** WCAG 2.1 AA — accessible MUI semantics/ARIA, full keyboard nav + visible focus, labels associated with inputs, clear error announcements, contrast ≥ AA, never colour-as-only-signal; axe checks in CI.
>
> **Screen map (Plan §5.2):** Login · Dashboard (R2) · Patient Search · New Patient Registration · Patient Profile (tabs) · Visit + clinical forms · Follow-Up Register · Documents Register · Reports (R2) · User Management · Master Data (R2) · Backup Status · Audit Logs · Merge Duplicates (R2).

---

## 1. Frontend Tasks

### Module 0 — Frontend Foundation (blocks all screens)

- [ ] **UI-TF.1 [M]** — Scaffold Vite + React + TS + MUI app (MVP)
      **Description:** Create the frontend project per Plan §2.3 (`api/`, `auth/`, `components/`, `features/`, `routes/`, `lib/`) with TypeScript strict, MUI theme, ESLint/Prettier.
      **Files / Components:** `frontend/package.json`, `frontend/vite.config.ts`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/theme.ts`.
      **Implementation Notes:** One `features/` folder per backend module. Strict TS (`tsc` clean). MUI base theme with AA-contrast palette.
      **Acceptance Criteria:** App builds and runs; `tsc` + `eslint` clean; folder structure matches Plan §2.3.

- [ ] **UI-TF.2 [L]** — Axios client with JWT interceptor & auto-refresh (MVP)
      **Description:** Implement a typed axios instance: attach access token, auto-refresh on 401, redirect to login on refresh failure; standard error-envelope parsing; `X-Request-ID` passthrough.
      **Files / Components:** `frontend/src/api/client.ts`, `frontend/src/api/interceptors.ts`, `frontend/src/api/errors.ts`.
      **Implementation Notes:** Decode `{ error: { code, message, details, request_id } }`; surface field-level 422 details to forms. No patient data persisted beyond session storage.
      **Acceptance Criteria:** Expired access token auto-refreshes transparently; failed refresh redirects to login; error envelope parsed consistently.

- [ ] **UI-TF.3 [M]** — Auth context, token store & route guards (MVP)
      **Description:** Auth context + session token storage; `usePermissions()` hook; `<RequireAuth>` / `<RequirePermission>` route guards; role-gated routing.
      **Files / Components:** `frontend/src/auth/AuthContext.tsx`, `.../tokenStore.ts`, `.../usePermissions.ts`, `frontend/src/routes/`.
      **Implementation Notes:** Permissions fetched from `GET /me/permissions` — never hard-code the matrix. UI gating mirrors but does not replace server enforcement.
      **Acceptance Criteria:** Unauthenticated access redirects to login; users without a permission cannot reach/see gated routes/actions; permissions sourced from API.

- [ ] **UI-TF.4 [L]** — Shared component library (MVP)
      **Description:** Build reusable components: data table (pagination/sort/filter), form wrapper with field-level zod validation, file upload (client-side type/size pre-check), confirmation dialog, timeline component, toast/error display, masked-field display.
      **Files / Components:** `frontend/src/components/DataTable.tsx`, `.../FormWrapper.tsx`, `.../FileUpload.tsx`, `.../ConfirmDialog.tsx`, `.../Timeline.tsx`, `.../Toast.tsx`.
      **Implementation Notes:** Table consumes the `{items,total,page,page_size}` envelope. Upload pre-checks pdf/jpeg/png + size before sending. All components AA-accessible.
      **Acceptance Criteria:** Components reused across features; table paginates server-side; upload rejects bad type/size client-side; all keyboard-navigable.

- [ ] **UI-TF.5 [M]** — App shell, role-based navigation & session timeout (MVP)
      **Description:** App layout (header, role-filtered menu, content area), inactivity/session-timeout handling, global 409-conflict reload prompt pattern.
      **Files / Components:** `frontend/src/components/AppShell.tsx`, `.../Nav.tsx`, `frontend/src/lib/session.ts`.
      **Implementation Notes:** Menu items hidden by permission. Inactivity timeout configurable; clears session (no patient data cached beyond session). 409 → standardized reload dialog.
      **Acceptance Criteria:** Menu reflects role; idle timeout logs out & clears state; 409 anywhere prompts reload.

- [ ] **UI-TF.6 [M]** — zod schemas, formatting & constants (MVP)
      **Description:** Shared zod validation schemas mirroring API rules, formatters (dates ISO-8601, masked mobile), and constants; master-data-driven select options via `GET /master-data/{type}`.
      **Files / Components:** `frontend/src/lib/validation/`, `frontend/src/lib/format.ts`, `frontend/src/lib/constants.ts`.
      **Implementation Notes:** Never hard-code lookup codes — fetch live from master-data. Min-identity rule reflected client-side as a friendly hint (server authoritative).
      **Acceptance Criteria:** Forms validate against zod before submit; selects populated from master-data; dates rendered/sent ISO-8601.

- [ ] **UI-TF.7 [S]** — CI: lint, type-check & accessibility checks (MVP)
      **Description:** Wire eslint + tsc + automated a11y (jest-axe/Playwright-axe) on key screens into CI.
      **Files / Components:** `frontend/.eslintrc`, CI workflow, `frontend/src/**/*.a11y.test.tsx`.
      **Acceptance Criteria:** CI fails on lint/type/a11y violations on key screens.

### Module 1 — Login & Auth Shell (UC-01)

- [ ] **UI-T1.1 [M]** — Login screen (MVP)
      **Description:** Build the login form (username + password) calling `POST /auth/login`, storing tokens, redirecting to the dashboard/search.
      **Files / Components:** `frontend/src/features/auth/LoginPage.tsx`.
      **Implementation Notes:** Show a single generic error on bad credentials (no enumeration); surface lockout (`AUTH_ACCOUNT_LOCKED`) and disabled (`AUTH_ACCOUNT_DISABLED`) messages; handle `429` with retry hint. Accessible labels + focus order.
      **Acceptance Criteria:** Valid login authenticates and routes in; bad credentials show generic message; locked/disabled/throttled states handled; keyboard-navigable.

- [ ] **UI-T1.2 [S]** — Logout & current-user menu (MVP)
      **Description:** User menu showing `GET /me` identity; logout calls `POST /auth/logout` and clears session.
      **Files / Components:** `frontend/src/features/auth/UserMenu.tsx`.
      **Acceptance Criteria:** Logout revokes token and returns to login; user identity/roles shown.

### Module 1b — User Management (UC-02, Admin)

- [ ] **UI-T1.3 [L]** — User Management screen (MVP)
      **Description:** Admin screen to list/search users (`?status=`, `?q=`, `?is_doctor=`), create, edit (roles, version-checked), enable/disable, reset password.
      **Files / Components:** `frontend/src/features/users/UsersListPage.tsx`, `.../UserFormDialog.tsx`, `.../ResetPasswordDialog.tsx`.
      **Implementation Notes:** Gated by `manage_users`. Roles from `GET /roles`. Duplicate username/email → inline 409 message; stale version → reload prompt. Confirmation dialog for disable/reset.
      **Acceptance Criteria:** Admin can perform full user lifecycle; non-admin cannot reach the screen; version conflicts handled; actions confirmed.

### Module 2 — Master Data (UC-28, Admin) — config UI is R2

- [ ] **UI-T2.1 [M]** — Master Data management screen (R2)
      **Description:** Admin screen to view/add/update/deactivate lookup values per `{type}` and view/edit OP sequences (prefix/padding/reset policy).
      **Files / Components:** `frontend/src/features/masterdata/MasterDataPage.tsx`, `.../OpSequencePanel.tsx`.
      **Implementation Notes:** Gated by `manage_master_data`. Inactive values hidden from new-record selects but shown here. Duplicate `type+code` → 409 inline.
      **Acceptance Criteria:** Admin can manage each lookup type + OP sequences; deactivation reflected in other forms' selects; non-admin blocked.

### Module 3 — Patient Registration & Profile (UC-03, UC-06, UC-07, UC-16, UC-18 inline)

- [ ] **UI-T3.1 [L]** — New Patient Registration screen (MVP)
      **Description:** Registration form calling `POST /patients`; mandatory fields marked; min-identity hint; OP category select; inline duplicate warning (UC-18) with `confirm_create` override flow.
      **Files / Components:** `frontend/src/features/patients/RegisterPatientPage.tsx`.
      **Implementation Notes:** On `409 DUPLICATE_PATIENT_SUSPECTED`, render suggested matches from `error.details` and offer "register anyway" (`confirm_create=true`) or open the existing profile. `op_number` not entered (server-generated). 422 field errors inline.
      **Acceptance Criteria:** Valid registration shows generated OP number; min-identity enforced with clear messaging; duplicate suggestions shown with override; mandatory fields visibly marked.

- [ ] **UI-T3.2 [L]** — Patient Profile shell with tabs (MVP)
      **Description:** Patient profile container with tabs: Basic Details · Visits · Case Sheets · Consultation Notes · Prescriptions · Discharge Summaries · Documents · Follow-Ups · Audit History (UC-06, UC-17).
      **Files / Components:** `frontend/src/features/patients/PatientProfilePage.tsx`, tab components.
      **Implementation Notes:** `GET /patients/{id}` (access is audited server-side). Tabs lazy-load. Medical tabs respect field-level visibility (limited roles see reduced view).
      **Acceptance Criteria:** All tabs render the correct module data; limited roles see filtered medical content; profile load works for permitted roles.

- [ ] **UI-T3.3 [M]** — Basic Details view/edit (MVP)
      **Description:** Basic Details tab: display + edit demographics via `PUT /patients/{id}` (version-checked, audited).
      **Files / Components:** `frontend/src/features/patients/tabs/BasicDetailsTab.tsx`.
      **Implementation Notes:** `op_number` shown read-only (immutable). Stale `version` → 409 reload prompt. Edit gated by `edit_patient`.
      **Acceptance Criteria:** Edits persist with version check; concurrent edit prompts reload; OP number not editable.

- [ ] **UI-T3.4 [S]** — Patient aliases display (MVP)
      **Description:** Show old/legacy OP numbers from `GET /patients/{id}/aliases` (merge/historical/correction sources).
      **Files / Components:** `frontend/src/features/patients/tabs/AliasesPanel.tsx`.
      **Acceptance Criteria:** Aliases listed with source; visible within Basic Details/profile.

### Module 5 — Patient Search (UC-05)

- [ ] **UI-T5.1 [L]** — Patient Search screen (dashboard-first) (MVP)
      **Description:** Search UI by OP number, mobile, partial/full name, with paginated results table; click-through to profile.
      **Files / Components:** `frontend/src/features/search/PatientSearchPage.tsx`.
      **Implementation Notes:** `GET /patients/search`. Results show **minimal identifiers only — no medical data** (masked mobile). Ranked exact-first. This is the default landing for staff.
      **Acceptance Criteria:** Searching by each criterion returns ranked results; no clinical fields shown; pagination works; selecting a result opens the profile.

- [ ] **UI-T5.2 [M]** — Advanced search filters (R2)
      **Description:** Add an advanced-filter panel to the search screen (SAD §13 Full-Scope): combinable filters for age/DOB range, address, visit-date range, and OP category, backed by `BE-T5.2`.
      **Files / Components:** `frontend/src/features/search/AdvancedFilters.tsx`, `.../PatientSearchPage.tsx`.
      **Implementation Notes:** Results keep the minimal-identifier, no-clinical contract. Date/age range inputs validated client-side (zod). Filters collapsible to keep the dashboard-first simple search uncluttered.
      **Acceptance Criteria:** Combined filters narrow results; ranges validated; result list still shows no clinical data; accessible controls.

### Module 6 — Visits & Clinical Entry (UC-08/09/10)

- [ ] **UI-T6.1 [M]** — Visit create + visit list (MVP)
      **Description:** Create-visit form and the Visits tab list; `POST/GET /patients/{id}/visits`, `GET/PUT /visits/{id}`.
      **Files / Components:** `frontend/src/features/visits/VisitsTab.tsx`, `.../VisitFormDialog.tsx`.
      **Implementation Notes:** Visit type/consultation category/doctor from master-data + doctor picker (`GET /users?is_doctor=true`). Non-scheduled future date blocked (mirror 422). Version-checked edits.
      **Acceptance Criteria:** Visit created/listed/edited; future non-scheduled date rejected with clear message; doctor picker populated.

- [ ] **UI-T6.2 [M]** — Case Sheet form (paper-like) (MVP)
      **Description:** Case Sheet tab form mirroring the paper case sheet; `PUT /visits/{id}/case-sheet` upsert, `GET` read.
      **Files / Components:** `frontend/src/features/visits/CaseSheetTab.tsx`.
      **Implementation Notes:** All clinical free-text fields (appetite, sleep, motion, energy, hereditary, past ailments, surgeries, present complaints, remarks). Write gated by `add_consultation`; read by `view_medical_history`. Version-checked.
      **Acceptance Criteria:** Form resembles paper sheet; save creates-or-updates the single case sheet; concurrent edit → reload prompt; permission-gated.

- [ ] **UI-T6.3 [M]** — Consultation Notes (append-only) (MVP)
      **Description:** Consultation Notes tab: list + add note; `POST/GET /visits/{id}/consultation-notes`.
      **Files / Components:** `frontend/src/features/visits/ConsultationNotesTab.tsx`.
      **Implementation Notes:** Append-only entries (complaints, diagnosis, observations, treatment/diet advice, review date). Corrections are new entries, never overwrite.
      **Acceptance Criteria:** Notes added and listed chronologically; history preserved; write/read permission-gated.

### Module 7 — Prescriptions (UC-11/12)

- [ ] **UI-T7.1 [M]** — Prescriptions tab (entry + upload) (MVP)
      **Description:** Prescriptions tab: create with structured items (and/or free-text), list, view; or attach a scanned prescription via Documents (`document_type=PRESCRIPTION`).
      **Files / Components:** `frontend/src/features/clinical/PrescriptionsTab.tsx`, `.../PrescriptionFormDialog.tsx`.
      **Implementation Notes:** Item fields: medicine_name, dosage, timing, duration, usage_instruction, application_route (INTERNAL/EXTERNAL). Write gated by `add_prescription`. Structured PDF generation is R2.
      **Acceptance Criteria:** Prescription with items created and listed; scanned upload path available; permission-gated.

### Module 8 — Discharge Summaries (UC-13/14)

- [ ] **UI-T8.1 [M]** — Discharge Summary tab with finalize/amend (MVP)
      **Description:** Discharge Summary tab: create draft, edit draft, finalize (immutable), amend (new version), view current-effective + history.
      **Files / Components:** `frontend/src/features/clinical/DischargeSummaryTab.tsx`.
      **Implementation Notes:** Enforce `discharge_date ≥ admission_date` client-side; block editing once finalized (`409 DISCHARGE_ALREADY_FINALIZED` → show finalized state + amend action). Show `is_superseded`/`superseded_by`. History list newest-first.
      **Acceptance Criteria:** Draft editable; finalize locks editing and reveals amend; current vs history clearly distinguished; date rule enforced.

### Module 9 — Documents (UC-12/14/15/30)

- [ ] **UI-T9.1 [M]** — Documents tab (upload + list) (MVP)
      **Description:** Documents tab on the profile: upload (multipart) with type/size pre-check, list with filters (`document_type`, `status`, `visit_id`), metadata edit/soft-delete.
      **Files / Components:** `frontend/src/features/documents/DocumentsTab.tsx`, `.../UploadDialog.tsx`.
      **Implementation Notes:** `POST /patients/{id}/documents`. Client pre-checks pdf/jpeg/png + size; surface 413/415 clearly. `document_type_code` + optional visit link/title/date/historical/remarks.
      **Acceptance Criteria:** Upload succeeds for valid files; bad type/size blocked client + server; list filters work; soft-delete via status.

- [ ] **UI-T9.2 [M]** — Documents Register + secure viewer/download (UC-15) (MVP)
      **Description:** Standalone Documents Register screen and a secure viewer/download using `GET /documents/{id}/content` (proxied) or `/download-url` (pre-signed).
      **Files / Components:** `frontend/src/features/documents/DocumentsRegisterPage.tsx`, `.../SecureViewer.tsx`.
      **Implementation Notes:** Never expose object-store URLs; download via permission-checked endpoints (access audited server-side). Document preview is R2.
      **Acceptance Criteria:** Register lists documents with filters; download/stream works only for permitted users; no raw storage URL exposed.

- [ ] **UI-T9.3 [M]** — In-app document preview (R2)
      **Description:** Inline preview of PDF/JPG/PNG documents (Plan §1.4 Full-Scope) within the secure viewer, without forcing a download.
      **Files / Components:** `frontend/src/features/documents/SecureViewer.tsx`, `.../DocumentPreview.tsx`.
      **Implementation Notes:** Render via the permission-checked `GET /documents/{id}/content` stream (or short-lived pre-signed URL); never expose object-store URLs. Sandbox/iframe for PDFs; image preview for JPG/PNG. Access still audited server-side.
      **Acceptance Criteria:** Permitted users preview supported types inline; unauthorized users blocked; no raw storage URL exposed; access audited.

### Module 10 — Patient Timeline (UC-17)

- [ ] **UI-T10.1 [M]** — Patient Timeline view (MVP)
      **Description:** Chronological timeline (most-recent-first) of visits, case sheets, consultation notes, prescriptions, discharge summaries, documents, follow-ups using the shared Timeline component.
      **Files / Components:** `frontend/src/features/patients/tabs/TimelineTab.tsx`.
      **Implementation Notes:** `GET /patients/{id}/timeline`. Event entries link to their detail. Medical summaries respect field-level visibility. Use icon/text + colour (never colour alone) for event types.
      **Acceptance Criteria:** Timeline merges all sources in order; entries navigate to detail; limited roles see filtered content; AA-compliant signalling.

### Module 11 — Follow-Up Tracking (UC-20/21)

- [ ] **UI-T11.1 [M]** — Follow-Ups tab + Follow-Up Register screen (MVP)
      **Description:** Patient Follow-Ups tab (create/list/update) and a global Follow-Up Register/queue with filters (`status`, `from/to`, `assigned_to`).
      **Files / Components:** `frontend/src/features/followups/FollowUpsTab.tsx`, `.../FollowUpRegisterPage.tsx`.
      **Implementation Notes:** Lifecycle `PENDING → CONTACTED|NOT_REACHABLE → COMPLETED|RESCHEDULED`; invalid transition → 409 message. Status uses icon+text (not colour-only). Version-checked updates. `manage_followups`.
      **Acceptance Criteria:** Create/update follow-ups; status transitions guided; queue filters work; not deletable; AA status signalling.

### Module 12 — Audit Logs (UC-25, Admin)

- [ ] **UI-T12.1 [M]** — Audit Logs screen + profile Audit History tab (MVP)
      **Description:** Admin Audit Logs screen (filter by user/patient/action/entity/date, paginated) and a per-patient Audit History tab.
      **Files / Components:** `frontend/src/features/audit/AuditLogsPage.tsx`, `frontend/src/features/patients/tabs/AuditHistoryTab.tsx`.
      **Implementation Notes:** `GET /audit-logs` (admin, `view_audit`) and `GET /audit-logs/{id}` for old/new detail. Read-only.
      **Acceptance Criteria:** Filters narrow results; entry detail shows old/new; non-admin cannot access the global screen.

### Module 13 — Backup Status (UC-26, Admin)

- [ ] **UI-T13.1 [S]** — Backup Status screen (MVP)
      **Description:** Admin screen showing latest + recent backup runs and outcomes from `GET /backup/status`.
      **Files / Components:** `frontend/src/features/backup/BackupStatusPage.tsx`.
      **Implementation Notes:** Gated by `backup_control`. Read-only (no restore/trigger in UI).
      **Acceptance Criteria:** Latest run + history with status shown; admin-only; no restore controls.

### Module 16 — Dashboard (UC-22, R2)

- [ ] **UI-T16.1 [L]** — Dashboard screen (role-filtered widgets) (R2)
      **Description:** Dashboard with role-filtered widgets: recent registrations, today's visits, pending/upcoming follow-ups, recent uploads, patient count by OP category; click-through to detail.
      **Files / Components:** `frontend/src/features/dashboard/DashboardPage.tsx`.
      **Implementation Notes:** `GET /dashboard/summary`. Doctors see clinical follow-ups; receptionists operational; admins overall. Loads within NFR (p95 < 2 s).
      **Acceptance Criteria:** Widgets vary by role; counts match backend; click-through navigates; performant.

### Module 17 — Reports & Export (UC-23/24, R2)

- [ ] **UI-T17.1 [M]** — Reports screen (R2)
      **Description:** Reports screen for `registration, visit, follow_up, op_category, document_upload` with mandatory date range and optional filters; view JSON tables and export CSV/Excel.
      **Files / Components:** `frontend/src/features/reports/ReportsPage.tsx`.
      **Implementation Notes:** `GET /reports/{type}`; require `from`/`to` before submit; format select (json/csv/xlsx). Gated by `view_reports`/`export`.
      **Acceptance Criteria:** Each report renders with required date range; export downloads file; permission-gated.

- [ ] **UI-T17.2 [S]** — Patient record export action (R2)
      **Description:** Export-patient action on the profile via `POST /patients/{id}/export` (CSV/Excel; PDF optional).
      **Files / Components:** `frontend/src/features/patients/ExportPatientButton.tsx`.
      **Implementation Notes:** Gated by `export`; server audits the export.
      **Acceptance Criteria:** Export produces the chosen format; only permitted roles see the action.

- [ ] **UI-T17.3 [S]** — Clinical PDF download actions (R2)
      **Description:** "Download PDF" actions for prescriptions and discharge summaries, plus a `pdf` option on patient export — backed by `BE-T17.3`.
      **Files / Components:** `frontend/src/features/clinical/PrescriptionsTab.tsx`, `.../DischargeSummaryTab.tsx`, `frontend/src/features/patients/ExportPatientButton.tsx`.
      **Implementation Notes:** Buttons appear only when the PDF feature flag is enabled and the user holds the relevant view/export permission. Streamed via permission-checked endpoints; generation audited server-side.
      **Acceptance Criteria:** PDF downloads for prescription, discharge summary, and patient export when enabled; hidden when the flag is off or permission absent.

### Module 15 — Merge Duplicates (UC-18/19, R2, Admin)

- [ ] **UI-T15.1 [M]** — Duplicate suggestions + merge request (R2)
      **Description:** Surface duplicate candidates (`GET /patients/duplicates`) and let staff submit a merge request (`POST /merge-requests`).
      **Files / Components:** `frontend/src/features/duplicates/DuplicatesPage.tsx`, `.../MergeRequestDialog.tsx`.
      **Implementation Notes:** Show confidence (high for mobile match, possible for fuzzy name+DOB). `request_merge` to submit; primary ≠ duplicate enforced. Cancel own pending request.
      **Acceptance Criteria:** Candidates listed with confidence; staff can request a merge; same-patient blocked; requester can cancel.

- [ ] **UI-T15.2 [L]** — Merge approval queue & execution (Admin) (R2)
      **Description:** Admin merge queue (`GET /merge-requests?status=pending`) with approve/reject (with `decision_remarks`); approval triggers backend merge execution.
      **Files / Components:** `frontend/src/features/duplicates/MergeQueuePage.tsx`, `.../MergeDecisionDialog.tsx`.
      **Implementation Notes:** Gated by `merge_records` (Admin). Confirmation dialog emphasizing irreversibility; show before/after preview (records moving to primary). `MERGE_INVALID_STATE` handled.
      **Acceptance Criteria:** Admin sees pending queue; approve executes merge with confirmation; reject records remarks; non-admin blocked.

### Cross-cutting Frontend

- [ ] **UI-TX.1 [M]** — Global 409 / version-conflict reload UX (MVP)
      **Description:** Standardize the conflict experience: any `409 VERSION_CONFLICT` shows a reload prompt that re-fetches the record before re-editing (UC-29).
      **Files / Components:** `frontend/src/lib/conflict.ts`, integrated into all edit forms.
      **Acceptance Criteria:** Concurrent edits anywhere surface a consistent reload prompt; no silent overwrite.

- [ ] **UI-TX.2 [M]** — Accessibility pass on key screens (MVP)
      **Description:** Audit Login, Registration, Search, Profile tabs, clinical forms, Follow-Up Register for WCAG 2.1 AA: keyboard nav, focus order, ARIA labels, error announcements, contrast, non-colour signalling; fix axe findings.
      **Files / Components:** all `features/` screens, `*.a11y.test.tsx`.
      **Acceptance Criteria:** axe checks pass on key screens in CI; manual keyboard-nav smoke passes.

- [ ] **UI-TX.3 [M]** — Frontend component & validation tests (MVP)
      **Description:** Vitest + React Testing Library tests for components, form validation, route-guard/permission gating, with API mocks.
      **Files / Components:** `frontend/src/**/*.test.tsx`, mock handlers.
      **Acceptance Criteria:** Components and forms covered; guards block unauthorized routes in tests; CI green.

- [ ] **UI-TX.4 [S]** — (Optional R2) E2E key-flow tests (R2)
      **Description:** Playwright E2E: login → register → search → visit → clinical entry → upload → follow-up.
      **Files / Components:** `frontend/e2e/`.
      **Acceptance Criteria:** Key flow passes end-to-end against a seeded environment.

- [ ] **UI-TX.5 [S]** — Frontend README & UX/accessibility conventions (MVP)
      **Description:** Document component usage, permission-gating pattern, master-data-driven selects, and the AA accessibility conventions.
      **Files / Components:** `frontend/README.md`, `Docs/UI_CONVENTIONS.md`.
      **Acceptance Criteria:** A new frontend dev can build a feature screen following the docs; conventions documented.

---

*End of Phase 1 UI / Frontend Task Checklist — ArogyaM PMS.*
