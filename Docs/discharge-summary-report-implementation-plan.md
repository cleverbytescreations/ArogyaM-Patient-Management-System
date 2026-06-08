# Discharge Summary — Data Entry & PDF Report Implementation Plan

> Goal: close the gaps between the **Discharge Summary** input form and the printed
> **Discharge Summary** report (`Docs/Discharge sumary.jpg`, sample CareSeeker IPN0097), then
> generate a printable / downloadable PDF whose layout reproduces that sample. The Print /
> Download controls live on the patient's **Discharge Summary** tab — the report's data source.
>
> Design approach mirrors the already-shipped consultation case-sheet feature
> (`Docs/consulation-case-sheet-implementation.md`): server-side Jinja2 → WeasyPrint, a
> permission-checked endpoint, audited export, base64-embedded logos.

---

## 1. Background & gap summary

The report is a join of **patient master data** (`patients`) + the **discharge summary**
(`discharge_summaries`) for a visit + the **consulting doctor** (`users`). The form already
captures most narrative fields. The gaps below block faithfully reproducing the sample report.

| # | Report element | Current storage | Action |
|---|---|---|---|
| G1 | **Condition of care seeker at Discharge** — descriptive narrative ("Skin patches and Lower back stiffness reduced. Quality of sleep improved") | `condition_at_discharge` is a **coded dropdown** (5 values, `String(40)`) — cannot hold a sentence | Add free-text `condition_notes` (`Text`); keep the coded field for analytics/filtering. Report renders the narrative. |
| G2 | **Follow up period** — long text (~250 chars) | `follow_up_period String(100)`, zod `max(120)` | Widen to `Text` (DB) + raise validation cap to 2000; render multi-line. |
| G3 | **Doctor signature block** — "Dr. Ch. Nikhila, **B.A.M.S**, **Reg. No: 1579/A/2021**" | `users` has `full_name` only — no qualification / registration number | Add `qualification` + `registration_number` (`String`) to `User`; compose signature line. Graceful fallback to name only. |
| G4 | **Care seeker signature block** (left footer) | none | Static print-time placeholder ("Sign of Care Seeker"); no data field. |
| G5 | **Diagnosis/Programme** ("LanghanaM – 15 DAYS") + sub-line of disease names ("Kushtam, Langanam") | single `diagnosis Text` | Keep single field; render as-is (staff type both lines). No structural split in v1 — see §10. |
| G6 | **Investigations at Admission** — numbered checklist of 9 standard items | single free-text `investigations_admission` | v1: render free text as a numbered list (split on newlines). Seed a default 9-item template into the empty textarea so staff start from the standard list. Structured checkbox model deferred (§10). |
| G7 | **Treatments Undertaken** — itemised list (name – duration (ingredients)) | single free-text `treatments` | v1: render free text as a list (split on newlines). Structured items deferred (§10). |
| G8 | **Medications Prescribed** — numbered list with dosage/timing | single free-text `medications` | v1: render free text as a numbered list (split on newlines). Reusing structured `prescription_items` deferred (§10). |
| G9 | **Yoga Asanas** — narrative + italic note "refer to the Yoga asana PDF already shared" | `yoga_guidance Text` | Text matches; the referenced PDF is a manually shared attachment (documents module already exists). No new field in v1. |
| G10 | Whole report — **no PDF / print path exists** for discharge summaries | nothing | New report endpoint + renderer + template + UI controls. |

There **is** PDF infrastructure already (WeasyPrint + Jinja2) used by
`backend/app/modules/visits/report_pdf.py` (case sheet) and
`backend/app/modules/clinical/prescriptions/report_pdf.py` (prescription). This plan follows
that exact pattern; no new dependencies are needed.

---

## 2. Architectural decision — reuse the existing server-side WeasyPrint path

**Chosen approach (unchanged from case sheet / prescription):** assemble a typed context on the
backend, render a Jinja2 HTML template → WeasyPrint → PDF bytes, exposed via a
permission-checked endpoint. Frontend adds **Download** and **Print** buttons.

Rationale (per `CLAUDE.md`): heavy work (PDF) on the backend; downloads are permission-checked;
every export writes `audit_log`; base64-embedded logos render identically everywhere. The two
sibling modules already prove the pattern — we copy it, not invent it.

**UX:** one endpoint, two dispositions (matches prescription):
- **Download** → `GET …/report.pdf?disposition=attachment` → `Content-Disposition: attachment`.
- **Print** → `GET …/report.pdf?disposition=inline` → frontend opens the blob in a hidden
  iframe / new tab and calls `.print()`.

---

## 3. Report reproduction spec (must match the sample)

**Header band** — identical three-logo ArogyaM / Satsang Foundation / Sacred Grove letterhead
already used by the case sheet and prescription reports. Reuse the committed assets
(`seal-left.png`, `wordmark-center.png`, `sacred-grove-right.png`) — copy them into the
discharge module's own `report_assets/` to keep the established per-module layout.

**Identity band** (below header) — two rows, label/value pairs, matching the sample:
- Row 1: `Name` · `Age` · `Sex` · `CareSeeker ID` (= patient `op_number`).
- Row 2: `D.O.A` (admission_date, dd/mm/yyyy) · `D.O.D` (discharge_date) · `Consulting Doctor`.
- Use **"care seeker"** terminology throughout (not "patient"), as the sample does.

**Title:** centered, bold — `DISCHARGE SUMMARY`.

**Body blocks**, in sample order:
1. `Diagnosis/Programme:` — `diagnosis` value (renders both the programme line and the
   disease sub-line as the user typed them).
2. `Presenting Complaints:` — `presenting_complaints` (paragraph).
3. `Investigations at Admission:` — `investigations_admission` rendered as a **numbered list**
   (split on newlines; blank lines ignored).
4. `Treatments Undertaken:` — `treatments` rendered line-by-line.
5. `Condition of care seeker at Discharge:` — **`condition_notes`** (new narrative field);
   if empty, fall back to the coded `condition_at_discharge` label.
6. `Follow up period:` — `follow_up_period` (multi-line).
7. `Advices on Discharge — Do's and Dont's:` — `discharge_advice` (paragraph).
8. `Medications Prescribed:` — `medications` rendered as a **numbered list**.
9. `Yoga Asanas:` — `yoga_guidance` (paragraph; preserve the italic guidance note if present).

**Footer:**
- Left block: `Sign of Care Seeker` (placeholder line).
- Right block: `Sign of the Doctor` with the doctor signature line above the label —
  `{full_name}, {qualification}` then `Reg. No: {registration_number}` (omit missing parts).
- Centered mantra: *SARVE BHAVANTU SUKHINA, SARVE SANTU NIRAMAYA* and the URL
  `https://arogyam.life/`.

**Styling:** match the case sheet / prescription print CSS (A4 `@page` margins, label =
uppercase dark grey, value = body text). Multi-page is expected — the discharge summary is
longer than one page in the sample, so the template must paginate cleanly (repeat nothing but
the `@page` margins; let blocks flow).

---

## 4. Data model changes

### 4a. `discharge_summaries` (`backend/app/modules/clinical/discharge/models.py`)
```
condition_notes      TEXT   NULL    -- G1: free-text narrative shown on the report
follow_up_period     TEXT           -- G2: widen from String(100) to Text
```
Keep `condition_at_discharge` (coded) — it is unchanged and still drives analytics/filtering.

### 4b. `users` (`backend/app/modules/auth/models.py`)
```
qualification         VARCHAR(120)  NULL   -- G3: e.g. "B.A.M.S"
registration_number   VARCHAR(60)   NULL   -- G3: e.g. "1579/A/2021"
```

### 4c. Migration `0009_discharge_report_fields.py`
- `op.add_column` `discharge_summaries.condition_notes` (Text, nullable).
- `op.alter_column` `discharge_summaries.follow_up_period` → `Text` (preserves existing data).
- `op.add_column` `users.qualification`, `users.registration_number` (nullable).
- `downgrade()`: drop the three added columns; alter `follow_up_period` back to `String(100)`
  (document possible truncation risk in the downgrade comment).
- Run inside Docker: `docker compose exec api alembic upgrade head`; never edit schema directly.

> Optimistic concurrency: the new discharge column is on the same row guarded by the existing
> `version` column — no extra work. `users` gets a `version` bump path via its own update flow.

---

## 5. Backend tasks

Discharge work under `backend/app/modules/clinical/discharge/`; user fields under
`backend/app/modules/auth/` + `users` module. No SQL outside repositories; the service owns the
transaction and `db.commit()`.

1. **Models** (§4): add `condition_notes`, widen `follow_up_period`; add `User.qualification`,
   `User.registration_number`.
2. **Discharge schemas** (`schemas.py`): add `condition_notes: str | None` to
   `DischargeSummaryFields` and `DischargeSummaryOut`; change `follow_up_period` cap from
   `max_length=100` to `max_length=2000`.
3. **User schemas** (users module): expose `qualification` / `registration_number` on the
   user create/update requests and user-out schema (admin-only edit; surfaced for the
   signature). Update repository mapping.
4. **Discharge repository** (`repository.py`): include `condition_notes` in insert/update/select
   mapping; ensure widened `follow_up_period` flows through.
5. **Report data assembly** (new `report_service.py`, mirroring
   `prescriptions/report_service.py`):
   - Load discharge summary + patient + consulting doctor (`doctor_id` → `User`).
   - Build typed context: formatted dates (dd/mm/yyyy), computed age, `op_number`, the
     line-split lists for investigations / treatments / medications, the resolved condition
     narrative (with coded-label fallback), and the composed doctor signature line.
   - Permission check: require `PERM_EXPORT` **and** `PERM_VIEW_MEDICAL_HISTORY` (copy the
     guard from `prescriptions/router.py`).
   - Write `audit_log`: `action="EXPORT"`, `entity_type="discharge_summary"`, summary id +
     patient id + actor (use `write_audit` / `extract_request_meta` as prescriptions does).
   - Return `(pdf_bytes, filename)` where filename =
     `discharge-summary-{op_number}-{discharge_date}.pdf`.
6. **PDF renderer** (new `report_pdf.py`): copy the prescription renderer — Jinja2
   `Environment` over `templates/`, `_logo_data_uris()` lru_cache, `render_discharge_pdf(context)`
   → `HTML(string=…).write_pdf()`.
7. **Template** (new `templates/discharge_summary.html` + scoped print CSS): implement §3 —
   header band, identity grid, all body blocks, numbered lists for investigations/medications,
   condition narrative, dual signature footer, mantra + URL. Reuse the case-sheet CSS variables
   for visual consistency.
8. **Assets**: copy the three logo PNGs into
   `backend/app/modules/clinical/discharge/report_assets/` (committed).
9. **Endpoint** (`router.py`, on the discharge router):
   - `GET /visits/{visit_id}/discharge-summary/{summary_id}/report.pdf` (align with the
     existing discharge route shape; if routes are summary-id based, use
     `GET /discharge-summaries/{summary_id}/report.pdf`).
   - query param `disposition: Literal["inline","attachment"] = "attachment"`.
   - Permission guard via `Depends`; `404` if summary missing.
   - Return `Response(content=pdf_bytes, media_type="application/pdf",
     headers={"Content-Disposition": f'{disposition}; filename="{filename}"'})`.
   - **Recommended:** allow report generation only on **finalized** summaries (`is_finalized`),
     or watermark drafts as "DRAFT" — decide with product; default to finalized-only.

No new Python/native dependencies — WeasyPrint and its libs are already in the `api` image.

---

## 6. Frontend tasks

Under `frontend/src/`.

1. **Types** (`types/clinical.ts`): add `condition_notes` to the discharge summary type and
   upsert request; widen any `follow_up_period` expectations. Add `qualification` /
   `registration_number` to the user type if surfaced in user management.
2. **Validation** (`lib/validation/clinical.ts`): add `condition_notes` (optional, max 2000);
   raise `follow_up_period` max from 120 → 2000; render it as a multi-row textarea.
3. **Discharge form** (`features/clinical/DischargeSummaryTab.tsx`):
   - Add `condition_notes` to `TEXT_FIELDS_AFTER_CONDITION` (or as a labelled textarea directly
     below the `condition_at_discharge` dropdown) — label "Condition at discharge (details)".
   - Update `EMPTY_DEFAULTS`, the `form.reset` mapping, and the save payload to include it.
   - Change `follow_up_period` from a 1-row to a multi-row textarea.
   - **G6 default template:** when the form is empty/new, pre-fill `investigations_admission`
     with the standard 9-item list (CBC, FBS, HbA1c, KFT, Lipid profile, Blood group, Urine
     routine analysis, Blood pressure levels, ECG (if above 40 years of age)) so staff edit a
     starting checklist instead of a blank box.
4. **API client** (`api/clinicalApi.ts` or the discharge api module): add
   `getDischargeReportPdf(summaryId, disposition)` returning a `Blob`
   (`responseType:"blob"`). Mirror `visitsApi.getCaseSheetReportPdf`.
5. **Print / Download controls** (header of `DischargeSummaryTab.tsx`):
   - **Download PDF** → fetch attachment blob, `createObjectURL`, anchor-download, revoke.
   - **Print** → fetch inline blob, hidden `<iframe>`, `.print()` on load (fallback new tab).
   - Gate both behind the `export` permission; disable until a saved (and, if enforced,
     finalized) summary exists; surface 404/403 via `sonner` toasts.
6. **User management UI** (if `qualification`/`registration_number` are admin-editable): add the
   two fields to the user create/edit form so doctor signatures render fully. (Optional in v1 —
   reg numbers can be backfilled directly by admins; flag if deferred.)

---

## 7. Testing

**Backend** (`docker compose exec api pytest tests/ -x -q --tb=short`):
- Migration up/down (extend `test_migrations.py`): `condition_notes` + user columns exist after
  upgrade and are gone after downgrade; `follow_up_period` is `Text` after upgrade.
- Discharge upsert round-trips `condition_notes` and a long (>120 char) `follow_up_period`.
- Report endpoint: `200 application/pdf`, non-empty body, correct `Content-Disposition` for both
  dispositions; `403` without `export` + `view_medical_history`; `404` for missing summary;
  asserts an `audit_log` `EXPORT` row is written.
- Renderer unit test: context builder formats dates dd/mm/yyyy, splits investigations /
  treatments / medications into lists, composes the doctor signature (name only / name+qual /
  full), and falls back to the coded condition label when `condition_notes` is empty; template
  renders without raising for fully-populated and sparsely-populated summaries.

**Frontend** (`vitest`):
- `DischargeSummaryTab.test.tsx`: `condition_notes` renders, validates, and is sent in the save
  payload; long follow-up text validates; the 9-item investigations template pre-fills on a new
  form; Download/Print buttons appear only with `export` permission and are disabled until
  saved. Mock the blob endpoint in MSW handlers.

**Manual visual QA (acceptance gate):** generate a PDF for a sample finalized discharge summary
and diff it page-by-page against `Docs/Discharge sumary.jpg` — header logos in the three
positions; identity band rows; all nine body blocks in order; investigations & medications as
numbered lists; condition narrative present; dual signature footer with doctor qual + reg no;
mantra + URL footer. Iterate on the template CSS (especially pagination) until it matches.

---

## 8. Task checklist

### Data model & migration
- [ ] Add `condition_notes` (Text) + widen `follow_up_period` to Text on `DischargeSummary` model
- [ ] Add `qualification` + `registration_number` to `User` model
- [ ] Write migration `0009_discharge_report_fields.py` (add cols + alter + downgrade)
- [ ] Run `docker compose exec api alembic upgrade head`; verify schema

### Backend API
- [ ] Add `condition_notes` to discharge schemas; raise `follow_up_period` cap to 2000
- [ ] Expose `qualification` / `registration_number` on user schemas + repository
- [ ] Update discharge repository insert/update/select mapping for `condition_notes`
- [ ] Copy logo assets to `clinical/discharge/report_assets/`
- [ ] Create `templates/discharge_summary.html` + print CSS (header, identity, blocks, dual signature, mantra)
- [ ] Implement `report_service.py` (context builder, permission guard, audit, filename)
- [ ] Implement `report_pdf.py` (Jinja2 + base64 logos + WeasyPrint → bytes)
- [ ] Add `report.pdf` endpoint with `disposition` param; finalized-only (or DRAFT watermark)
- [ ] Enforce `EXPORT` + `VIEW_MEDICAL_HISTORY`; write `audit_log` (`action=EXPORT`, `entity_type=discharge_summary`)

### Frontend
- [ ] Update discharge types + user types
- [ ] Update `clinical.ts` validation (`condition_notes`, widen `follow_up_period`)
- [ ] Update `DischargeSummaryTab.tsx`: `condition_notes` field, multi-row follow-up, 9-item investigations template
- [ ] Add `getDischargeReportPdf(summaryId, disposition)` to the api client
- [ ] Add Download PDF + Print buttons (permission-gated, disabled until saved/finalized)
- [ ] (Optional) Add `qualification` / `registration_number` to user management form

### Testing & QA
- [ ] Backend: migration, upsert round-trip, endpoint (200/403/404 + audit), renderer
- [ ] Frontend: DischargeSummaryTab field + button tests; MSW blob handler
- [ ] Manual visual diff vs `Docs/Discharge sumary.jpg` until faithful (incl. pagination)

### Docs
- [ ] Update API spec (`Docs/API_SPECIFICATION_OPENAPI.md`) with the new endpoint
- [ ] Note new fields in the data model docs (`Docs/DDL_DATAMODEL.sql` reference)

---

## 9. Files touched (reference)

| Area | Path |
|---|---|
| Discharge model | `backend/app/modules/clinical/discharge/models.py` |
| Discharge schemas | `backend/app/modules/clinical/discharge/schemas.py` |
| Discharge repository | `backend/app/modules/clinical/discharge/repository.py` |
| Discharge router | `backend/app/modules/clinical/discharge/router.py` |
| Report service (new) | `backend/app/modules/clinical/discharge/report_service.py` |
| Report renderer (new) | `backend/app/modules/clinical/discharge/report_pdf.py` |
| Template (new) | `backend/app/modules/clinical/discharge/templates/discharge_summary.html` |
| Assets (new) | `backend/app/modules/clinical/discharge/report_assets/*.png` |
| User model / schemas | `backend/app/modules/auth/models.py`, users module schemas |
| Migration (new) | `backend/app/migrations/versions/0009_discharge_report_fields.py` |
| Frontend form | `frontend/src/features/clinical/DischargeSummaryTab.tsx` |
| Frontend types | `frontend/src/types/clinical.ts` |
| Frontend validation | `frontend/src/lib/validation/clinical.ts` |
| Frontend api | discharge api client + MSW handlers |
| Pattern references | `backend/app/modules/clinical/prescriptions/{report_service,report_pdf}.py`, `templates/prescription.html` |

---

## 10. Out of scope / follow-ups
- **Structured Investigations / Treatments / Medications** (G6–G8): full child-table models
  (per-item rows with duration, ingredients, dosage, timing) for queryability and guaranteed
  layout. v1 ships free-text-with-list-rendering; revisit if reporting/analytics need structure.
- **Reusing `prescription_items` for discharge medications** (G8): would dedupe the medication
  concept across modules but couples discharge to the prescription workflow — design separately.
- **Diagnosis/Programme structural split** (G5): a dedicated `programme_name` + `duration` +
  `disease_names[]` model for consistent formatting — deferred; single text field in v1.
- **Yoga asana PDF attachment** (G9): link a documents-module file to the discharge summary so
  the referenced PDF is downloadable from the record — deferred; manual share continues.
- Background-task + MinIO caching of generated PDFs (regenerate-on-change) — deferred; v1 renders
  synchronously (consistent with case sheet / prescription).

## 11. Risks & mitigations
- **Pagination** — the discharge summary spans multiple pages; test page breaks don't split a
  block's label from its first line. Mitigate with `break-inside: avoid` on block headers.
- **Coded vs narrative condition** — keeping both fields risks divergence; the report uses
  `condition_notes` with a coded fallback, and the form keeps both visible so staff fill the
  narrative. Document the relationship in field help text.
- **Doctor reg/qualification missing** for legacy users → signature renders name only (graceful);
  prompt admins to backfill the two new user fields for active doctors.
- **Permission gap** → endpoint (authoritative) and UI both enforce `export`; never rely on UI.
- **Draft exports** → default finalized-only (or DRAFT watermark) so unverified summaries aren't
  printed as official documents.
