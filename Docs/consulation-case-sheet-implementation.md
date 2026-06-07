# Consultation Case Sheet — Data Entry & PDF Report Implementation Plan

> Goal: capture the few missing intake fields, then generate a printable / downloadable
> **Online Consultations – Case Sheet** PDF whose header is a pixel-faithful reproduction
> of `Docs/online consulation casesheet.png`. The Print / Download controls live on the
> patient's **Case Sheet** tab (the report's data source), accessible from the consultation
> workflow.

---

## 1. Background & gap summary

The report is a join of **patient master data** (`patients`) + the **case sheet**
(`case_sheets`) for a visit. Most fields already exist. The gaps are:

| # | Report field(s) | Current storage | Action |
|---|---|---|---|
| G1 | `HEREDITARY DISEASES [MOTHER]` / `[FATHER]` (two lines) | single `case_sheets.hereditary_diseases` text | split into `hereditary_diseases_mother` / `hereditary_diseases_father` |
| G2 | `NORMAL DELIVERIES` / `CAESARIAN DELIVERIES` (two counts) | single free-text `case_sheets.deliveries` | add `normal_deliveries` / `caesarian_deliveries` (int) |
| G3 | `SIGNATURE` footer | none | render consulting doctor name (from `visit.doctor_id`) as sign-off block |
| G4 | Whole report (no PDF/print path exists) | nothing | new report endpoint + UI controls |
| G5 | Registration form collects `hereditary_diseases` & `allergies` but `toApiRequest()` drops them and the `Patient` model has no columns | data silently lost | out of scope for the report, tracked separately (see §9) |

There is **no PDF infrastructure today** (no WeasyPrint/ReportLab on the backend, no
jsPDF/print on the frontend). This plan introduces it.

---

## 2. Architectural decision — server-side WeasyPrint (HTML → PDF)

**Chosen approach:** render the report on the **backend** with a Jinja2 HTML template →
WeasyPrint → PDF, exposed via a permission-checked endpoint. The frontend adds **Download**
and **Print** buttons that call it.

Rationale (per `CLAUDE.md` principles):
- "Heavy work (PDF, backup, future OCR) via FastAPI background tasks" — PDF generation
  belongs on the backend.
- "All document downloads are permission-checked proxied or short-lived pre-signed URLs" —
  a backend endpoint enforces RBAC (`export` / `view_medical_history`) authoritatively.
- "All sensitive actions (… export …) write to `audit_log`" — server-side generation lets
  us audit every export with no PII in app logs.
- **Exact, consistent header**: logos embedded as base64 in the template render identically
  on every device/browser, with crisp vector text — unlike client `html2canvas` rasterization.

Rejected alternatives:
- *Client `window.print()` + print CSS* — fast, no deps, but header fidelity and pagination
  vary per browser/printer; no audit; bypasses the documented download policy.
- *Client `jsPDF` + `html2canvas`* — rasterized text (blurry, not selectable, large files).
- *`@react-pdf/renderer`* — crisp, but the header layout must be re-built in its primitives
  and diverges from the rest of the stack.

**UX:** one endpoint, two dispositions.
- **Download** → `GET …/report.pdf?disposition=attachment` → `Content-Disposition: attachment`.
- **Print** → `GET …/report.pdf?disposition=inline` → frontend opens the blob in a hidden
  iframe / new tab and calls `.print()`.

---

## 3. Header reproduction spec (must match exactly)

Three-column band, centered text in the middle column. Logos (already in repo at
`Docs/Arogyam-Logo-{1,2,3}.png`):

| Position | File | Image |
|---|---|---|
| Left | `Arogyam-Logo-1.png` | "SAMVO MANAMSI JANATAM" lotus seal (B/W line art) |
| Center (top) | `Arogyam-Logo-2.png` | **ArogyaM** orange wordmark |
| Right | `Arogyam-Logo-3.png` | "The Sacred Grove" blue triangle/lotus |

Center column text, stacked under the wordmark, centered:
```
The Satsang Foundation – The Sacred Grove,
Pedda Kondamari Village and Post,
Chowdepalle Mandal, Chittoor District,
Andhra Pradesh, India – 517257

+91 8340932384, +91 8333981305 | wellnesscenter@satsang-foundation.org
```
Below the header band:
- Title, centered, bold, underlined: **`ONLINE CONSULTATIONS – CASE SHEET`**
  (derive the leading label from the visit's consultation category; default
  "ONLINE CONSULTATIONS" for the `OC` category).
- OP number, left-aligned, italic green, above the title row (e.g. `OC-0214`).

Styling notes to match the sample: serif-ish/clean sans body; field **labels** in dark
grey/black uppercase, **values** in italic olive-green; two-column field grid for the
identity block; full-width stacked blocks for narrative fields. Footer right-aligned
`SIGNATURE` with the doctor name/line above it.

**Asset handling:** copy the three PNGs into `backend/app/modules/visits/report_assets/`
(committed). At render time read + base64-encode them into `data:image/png;base64,…` URIs
embedded in the template so WeasyPrint needs no network/filesystem lookup.

---

## 4. Data model changes (`case_sheets`)

Add columns (keep existing `hereditary_diseases` and `deliveries` for back-compat / data
migration, mark them deprecated in code comments):

```
hereditary_diseases_mother  TEXT      NULL
hereditary_diseases_father  TEXT      NULL
normal_deliveries           SMALLINT  NULL   -- count, >= 0
caesarian_deliveries        SMALLINT  NULL   -- count, >= 0
```

Migration (`backend/app/migrations/versions/0007_case_sheet_intake_fields.py`):
- `op.add_column` for the four new columns (all nullable).
- Best-effort data backfill: copy `hereditary_diseases` → `hereditary_diseases_mother`
  where the old field is populated (document that historical combined values land in the
  "mother" column and may need manual review). Leave `deliveries` free-text in place; do
  not auto-parse counts.
- `downgrade()` drops the four columns.
- Run inside Docker: `docker compose exec api alembic upgrade head`.

> Optimistic concurrency: new columns are part of the same `case_sheets` row, so the
> existing `version` column already guards them — no extra work.

---

## 5. Backend tasks

All under `backend/app/modules/visits/` unless noted. No SQL outside repositories; service
owns the transaction and `db.commit()`.

1. **Model** (`models.py`): add the four `CaseSheet` columns from §4.
2. **Schemas** (`schemas.py`): add the four fields to `CaseSheetUpsertRequest` and
   `CaseSheetOut` (`normal_deliveries`/`caesarian_deliveries` as `int | None` with `ge=0`).
3. **Repository** (`repository.py`): include new columns in upsert/select mapping.
4. **Report data assembly** (new `report_service.py` or extend `service.py`):
   - Load visit + patient + case sheet + consulting doctor (`visit.doctor_id` → user).
   - Build a typed context dict for the template (formatted dates `dd/mm/yyyy`, computed
     age if only DOB present, masked nothing — this is an authorized clinical export).
   - Permission check: require `export` **and** `view_medical_history` (or `add_consultation`).
   - Write an `audit_log` entry: action `EXPORT_CASE_SHEET`, visit + patient ids, actor.
5. **PDF renderer** (new `report_pdf.py`):
   - Jinja2 `Environment` loading `templates/case_sheet.html` (new
     `backend/app/modules/visits/templates/`).
   - Embed base64 logos (§3) into the context.
   - `weasyprint.HTML(string=…).write_pdf()` → `bytes`.
   - Run generation in a FastAPI background-task-friendly path; for v1 a synchronous render
     is acceptable (single-page doc), but isolate it so it can move to a background task +
     MinIO cache later.
6. **Template** (`templates/case_sheet.html` + scoped CSS, A4 `@page` margins): implement
   header band (§3), identity grid, narrative blocks, hereditary mother/father lines,
   normal/caesarian delivery counts, surgeries / exercise / past ailments, signature footer.
7. **Endpoint** (`router.py`, on `visits_router`):
   - `GET /visits/{visit_id}/case-sheet/report.pdf`
   - query param `disposition: Literal["inline","attachment"] = "attachment"`.
   - `require_permission(EXPORT)` (+ medical-history read) via `Depends`.
   - Return `Response(content=pdf_bytes, media_type="application/pdf",
     headers={"Content-Disposition": f'{disposition}; filename="case-sheet-{op_number}.pdf"'})`.
   - `404` if visit/case sheet missing; `403` handled by dependency.
8. **Dependencies/config**: add `weasyprint` to `backend/pyproject.toml` / requirements;
   ensure the Docker image installs WeasyPrint's native libs (`libpango`, `libcairo`,
   `libgdk-pixbuf`, `libffi`, fonts). Update the `api` service Dockerfile + rebuild.

---

## 6. Frontend tasks

Under `frontend/src/`.

1. **Types** (`types/visits.ts`): add `hereditary_diseases_mother`, `hereditary_diseases_father`,
   `normal_deliveries`, `caesarian_deliveries` to `CaseSheet`, `CaseSheetUpsertRequest`.
2. **Validation** (`lib/validation/visits.ts`): in `caseSheetSchema`, replace the single
   `hereditary_diseases` textarea with mother/father strings; add `normal_deliveries` /
   `caesarian_deliveries` as optional non-negative integer strings (mirror the height/weight
   numeric-string refinement pattern).
3. **Case Sheet form** (`features/visits/CaseSheetTab.tsx`):
   - Update `CASE_SHEET_FIELDS`, `EMPTY_DEFAULTS`, the `form.reset` blocks, and the
     `saveCaseSheet` payload to include the new fields.
   - Render hereditary mother/father as two labelled textareas; render normal/caesarian
     deliveries as two numeric inputs (replace the single "Deliveries" textarea).
4. **API client** (`api/visitsApi.ts`): add
   `getCaseSheetReportPdf(visitId, disposition)` returning a `Blob`
   (`axios.get(url, { params:{disposition}, responseType:"blob" })`).
5. **Print / Download controls** (in `CaseSheetTab.tsx`, header of the tab):
   - **Download PDF** button → fetch blob (attachment), `URL.createObjectURL`, trigger an
     anchor download, revoke URL.
   - **Print** button → fetch blob (inline), open in hidden `<iframe>`, call
     `iframe.contentWindow.print()` on load (fallback: open in new tab).
   - Gate both behind the `export` permission; disable until a saved case sheet exists
     (404 → toast "Save the case sheet before printing").
   - Loading + error states via `sonner` toasts, consistent with existing handlers.
6. **(Optional) entry point from Consultation Notes**: if clinicians expect the button on
   the Consultation Notes tab too, add a thin "Print case sheet" link there that switches to
   / reuses the same `getCaseSheetReportPdf` call for the selected visit.

---

## 7. Testing

**Backend** (`docker compose exec api pytest tests/ -x -q --tb=short`):
- Migration up/down test (extend `test_migrations.py`): new columns exist after upgrade,
  gone after downgrade.
- Case sheet upsert round-trips the four new fields (`test_visits`/case-sheet tests).
- Report endpoint: returns `200 application/pdf`, non-empty body, correct
  `Content-Disposition` for both dispositions; `403` without `export`; `404` for missing
  visit. Assert an `audit_log` row is written.
- Renderer unit test: context builder formats dates `dd/mm/yyyy`, derives age, and the
  template renders without raising for a fully-populated and a sparsely-populated case sheet.

**Frontend** (`vitest`):
- `CaseSheetTab.test.tsx`: new fields render, validate (non-negative integers), and are sent
  in the save payload; Download/Print buttons appear only with `export` permission and are
  disabled when no case sheet exists. Mock the blob endpoint in MSW handlers.

**Manual visual QA (the acceptance gate):** generate a PDF for a sample `OC` visit and
diff the header side-by-side against `Docs/online consulation casesheet.png` — logos in the
correct three positions, address/phone/email lines exact, title underlined, OP number olive
italic, value text olive italic. Iterate on the template CSS until it matches.

---

## 8. Task checklist

### Data model & migration
- [x] Add 4 columns to `CaseSheet` model (`backend/app/modules/visits/models.py`)
- [x] Write migration `0007_case_sheet_intake_fields.py` (add cols + backfill + downgrade)
- [x] Run `docker compose exec api alembic upgrade head`; verify schema

### Backend API
- [x] Extend `CaseSheetUpsertRequest` / `CaseSheetOut` schemas with the 4 fields
- [x] Update repository upsert/select mapping
- [x] Add `weasyprint` dependency + native libs in the `api` Dockerfile; rebuild image
- [x] Copy logos to `backend/app/modules/visits/report_assets/` (1=left, 2=center, 3=right)
- [x] Create `templates/case_sheet.html` + print CSS (header band, identity grid, blocks, signature)
- [x] Implement report context builder (patient + case sheet + doctor; date/age formatting)
- [x] Implement `report_pdf.py` (Jinja2 + base64 logos + WeasyPrint → bytes)
- [x] Add `GET /visits/{visit_id}/case-sheet/report.pdf` endpoint with `disposition` param
- [x] Enforce `export` + medical-history permission; write `audit_log` (`action=EXPORT`, `entity_type=case_sheet`)

### Frontend
- [x] Update `CaseSheet` / `CaseSheetUpsertRequest` types
- [x] Update `caseSheetSchema` (mother/father + 2 delivery counts)
- [x] Update `CaseSheetTab.tsx` form fields, defaults, reset, save payload
- [x] Add `getCaseSheetReportPdf(visitId, disposition)` to `visitsApi.ts`
- [x] Add Download PDF + Print buttons (permission-gated, disabled until saved)
- [ ] (Optional) "Print case sheet" entry from Consultation Notes tab — not implemented; Print/Download live on the Case Sheet tab only (where the data and version live)

### Testing & QA
- [x] Backend: migration, upsert round-trip, endpoint (200/403/404 + audit), renderer
- [x] Frontend: CaseSheetTab field + button tests; MSW blob handler
- [x] Manual header diff vs `Docs/online consulation casesheet.png` until pixel-faithful

### Docs
- [x] Update API spec (`Docs/API_SPECIFICATION_OPENAPI.md`) with the new endpoint
- [x] Note new fields in the data model docs (`Docs/DDL_DATAMODEL.sql` reference)

---

## 9. Out of scope / follow-ups
- **G5 registration data-loss bug**: registration form collects `hereditary_diseases` /
  `allergies` that are never persisted. Fix separately — either wire them through to the
  backend (new patient columns + payload mapping) or remove them from the form. Not required
  for this report (its hereditary data comes from the case sheet).
- Background-task + MinIO caching of generated PDFs (regenerate-on-change) — deferred;
  v1 renders synchronously.
- Multi-page case sheets / additional consultation-category templates beyond `OC`.

## 10. Risks & mitigations
- **WeasyPrint native deps** missing in the image → render 500s. Mitigate: install libs in
  Dockerfile and add a smoke test that renders a trivial PDF at startup/CI.
- **Header fidelity** drift → keep logos as committed assets, base64-embed, and gate merge
  on the manual visual diff (§7).
- **Permission gap** → both endpoint (authoritative) and UI enforce `export`; never rely on
  the UI alone.
- **Historical combined hereditary data** lands in the "mother" column after backfill →
  documented; flag for optional manual cleanup.
