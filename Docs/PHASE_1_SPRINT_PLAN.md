# Phase 1 — Sprint Plan

**Application:** ArogyaM Patient Management System (PMS)
**Phase:** Phase 1 (Internal Operational System)
**Version:** 1.0
**Date:** 2026-06-04
**Status:** For Review
**Source References:**
- `Docs/PHASE1_IMPLEMENTATION_PLAN.md` — sequencing (Plan §14), tiers (Plan §1.4), modules (Plan §3)
- `Docs/PHASE_1_UI_TASK_CHECKLIST.md` — frontend task IDs (`UI-T*`)
- `Docs/PHASE_1_API_TASK_CHECKLIST.md` — backend/API/DB/sec/test/devops task IDs (`BE-T*`, `API-T*`, `DB-T*`, `SEC-T*`, `LOG-T*`, `TST-T*`, `DOC-T*`, `DEV-T*`, `INT-T*`)

> **Purpose.** Turn the implementation plan and task checklists into a **6-sprint, 2-week-cadence schedule** that ships a **usable, demoable increment at the end of every sprint**, sequenced by the real clinic workflow (login → register → find → consult → document → follow-up) and use-case priority (MVP first, R2 as a controlled stretch). Total duration: **3 months (~12 weeks + go-live buffer)**.

---

## 1. Planning Assumptions

| Item | Assumption |
|------|------------|
| **Cadence** | 2-week sprints, 6 sprints, Mon–Fri. Sprint review + demo on the last day; planning on day 1. |
| **Total window** | ~12 build weeks + ~1 week UAT/go-live buffer ≈ 3 months. |
| **Team (per Plan §14.1)** | 1 Tech Lead, 1–2 Backend (FastAPI/Postgres), 1 Frontend (React), part-time DevOps, part-time QA. **Backend and frontend work in parallel against the OpenAPI contract** — this parallelism is what makes the schedule fit. |
| **Working mode** | API-first vertical slices (Plan §2.1): contract → DB → repo → service → router → UI, each module end-to-end so value is demonstrable early. |
| **Scope target** | **R1 (MVP) feature-complete and in production by end of Sprint 6.** R2 (Full-Scope) items are pulled forward only as capacity allows and are explicitly marked *(stretch)*. |
| **Continuous tracks** | Testing, security, accessibility, log-privacy, and CI run **every sprint**, not as a final phase (Plan §14.1). |

### Definition of Done (every sprint increment)
Per Plan §1.5 — code merged via PR · unit + integration tests passing · RBAC enforced server-side · sensitive actions audited · inputs validated (Pydantic/zod) · no PII/PHI in non-audit logs · OpenAPI updated · migration applied · a11y check green on new screens · **demoable end-to-end in the dev/UAT environment**.

---

## 2. Sprint Roadmap (at a glance)

| Sprint | Weeks (indicative) | Theme | Usable increment delivered | Tier |
|--------|--------------------|-------|----------------------------|------|
| **S1** | Wk 1–2 · Jun 08–19 | **Foundation & Identity** | Stack runs; users log in; admin manages users; RBAC live | MVP |
| **S2** | Wk 3–4 · Jun 22–Jul 03 | **Register & Find a Patient** | Reception can register a patient (auto OP number) and search/open them | MVP |
| **S3** | Wk 5–6 · Jul 06–17 | **Consult & Record** | Profile with tabs; create visits; case sheets + consultation notes | MVP |
| **S4** | Wk 7–8 · Jul 20–31 | **Clinical Documents & Timeline** | Prescriptions, discharge summaries, document upload/secure view, unified timeline | MVP |
| **S5** | Wk 9–10 · Aug 03–14 | **Follow-ups, Audit, Backup → R1 complete** | Follow-up register, audit logs, nightly backups; hardening/perf | MVP |
| **S6** | Wk 11–12 · Aug 17–28 | **Stabilize, Go-Live & R2 quick wins** | UAT sign-off + production go-live; dashboard/reports/merge as stretch | MVP go-live + R2 |
| *Buffer* | Wk 13 · Aug 31–Sep 04 | Go-live hardening / training | Cutover, restore drill, user training | — |

**Milestone mapping (Plan §14):** M1 = end S1 (auth) · M2 = end S2 (register+search) · M3 = end S4 (clinical+docs+timeline) · M4 = end S5 (R1 go-live ready) · M5 = S6+ (Full-Scope).

---

## 3. Sprint Detail

### Sprint 1 — Foundation & Identity  *(Wk 1–2)*
**Sprint goal:** Stand up the full stack and ship secure login + admin user management. *Nothing else can be built until this exists (Plan Stage 0–1).*

**Demo at sprint end:** "An admin logs in over HTTPS, creates a receptionist and a doctor user, assigns roles, disables/resets a user — and a non-admin is correctly blocked from the user screen."

**Backend / Core**
- `BE-TF.1`–`BE-TF.9` — scaffold, config, DB session, security primitives (JWT + hashing), **auth & RBAC dependencies**, structured logging + redaction, audit helper, error envelope, request-ID/pagination plumbing.
- `BE-T1.1`–`BE-T1.5` — auth models/schemas, login with lockout & no-enumeration, refresh/logout, `/me` + permissions, **user management** (CRUD, enable/disable, reset password).
- `API-T1.1`, `API-T1.2`, `API-T0.1` — auth/session routes, user/role routes, `/api/v1` conventions & envelopes.

**Database / DevOps**
- `DB-T0.1`–`DB-T0.4` — Alembic baseline from DDL, seed lookups, **first-admin seed script**, migration discipline.
- `DEV-TF.1` — Docker Compose dev env (proxy, frontend, api, postgres, minio, redis-optional) with seed data.
- `DEV-TF.4` (skeleton), `TST-T0.1` — CI test pipeline + ephemeral Postgres.

**Frontend**
- `UI-TF.1`–`UI-TF.7` — Vite/React/MUI scaffold, axios+JWT interceptor, auth context + route guards, **shared component library**, app shell + role nav + session timeout, zod/format/constants, CI lint/type/a11y.
- `UI-T1.1`, `UI-T1.2` — Login screen, logout/current-user menu.
- `UI-T1.3` — User Management screen (admin).

**Security / Tests**
- `SEC-T1.1`, `SEC-T0.1`–`SEC-T0.3` — deny-by-default RBAC, input/SQL safety, CORS/headers, secrets.
- `SEC-T1.2` — auth rate limiting (`429` + `Retry-After`, optional Redis) on the login route.
- `LOG-T1.1` (login + user changes), `LOG-T0.1` — audit + PII-safe logging wired from day one.
- `TST-T1.1`, `TST-T1.2` — auth/RBAC + security-negative tests.

**Exit criteria:** Login/refresh/logout + RBAC enforced; admin user lifecycle works and is audited; dev stack `docker compose up` end-to-end; CI green.

**⚠️ Load note:** This is the heaviest sprint (Stage 0 + Stage 1 ≈ 3–4 wk of raw effort compressed via BE/FE parallelism). If capacity slips, **let User Management (`BE-T1.5`/`UI-T1.3`) spill into early S2** — login + RBAC + app shell are the non-negotiable S1 exit.

---

### Sprint 2 — Register & Find a Patient  *(Wk 3–4)*
**Sprint goal:** Deliver the front-desk core: register a patient with a transaction-safe OP number, then search and open them. *This is the highest-frequency, highest-priority workflow (UC-03/04/05).*

**Demo at sprint end:** "Reception registers a new patient, the system issues OP number `OPN0001`, an inline duplicate warning fires on a repeat mobile, and the patient is found by name/OP/mobile from the search screen."

**Master Data & OP Numbering (Stage 2)**
- `BE-T2.1`, `BE-T2.2`, `API-T2.1` — master-data read APIs + OP-sequence service (seed verified in S1).
- `BE-T4.1`, `DB-T4.1`, `DB-T5.1`, `DB-T3.1` — **row-locked OP-number generator**, sequence lock readiness, search FTS/trigram indexes, patient/alias constraints.

**Patient Core (Stage 3)**
- `BE-T3.1`–`BE-T3.3`, `API-T3.1` — patient model/schemas, **registration service** (inline duplicate check + atomic OP numbering), profile read/update (role-filtered, version-checked, audited), aliases.
- `BE-T5.1`, `API-T5.1` — **patient search service** (ranked, minimal-identifier, masked mobile, no clinical data).
- `BE-T14.1` — optimistic concurrency framework (first real use).

**Frontend**
- `UI-T3.1` — New Patient Registration (mandatory-field marking, min-identity hint, `confirm_create` duplicate override).
- `UI-T5.1` — Patient Search (dashboard-first landing).
- `UI-TF.6` selects fed from live master-data; `UI-TX.1` global 409 conflict UX (first edit forms).

**Tests / Security**
- `TST-T4.1` — **OP-numbering & concurrency** (parallel registrations → unique numbers).
- `TST-T3.1` — patient lifecycle (register → OP → search); role field-filtering; duplicate advisory.
- `LOG-T0.2` — proxy query-string redaction for `/patients/search`.

**Exit criteria:** Registration issues unique OP numbers under concurrency; search ranked & PII-safe; duplicate advisory works; concurrency 409 surfaced in UI.

---

### Sprint 3 — Consult & Record  *(Wk 5–6)*
**Sprint goal:** Turn a registered patient into a clinical record: profile tabs, visits, and the paper-like case sheet + consultation notes (UC-06/08/09/10/17).

**Demo at sprint end:** "Open a patient profile, create today's visit with the consulting doctor, fill the case sheet, and append a consultation note — a receptionist sees the reduced medical view, the doctor sees the full one."

**Backend (Stage 4, part 1)**
- `BE-T3.x` profile shell support; `BE-T6.1`–`BE-T6.3`, `API-T6.1` — visits (future-date rule), **case-sheet upsert** (one per visit), append-only consultation notes.
- Field-level visibility filtering exercised end-to-end (limited roles → reduced clinical view).

**Frontend**
- `UI-T3.2`, `UI-T3.3`, `UI-T3.4` — Patient Profile shell with tabs, Basic Details view/edit, aliases panel.
- `UI-T6.1`–`UI-T6.3` — Visit create + list, Case Sheet form (paper-like), Consultation Notes (append-only).

**Tests / Cross-cutting**
- `TST-T6.1` (clinical lifecycle, partial — visits/case-sheet/notes), `UI-TX.2` a11y pass on profile + clinical forms.
- `UI-TX.3` — frontend component & validation tests (route-guard/permission gating, form zod validation) established now that real edit forms exist; continues every sprint after.

**Exit criteria:** Visit → case sheet → consultation note works with version checks and RBAC; field-level visibility verified; profile tabs render correct data.

---

### Sprint 4 — Clinical Documents & Timeline  *(Wk 7–8)*
**Sprint goal:** Complete the clinical record — prescriptions, discharge summaries (finalize/amend), secure document upload/download, and the unified patient timeline (UC-11/12/13/14/15/17/30).

**Demo at sprint end:** "Add a structured prescription, draft → finalize a discharge summary (then amend it), upload a scanned report and view it through the secure viewer, and see everything merged on the patient timeline."

**Backend (Stage 4 part 2 + Stage 5)**
- `BE-T7.1`, `API-T7.1` — prescriptions (+items).
- `BE-T8.1`, `API-T8.1` — discharge summaries with **finalize/amend** chain.
- `BE-T9.1`, `BE-T9.2`, `API-T9.1`, `INT-T9.1`, `INT-T9.2` — document upload (type/size/sniff), **secure proxied/pre-signed download**, MinIO client + bucket, optional AV hook.
- `BE-T10.1`, `API-T3.2` — **timeline aggregation**.

**Frontend**
- `UI-T7.1` Prescriptions tab · `UI-T8.1` Discharge Summary (finalize/amend) · `UI-T9.1`, `UI-T9.2` Documents tab + register + secure viewer · `UI-T10.1` Timeline view.

**Security / Tests**
- `SEC-T9.1`, `SEC-T9.2` — upload hardening + **authz-before-stream / audited download / URL expiry**.
- `TST-T6.1` (finish: discharge finalize/amend, date rules), `TST-T9.1` — document upload/secure-download/denial/audit.

**Exit criteria:** Full clinical documentation captured; finalized discharge blocks edits; documents stored in object store with no public URL leak; timeline merges all sources chronologically.

---

### Sprint 5 — Follow-ups, Audit, Backup → R1 Feature-Complete  *(Wk 9–10)*
**Sprint goal:** Close the operational loop (follow-ups), turn on observability/compliance (audit + backup), and harden to R1 NFRs (Stage 6–7).

**Demo at sprint end:** "Schedule a follow-up and move it through its lifecycle from the Follow-Up Register; an admin reviews the audit trail and the backup status screen; a nightly backup has run and a restore drill has succeeded."

**Backend / Ops**
- `BE-T11.1`, `API-T11.1` — follow-ups with status lifecycle + queue filters.
- `BE-T12.1`, `API-T12.1` — audit read API.
- `BE-T13.1`, `API-T13.1`, `INT-T13.1`–`INT-T13.3`, `LOG-T13.1` — **backup status, nightly cron + `backup_log`, SMTP alert, restore runbook + drill**.
- `BE-T18.1` — health/readiness endpoints.
- `DB-T10.1`, `DB-T14.1` — hot-path indexes, soft-delete guards.

**Frontend**
- `UI-T11.1` Follow-Ups tab + Register · `UI-T12.1` Audit Logs + Audit History tab · `UI-T13.1` Backup Status.

**Hardening (continuous tracks land here)**
- `TST-T11.1`, `TST-T0.2` (log-privacy CI guard), `TST-T0.3` (migration up/down), `TST-T0.4` (**perf/load on ~50k seed: search p95 <1s, dashboard <2s**), `TST-T0.5` (coverage gates).
- `SEC-T0.4` OWASP checklist · `LOG-T0.3` log storage perms/rotation/retention policy · `DEV-TF.2`, `DEV-TF.3`, `DEV-TF.5`, `DEV-TF.6`, `DEV-TF.8`, `DEV-TF.9` — prod images, proxy/TLS, security scans, migrations-on-deploy + rollback, encryption-at-rest, observability/uptime.

**Exit criteria (= M4, R1 go-live ready):** Every MVP module complete and tested; backups automated + restore drilled; perf NFRs met on seeded data; CI gates (lint/type/test/a11y/dep-scan/image-scan/secret-scan/log-privacy) all green; deploy + rollback rehearsed.

---

### Sprint 6 — Stabilize, Go-Live & R2 Quick Wins  *(Wk 11–12)*
**Sprint goal:** Get R1 into production with sign-off, then spend remaining capacity on the highest-value R2 items.

**Demo at sprint end:** "R1 is live on the UAT/prod VM with real users trained; admins can additionally see a basic dashboard and run a registration report; duplicate detection surfaces candidates for an admin merge."

**Go-live (priority 1)**
- `DEV-TF.4`/`DEV-TF.7` finalize CI/CD + release tagging · `DEV-TF.6` migrations-on-deploy in prod.
- `DOC-T0.1`–`DOC-T0.5`, `DOC-T13.1`, `UI-TX.5` — OpenAPI publish, backend + frontend READMEs (UX/a11y conventions), migration/release notes, ops/backup runbooks, security/log-privacy docs, open-questions resolution log.
- UAT sign-off · production cutover · user training · post-go-live smoke.

**R2 quick wins (priority 2, pull in this order as capacity allows — all *stretch*)**
1. `BE-T16.1`/`API-T16.1`/`UI-T16.1` — **basic dashboard** (highest daily value, role-filtered).
2. `BE-T17.1`/`BE-T17.2`/`API-T17.1`/`UI-T17.1`/`UI-T17.2`, `DB-T16.1` — **reports & export** (operational reporting + CSV/Excel).
3. `BE-T15.1`–`BE-T15.3`/`API-T15.1`/`UI-T15.1`/`UI-T15.2`, `TST-T15.1` — **duplicate detection + merge request→approve→execute** (data-quality; admin-gated).
4. `UI-T2.1` master-data config UI · `BE-T5.2`/`UI-T5.2` advanced search filters · `UI-T9.3` document preview.

**Deferred beyond this window (R2 backlog):** `BE-T17.3`/`UI-T17.3` structured PDF generation · `INT-T3.1` bulk historical import utility · `BE-T3.4` OP-number correction · `UI-TX.4` E2E key-flow tests. Schedule into a Phase-1.x follow-on.

**Exit criteria:** R1 in production, signed off, users trained, restore drill re-validated on prod target; R2 items delivered are independently demoable and tested.

---

## 4. Continuous Tracks (every sprint, not a phase)

| Track | Cadence | Anchored tasks |
|-------|---------|----------------|
| **Testing** | Each module merged with unit + integration tests | `TST-T*` aligned to the sprint's modules; `UI-TX.3` frontend component/validation tests |
| **Security** | Each endpoint deny-by-default + negative tests | `SEC-T1.1`, `SEC-T0.x`, `SEC-T9.x` |
| **Log-privacy** | Redaction on from S1; CI guard from S5 | `LOG-T0.1`, `LOG-T0.2`, `TST-T0.2` |
| **Accessibility** | a11y check on each new screen | `UI-TF.7`, `UI-TX.2` |
| **CI/CD** | Skeleton S1 → full gates by S5 | `DEV-TF.4`, `DEV-TF.5` |
| **Docs** | Update OpenAPI + READMEs as modules land; consolidate S6 | `DOC-T0.x` |

---

## 5. Schedule Risks & Mitigations

| # | Risk | Mitigation |
|---|------|------------|
| 1 | **S1 overload** (Stage 0+1 ≈ 3–4 wk in 2 wk) | Hard-prioritize login+RBAC+shell; allow User Management to spill to S2; DevOps stands up infra in parallel. |
| 2 | **3 months is tight for R1+R2** (Plan §14.1: R1 alone ~12–16 wk for 2–3 engineers) | Treat **R1 by end-S6 as the commitment**; R2 is strictly stretch. Protect parallel BE/FE staffing — single full-stack pair pushes R1 to the longer end and drops R2. |
| 3 | **Perf/backup left too late** | Pull perf seed + load test and backup cron into S5 (not S6); restore drill before go-live. |
| 4 | **OP-number concurrency defects** | Row-locked sequence + `TST-T4.1` concurrency test gated in S2 CI. |
| 5 | **Open questions (OP format, hosting, SMTP, upload limit)** unresolved at build-lock | `DOC-T0.5` open-questions log opened S1, owners assigned, decisions due before S5 config freeze. |
| 6 | **Scope creep R2 → R1** | Strict tier tags; R2 only entered after R1 go-live in S6. |

---

## 6. How to Use This Plan
- Each sprint's task IDs map 1:1 to `Docs/PHASE_1_UI_TASK_CHECKLIST.md` and `Docs/PHASE_1_API_TASK_CHECKLIST.md`; check them off there.
- Re-baseline after S1 (the foundation sprint) once real velocity is known — adjust S5/S6 R2 ambition, not the R1 critical path.
- Keep the demo discipline: if it can't be demoed end-to-end, it isn't done for the sprint.

---

*End of Phase 1 Sprint Plan — ArogyaM Patient Management System, v1.0.*