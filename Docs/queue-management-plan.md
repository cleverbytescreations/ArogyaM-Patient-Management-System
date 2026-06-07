# Patient Queue Management — Implementation Plan

**Status:** Approved design, not yet implemented — pick up when ready.
**Author context:** drafted via Claude Code session, 2026-06-07. Grounded in the
codebase as it exists at that date (see "Current-state findings" below for the
exact file:line citations this plan relies on).

---

## 1. Goal

Give clinic staff a dedicated **queue management screen** that:
- Shows the day's visits split into **Open** and **Completed** tabs (date-selectable, defaults to today)
- Assigns each visit a **daily, prefix-based token number** (e.g. `OP0001`, `OP0002`, …, resetting every day) — independent of the permanent OP *registration* number in `op_sequence`
- Lets staff mark a visit as **priority** (VIP / Senior Citizen / Emergency) at creation, which affects queue ordering
- Auto-selects the **doctor** a staff member works under (with a fallback dropdown for staff who support multiple doctors)
- Adds a **"Complete visit"** action — closing a gap where visits currently never leave `OPEN` status

---

## 2. Current-state findings (why these design choices)

These were confirmed by direct code inspection — re-verify if significant time has passed before implementing:

| Finding | Citation |
|---|---|
| `User.is_doctor` is a plain boolean; **no staff↔doctor mapping exists anywhere** (zero hits for `supervising_doctor_id`/junction tables) | `backend/app/modules/auth/models.py:60` |
| Roles are DB-driven (`roles`/`user_roles` tables), not a Python enum | `backend/app/modules/auth/models.py:32-46, 92-109` |
| Role codes: `ADMIN`, `DOCTOR`, `RECEPTION`, `DATA_ENTRY`; permission matrix is the single source of truth | `backend/app/core/permissions.py:55-95` |
| **Doctor role currently lacks `edit_patient`; Reception/Data-Entry lack `add_consultation`** — existing permissions don't cleanly cover "Doctor + Reception + Admin" as a group | `backend/app/core/permissions.py:67-95` |
| `visit_type` master-data codes today are `NEW, REVIEW, ONLINE, INPERSON, CAMP` — **not** OP/IP style | seeded in `backend/app/migrations/versions/0002_seed.py:51-58` |
| OP/IP-style prefixes live in `op_sequence` (`REGULAR→OPN`, `VILLAGE→OPV`, `CAMP→FC`) and are **year-oriented** (`reset_policy`, `last_reset_year`), not daily | `backend/app/modules/masterdata/models.py:49-69`, seed at `0002_seed.py:42-48` |
| Row-locked sequence pattern to copy for daily tokens | `backend/app/modules/patients/op_number.py` (`SELECT … FOR UPDATE`, then `UPDATE … SET last_sequence = …`) |
| `master_data` valid types enum — would need a new entry for priority/special-category | `backend/app/modules/masterdata/models.py:15-27` |
| Visits are created with `status="OPEN"` and **nothing ever transitions them** to `COMPLETED`/`CANCELLED` — no business rule, trigger, batch job, or UI exists | `backend/app/modules/visits/service.py:172` (create), confirmed via grep — only schema regex references `COMPLETED` |
| `review_date` on consultation notes is purely informational; no follow-up entity exists | `backend/app/modules/visits/service.py:386-413`, `models.py:122` |
| Nothing related to VIP/priority/special-category exists anywhere (zero grep hits) | full-repo grep, 2026-06-07 |

---

## 3. User decisions captured (do not re-litigate these)

1. **OP/IP**: Treat everything as `OP` for now. Design the `token_prefix` as **data-driven, not hardcoded**, so adding an `IP` use case later requires only new seed/config rows — no code changes. (See §4.1 — the `(prefix, sequence_date)` keyed sequence table naturally supports this.)
2. **"Complete visit" workflow**: Build it as part of this work (it's a hard prerequisite for the Completed tab to mean anything).
3. **RBAC**: Queue actions (set priority, mark complete) are available to **Receptionist + Doctor + Admin** (not Data Entry Staff). The doctor↔staff mapping admin screen remains **Administrator-only** (assumption — flag if wrong).
4. **Migration**: Land as **one larger migration** containing all new tables + seed data, rather than incrementally split.

---

## 4. Data model changes

All in a **single Alembic migration** (run inside Docker per CLAUDE.md: `docker compose exec api alembic revision -m "add queue management" --autogenerate`, then hand-edit, then `docker compose exec api alembic upgrade head`).

### 4.1 `queue_token_sequence` — daily, prefix-keyed counter

Mirrors `op_sequence`'s row-locking pattern but keyed on `(prefix, sequence_date)` instead of `category_code` + yearly reset — this is what makes future `IP` support a pure data change.

```sql
CREATE TABLE queue_token_sequence (
    id              SMALLSERIAL PRIMARY KEY,
    prefix          VARCHAR(10)  NOT NULL,
    sequence_date   DATE         NOT NULL,
    last_sequence   BIGINT       NOT NULL DEFAULT 0,
    padding_width   SMALLINT     NOT NULL DEFAULT 4,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (prefix, sequence_date)
);
```

Generator function `generate_queue_token(db, prefix, for_date)` in a new
`backend/app/modules/queue/token_sequence.py`, modeled directly on
`backend/app/modules/patients/op_number.py`:

```python
def generate_queue_token(db: Session, prefix: str, for_date: date) -> tuple[str, int]:
    """Row-locks (or creates) the (prefix, for_date) counter row, increments it,
    and returns (formatted_token, raw_sequence_number).
    MUST be called inside the caller's open transaction — does not commit."""
    row = db.execute(
        text("""
            SELECT id, last_sequence, padding_width
            FROM queue_token_sequence
            WHERE prefix = :p AND sequence_date = :d
            FOR UPDATE
        """),
        {"p": prefix, "d": for_date},
    ).first()

    if row is None:
        # First token for this prefix today — insert the counter row.
        # Use INSERT ... ON CONFLICT DO NOTHING + re-select-for-update to stay
        # race-safe under concurrent first-of-day requests.
        db.execute(
            text("""
                INSERT INTO queue_token_sequence (prefix, sequence_date, last_sequence)
                VALUES (:p, :d, 0)
                ON CONFLICT (prefix, sequence_date) DO NOTHING
            """),
            {"p": prefix, "d": for_date},
        )
        row = db.execute(
            text("""SELECT id, last_sequence, padding_width FROM queue_token_sequence
                     WHERE prefix = :p AND sequence_date = :d FOR UPDATE"""),
            {"p": prefix, "d": for_date},
        ).first()

    seq_id, last_seq, padding_width = row
    next_seq = last_seq + 1
    db.execute(
        text("UPDATE queue_token_sequence SET last_sequence = :n WHERE id = :id"),
        {"n": next_seq, "id": seq_id},
    )
    return f"{prefix}{str(next_seq).zfill(padding_width)}", next_seq
```

### 4.2 `visit_queue` — child table, 1:1 with `visits`

```sql
CREATE TABLE visit_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id        UUID NOT NULL UNIQUE REFERENCES visits(id),
    patient_id      UUID NOT NULL REFERENCES patients(id),   -- denormalized for fast queue reads
    queue_date      DATE NOT NULL,                            -- = visits.visit_date at creation
    token_prefix    VARCHAR(10) NOT NULL,                     -- e.g. 'OP' (or 'IP' later)
    token_number    INTEGER NOT NULL,                         -- raw sequence for the day
    token_label     VARCHAR(20) NOT NULL,                     -- formatted, e.g. 'OP0001'
    priority_level  VARCHAR(40),                              -- master_data 'special_category' code, NULL = normal
    status          VARCHAR(12) NOT NULL DEFAULT 'OPEN',      -- mirrors visits.status (OPEN/COMPLETED/CANCELLED)
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by      UUID,
    UNIQUE (queue_date, token_prefix, token_number)
);

CREATE INDEX ix_visit_queue_date_status_priority
    ON visit_queue (queue_date, status, priority_level, token_number);
```

Notes:
- `status` is **denormalized from `visits.status`** rather than joined live, so the queue list query stays a single indexed scan. It must be kept in sync — see §5.2 (the `complete_visit` service method updates both rows in the same transaction).
- `priority_level` lives on the **queue row, not the patient** — confirms "emergency just for today" semantics while still letting staff pick `VIP` every visit for a habitually-VIP patient.
- Ordering for the queue list: `ORDER BY (priority_level IS NOT NULL) DESC, priority_rank(priority_level) ..., token_number ASC` — see §5.3 for how priority ranking is resolved (via `master_data.sort_order`, avoiding a hardcoded rank table).

### 4.3 `doctor_staff_assignments` — many-to-many staff↔doctor mapping

```sql
CREATE TABLE doctor_staff_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_user_id   UUID NOT NULL REFERENCES users(id),
    doctor_user_id  UUID NOT NULL REFERENCES users(id),
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    UNIQUE (staff_user_id, doctor_user_id)
);

-- Partial unique index: at most one primary doctor per staff member
CREATE UNIQUE INDEX ux_doctor_staff_one_primary
    ON doctor_staff_assignments (staff_user_id) WHERE is_primary;
```

Modeled as many-to-many because the user confirmed it's plausible for one staff
member (e.g. a receptionist) to support more than one doctor.

### 4.4 New master-data type: `special_category`

Add `"special_category"` to `VALID_MASTER_DATA_TYPES`
(`backend/app/modules/masterdata/models.py:15-27`) and seed rows in the same
migration (codes are illustrative — confirm labels with the user before seeding):

| type | code | label | sort_order |
|---|---|---|---|
| special_category | VIP | VIP | 10 |
| special_category | SENIOR_CITIZEN | Senior Citizen | 20 |
| special_category | EMERGENCY | Emergency | 30 |

`sort_order` doubles as the **priority ranking** used in queue ordering (lower
`sort_order` = higher priority) — this avoids a second hardcoded rank mapping
and keeps the ranking admin-configurable via the existing master-data screens.

### 4.5 `visit_type` extension: `token_prefix` column

Add a `token_prefix VARCHAR(10)` column to `master_data` (nullable; only
meaningful for `type='visit_type'` rows). Data-migration step seeds
`token_prefix = 'OP'` for all five existing `visit_type` rows
(`NEW, REVIEW, ONLINE, INPERSON, CAMP`). Adding `IP` later = seeding new
`visit_type` (or `consultation_category`) rows with `token_prefix = 'IP'` —
**no code change**.

> **Open question to confirm before seeding**: is the OP/IP split actually
> driven by `visit_type`, or by something else (e.g. `consultation_category`,
> or a ward/admission flag that doesn't exist yet)? Since the user said
> "consider now all as OP", this is moot for the initial cut, but worth getting
> right before IP is added — don't guess at that point, ask again.

---

## 5. Backend changes

### 5.1 New permission: `manage_queue`

The existing permission matrix doesn't cover "Doctor + Reception + Admin" as a
clean group (`DOCTOR` lacks `edit_patient`; `RECEPTION`/`DATA_ENTRY` lack
`add_consultation` — see §2 table). Add a dedicated permission in
`backend/app/core/permissions.py`:

```python
PERM_MANAGE_QUEUE = "manage_queue"
# add to ALL_PERMISSIONS

ROLE_PERMISSIONS = {
    ROLE_ADMIN: ALL_PERMISSIONS,
    ROLE_DOCTOR: frozenset({..., PERM_MANAGE_QUEUE}),
    ROLE_RECEPTION: frozenset({..., PERM_MANAGE_QUEUE}),
    ROLE_DATA_ENTRY: frozenset({...}),   # NOT granted
}
```

This single permission gates: setting/changing `priority_level`, marking a
visit complete, and viewing/using the queue screen. Requires a migration to
seed the new permission row + role_permission links if the role-permission
matrix is DB-backed (verify — `resolve_permissions()` reads from
`ROLE_PERMISSIONS` in code per `permissions.py:97-102`, but check whether
`/me/permissions` also requires a `permissions`/`role_permissions` table sync).

### 5.2 `visits` module additions (`backend/app/modules/visits/`)

**`complete_visit` workflow** — new, explicit endpoint (not the generic `PUT`,
to keep the OPEN→COMPLETED transition auditable and intentional):

- `service.py`: `complete_visit(db, visit_id, actor)`:
  - Loads the visit `FOR UPDATE` (optimistic concurrency via `version`, matching `update_visit` pattern at `service.py:222-272`)
  - Validates current `status == "OPEN"` (raise a domain error like `invalid_visit_status` otherwise)
  - Sets `visit.status = "COMPLETED"`, bumps `version`
  - Also updates the linked `visit_queue.status = "COMPLETED"` row in the same transaction (keeps the denormalized copy in sync)
  - Writes `audit_log` entry `action="visit.complete"` (per CLAUDE.md — sensitive action)
- `router.py`: `POST /visits/{visit_id}/complete`, gated by `require_permission(PERM_MANAGE_QUEUE)`
- `schemas.py`: simple `VisitCompleteResponse` (or reuse `VisitOut`)

**`priority_level` plumbing**:
- `schemas.py`: add `priority_level: str | None` to `VisitCreateRequest` / `VisitUpdateRequest` / `VisitOut`
- `service.py` `create_visit` (around `service.py:150-178`):
  - Validate `priority_level` against active `special_category` master-data codes (mirrors how `visit_type_code`/`consultation_category` are validated — find and reuse that helper)
  - Resolve `token_prefix` from the chosen `visit_type_code`'s master-data row
  - Call `generate_queue_token(db, token_prefix, visit_date)` **inside the same transaction** (CLAUDE.md: never generate sequence numbers outside a DB transaction)
  - Create the `VisitQueue` row alongside the `Visit` row
  - Audit entry should capture `priority_level` if set (it affects clinical queue ordering — sensitive per CLAUDE.md)

### 5.3 New module: `backend/app/modules/queue/`

Following the `router.py|service.py|repository.py|models.py|schemas.py` layout
(CLAUDE.md module-layout rule):

- **`models.py`**: `VisitQueue`, `QueueTokenSequence` ORM models (or these could live in `visits/models.py` and `masterdata/models.py` respectively if that fits the existing module-seam philosophy better — decide at implementation time based on import-cycle considerations)
- **`schemas.py`**: `QueueEntryOut` (token_label, patient summary incl. OP number & name, doctor, visit_type, priority_level + label, status, created_at), `QueueListResponse`
- **`repository.py`**: `list_queue(db, *, queue_date, status, doctor_id, page, page_size)` — single query joining `visit_queue` → `visits` → `patients` → `users` (doctor), with:
  ```sql
  ORDER BY
      CASE WHEN priority_level IS NULL THEN 1 ELSE 0 END,   -- priority entries first
      priority_sort_order ASC,                               -- from master_data.sort_order, lower = higher priority
      token_number ASC
  ```
  (Resolve `priority_sort_order` via a join to `master_data WHERE type='special_category'`, or cache the mapping — avoid N+1.)
- **`service.py`**: thin orchestration + permission checks; delegates SQL to repository (CLAUDE.md: no SQL outside repositories)
- **`router.py`**:
  - `GET /queue?date=YYYY-MM-DD&status=OPEN|COMPLETED&doctor_id=<uuid>&page=&page_size=` — gated by `PERM_MANAGE_QUEUE` (or a read-only variant if broader visibility is wanted later)
  - Mount under the main API router alongside `visits`/`patients`

### 5.4 New module/sub-resource: doctor↔staff mapping

Could be a new `backend/app/modules/staff_assignments/` module, or a
sub-resource nested under `users` (`/users/{id}/doctors`) — lean toward the
latter to avoid a near-empty module, but either is acceptable; decide based on
how much independent logic accrues.

- Endpoints (Administrator-only — gate with `PERM_MANAGE_USERS`, the existing permission for user administration):
  - `GET /users/{staff_id}/doctors` — list assigned doctors + which is primary
  - `PUT /users/{staff_id}/doctors` — replace the full assignment set (simplest for an admin "pick doctors + mark one primary" UI); body: `{ doctor_ids: [uuid], primary_doctor_id: uuid | null }`
- `service.py` validates: all `doctor_ids` reference users with `is_doctor=true`; `primary_doctor_id` (if set) is in `doctor_ids`; enforces the "at most one primary" constraint at the application layer too (defense in depth alongside the partial unique index)
- Audit entry on changes (`action="staff_assignment.update"`) — affects clinical routing, sensitive per CLAUDE.md

### 5.5 Convenience endpoint for the queue screen's doctor selector

`GET /me/doctors` (or `/users/me/doctors`) — returns the current user's
assigned doctors (empty list if none, single entry if one, multiple if several)
plus which is `is_primary`. Frontend uses this to decide read-only-vs-dropdown
(see §6.2). Could be folded into the existing `/me` or `/me/permissions`
response instead of a new endpoint — decide based on payload size/caching needs.

---

## 6. Frontend changes

### 6.1 `VisitFormDialog.tsx` — priority checkbox + dependent dropdown

Mirrors the existing `is_scheduled` → conditional `visit_date` constraint
pattern already in this file (`isScheduled = form.watch("is_scheduled")`,
conditional `FormDescription`):

- Add a checkbox "Priority visit" (`is_priority`, client-side only — not sent to the API as a separate field)
- When checked, reveal a `priority_level` `Select` populated from
  `masterDataApi.list("special_category")` (same pattern as `visit_type_code`/`consultation_category` — `useQuery` + `enabled: open`)
- When unchecked, `priority_level` is submitted as `null`
- Extend `lib/validation/visits.ts` (`visitSchema`) with `priority_level: z.string().nullable().optional()`
- Extend `types/visits.ts` `Visit`/`VisitCreateRequest`/`VisitUpdateRequest` with `priority_level: string | null`

### 6.2 New screen: `frontend/src/features/queue/QueuePage.tsx`

- Route registration (wherever `PatientProfilePage`/other top-level pages are routed — likely `App.tsx` or a router config file)
- Layout:
  - Date picker (defaults to today, `new Date().toISOString().slice(0,10)` per existing convention in `VisitFormDialog.tsx:49`)
  - Doctor selector:
    - Fetch `GET /me/doctors`
    - **Zero assigned doctors** → unfiltered doctor dropdown (existing `usersApi.list({ is_doctor: true })` pattern) + a hint like "No doctor assigned — contact an administrator"
    - **One assigned doctor** → render as **read-only/disabled** text (per user's explicit spec — "non-editable doctor")
    - **Multiple assigned doctors** → `Select` dropdown, pre-selected to the `is_primary` entry, user can switch
    - **Current user is a doctor** (`is_doctor=true`) → default to self, read-only, skip the `/me/doctors` lookup
  - Two `Tabs`: **"Open"** and **"Completed"**, each rendering a `DataTable` (reuse `DataTable`/`Column` from `@/components/DataTable.tsx`, matching `VisitsTab.tsx` conventions) with columns: Token (formatted label + priority badge), Patient (name + OP number, link to patient profile), Doctor, Visit type, Created/arrival time, and (Open tab only) a **"Complete"** action button
  - `useQuery` per tab: `queryKey: ["queue", { date, status, doctorId }]`, `queryFn: () => queueApi.list({ date, status, doctor_id })`
  - `useMutation` for "Complete": `queueApi.complete(visitId)` → on success, invalidate both `["queue", { date: ..., status: "OPEN" }]` and `["queue", { ..., status: "COMPLETED" }]` query keys so the row visibly moves tabs
- New `frontend/src/api/queueApi.ts` (mirrors `visitsApi.ts` structure):
  ```ts
  export const queueApi = {
    list: (params: { date: string; status: "OPEN" | "COMPLETED"; doctor_id?: string; page?: number; page_size?: number }) =>
      apiClient.get<PaginatedResponse<QueueEntry>>("/queue", { params }).then(r => r.data),
    complete: (visitId: string) =>
      apiClient.post<Visit>(`/visits/${visitId}/complete`).then(r => r.data),
    myDoctors: () =>
      apiClient.get<{ doctors: DoctorAssignment[] }>("/me/doctors").then(r => r.data),
  };
  ```
  > **Note**: confirm whether `/queue` returns a paginated envelope or a plain
  > array before writing this — given the `visitsApi.list` contract-mismatch bug
  > fixed earlier in this session, **do not assume**; check the actual
  > `response_model` on the new router endpoint once written, and make
  > `queueApi`/MSW mocks match it exactly.

### 6.3 New admin screen: `frontend/src/features/admin/DoctorStaffMappingPage.tsx`

- Administrator-only route (gate via `usePermissions().hasPermission(PERMISSIONS.MANAGE_USERS)`, matching existing patterns in e.g. `PatientsListPage`/admin areas)
- Simple two-step picker: select a staff member (search/select from `usersApi.list()` filtered to non-doctor roles), then multi-select their doctor(s) with a radio/checkbox to mark one as primary
- `useMutation` calling `PUT /users/{staffId}/doctors`

### 6.4 New types & MSW mocks

- `types/queue.ts`: `QueueEntry`, `DoctorAssignment`
- `frontend/src/test/mocks/handlers.ts`: add handlers for `GET /queue`, `POST /visits/:id/complete`, `GET /me/doctors`, `GET/PUT /users/:id/doctors` — **shape them to match the real backend `response_model`s exactly** (the `visits.list` bug earlier in this session was caused by a mock that didn't match reality and masked a real contract mismatch — don't repeat that)

---

## 7. Tests

- **Backend** (`docker compose exec api pytest tests/ -x -q --tb=short`):
  - `queue_token_sequence` concurrency: parallel `generate_queue_token` calls for the same `(prefix, date)` must never collide — mirror whatever concurrency test exists for `generate_op_number` (find it under `backend/tests/`)
  - Daily reset: tokens for `2026-06-07` and `2026-06-08` for the same prefix both start at 1
  - `complete_visit`: status transition validation (rejects completing an already-COMPLETED/CANCELLED visit), optimistic-concurrency `version` check, audit-log entry written, `visit_queue.status` kept in sync
  - RBAC: `PERM_MANAGE_QUEUE` enforced on `/queue`, `/visits/{id}/complete`, priority-setting on create/update — verify `DATA_ENTRY` role gets 403
  - `priority_level` validation: rejects codes not in active `special_category` master data
  - Doctor-staff mapping: uniqueness constraints, "at most one primary", `is_doctor=true` validation on assignment targets
- **Frontend** (`npx vitest run src/features/queue` etc.):
  - `QueuePage`: tab switching, date change refetches, doctor-selector branches (zero/one/many assigned doctors, doctor-as-self), Complete action moves a row between tabs (mock + invalidation)
  - `VisitFormDialog`: priority checkbox reveals/hides dropdown, submits `null` when unchecked (extend existing test file — be careful not to break the `getByLabelText` queries the way the `visit_date` label change did earlier in this session)
  - `DoctorStaffMappingPage`: assignment CRUD, primary-doctor radio behavior

---

## 8. Build order (suggested)

1. Migration: all 3 tables + `special_category` seed + `token_prefix` column/seed + new permission row(s)
2. Backend: `permissions.py` (`PERM_MANAGE_QUEUE`) → `visits` module (`complete_visit`, `priority_level` plumbing, token generation in `create_visit`) → new `queue` module → doctor-staff mapping endpoints
3. Frontend: `VisitFormDialog.tsx` priority field → `queueApi.ts` + `QueuePage.tsx` → `DoctorStaffMappingPage.tsx`
4. Tests: backend pytest first (validates the transactional/concurrency-critical pieces), then frontend Vitest + MSW mocks
5. Update `Docs/PHASE_1_API_TASK_CHECKLIST.md` / `PHASE_1_UI_TASK_CHECKLIST.md` if this is tracked there (check whether queue management is already listed as a future-phase item)

---

## 9. Open questions to resurface before/during implementation

1. **OP/IP driver**: confirm whether the prefix should ultimately be driven by `visit_type`, `consultation_category`, or something else entirely once IP is actually in scope — don't guess at that point.
2. **`/queue` response shape**: paginated envelope vs. plain array — check the router's `response_model` once written; don't let MSW mocks mask a mismatch (see §6.2 note).
3. **Doctor-staff mapping screen permission**: confirmed as Administrator-only by assumption (§3.3) — verify with the user if it matters before building.
4. **`special_category` codes/labels**: `VIP` / `SENIOR_CITIZEN` / `EMERGENCY` are illustrative — confirm the actual list and display labels the clinic wants before seeding.
5. **`visit_queue.status` vs `visits.status` denormalization**: confirm this dual-write approach is acceptable, or whether a live join is preferred (simpler consistency, marginal perf cost at this scale — likely fine to join live given expected daily volumes; denormalization may be premature optimization worth dropping).
