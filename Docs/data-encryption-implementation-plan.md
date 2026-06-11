# Data Encryption-at-Rest Implementation Plan (Application-Layer Column Encryption)

**Status:** Draft for review
**Author:** Engineering
**Created:** 2026-06-11
**Scope:** Phase 1 backend (`backend/app/...`) — encrypt confidential PII/PHI columns so that a
database administrator (DBA) with direct SQL access cannot read patient-identifying data; only the
application, on behalf of an authorized user, can decrypt it.

---

## 1. Objective

Add **application-layer AES-256-GCM encryption** to confidential personal/clinical columns so that:

1. Ciphertext is what is physically stored in PostgreSQL — `SELECT * FROM patients` returns
   unreadable blobs for protected columns.
2. The encryption key lives **only in the application environment** (never in the DB, never in
   code), so a DBA / anyone with DB-only access cannot decrypt.
3. **No existing feature regresses** — registration, search (FTS + fuzzy + exact), duplicate
   detection, login, reports (PDF), audit, follow-ups, and merge all continue to work.

This is **transparent column encryption in the application tier**, *not* PostgreSQL `pgcrypto`
(which would require the key to pass through the DB) and *not* full-disk/TDE (which does not protect
against a DBA reading rows). Both of those fail requirement #2.

---

## 2. Why this is non-trivial (the core constraint)

Encrypting a column with a random IV (AES-GCM) produces **different ciphertext every time**, which
means the database can no longer:

- match exact values (`WHERE mobile = :m`),
- enforce `UNIQUE` (email, op_number),
- do `ILIKE`/prefix/partial matches,
- run `pg_trgm` fuzzy similarity (`similarity(full_name, …)`),
- run full-text search (`search_vector @@ plainto_tsquery(...)`).

The application **today depends on all of these**. Confirmed dependencies on plaintext columns:

| Feature | File | Depends on plaintext |
|---|---|---|
| Global search (FTS + trgm + ilike + exact) | [search/repository.py](backend/app/modules/search/repository.py#L52-L82) | `full_name`, `mobile`, `search_vector` |
| Duplicate detection | [patients/repository.py](backend/app/modules/patients/repository.py#L49-L56) | `mobile`, `full_name`, `date_of_birth`, `gender` |
| Generated FTS column | [patients/models.py](backend/app/modules/patients/models.py#L59-L69) | `full_name`, `op_number`, `mobile` |
| Login / user uniqueness | [auth/repository.py](backend/app/modules/auth/repository.py#L33), [users/service.py](backend/app/modules/users/service.py#L109) | `email` |
| Audit / follow-up joins display name | [audit/repository.py](backend/app/modules/audit/repository.py#L28), [followups/repository.py](backend/app/modules/followups/repository.py#L94) | `full_name` (read-only display) |
| PDF reports | [visits/report_service.py](backend/app/modules/visits/report_service.py#L59-L71) | `full_name`, `mobile`, `email` (read-only display) |

**Resolution strategy — split the protected fields into two classes:**

- **Class A — Encrypt-only (no search dependency).** Simple AES-GCM via a SQLAlchemy
  `TypeDecorator`. Zero query changes. Read-only display sites (reports, audit joins) keep working
  automatically because the ORM decrypts on load. **This is the bulk of the PHI and ships first
  with essentially no feature risk.**

- **Class B — Searchable identifiers (`full_name`, `mobile`, `email`, `date_of_birth`).** Need a
  **blind index**: a deterministic, keyed `HMAC-SHA256` stored in a *sidecar* column the DB *can*
  index/compare, while the real value column holds AES-GCM ciphertext. Exact match and uniqueness
  use the blind-index column. Fuzzy/FTS name search is rebuilt on **keyed trigram blind indexes**
  (see §7). This is the higher-effort phase and is rolled out behind a feature flag.

This split lets us deliver the high-value, low-risk encryption (clinical notes, address, DOB,
diagnoses, prescriptions) immediately, and tackle searchable identifiers carefully afterward.

---

## 3. Cryptographic design

- **Cipher:** AES-256-GCM (AEAD — confidentiality + integrity/tamper-detection). The `cryptography`
  package is already transitively available (`python-jose[cryptography]`); add it as a direct,
  pinned dependency.
- **Per-value format (stored as `BYTEA`/base64 text):**
  `version(1 byte) || key_id(1 byte) || nonce(12 bytes) || ciphertext || tag(16 bytes)`.
  The `version`/`key_id` prefix makes **key rotation** and algorithm upgrades possible without a
  flag day (old rows decrypt with the old key; new writes use the current key).
- **Associated data (AAD):** bind each ciphertext to its `table.column` (and optionally row id) so a
  blob cannot be copied from one column/row to another. Prevents cut-and-paste attacks by a DBA.
- **Blind index (Class B):** `HMAC-SHA256(blind_index_key, normalize(value))`, stored as a separate
  `bytea`/`char(32)` column, indexed with a normal B-tree (exact/unique) — uses a **different key**
  from the encryption key so leaking one does not leak the other.
- **Keys & key management:**
  - `FIELD_ENCRYPTION_KEY` (32 bytes, base64) and `BLIND_INDEX_KEY` (32 bytes, base64) supplied via
    environment (same pattern as `JWT_SECRET_KEY` in [core/config.py](backend/app/core/config.py#L53)).
  - Support a small **keyring** (`{key_id: key}`) so rotation is additive. `key_id` selects the
    active write key.
  - Production startup **fails fast** if keys are missing or set to a dev sentinel — mirror the
    existing `_require_secrets_in_production` validator in [core/config.py](backend/app/core/config.py#L98-L121).
  - Document an upgrade path to AWS KMS / Vault (envelope encryption) — out of scope for Phase 1 but
    the `key_id` prefix already accommodates it.

---

## 4. Field classification (what gets encrypted)

Legend: **A** = encrypt-only (TypeDecorator, no query change) · **B** = searchable (encrypt +
blind index) · **—** = stays plaintext (operational/non-sensitive).

### `patients`
| Column | Class | Notes |
|---|---|---|
| `full_name` | **B** | exact + fuzzy + FTS search, duplicate detection |
| `mobile` | **B** | exact + ilike search, duplicate detection |
| `email` | **B** | exact match (no current search, but unique-ish) |
| `date_of_birth` | **B** | exact match in duplicate detection; encrypt value, blind-index for equality |
| `address_line`, `city`, `state`, `pincode` | **A** | high-sensitivity PII, not searched |
| `age_years`, `height_cm`, `weight_kg`, `blood_group` | **A** | biometric PHI, not searched |
| `profession`, `marital_status`, `remarks` | **A** | personal / free-text |
| `op_number`, `op_category_code` | — | operational key (immutable, joined, ranked) |
| `gender`, `dietary_preference`, `status`, `merged_into`, `is_historical` | — | low-sensitivity codes / filter flags |

### `users`
| Column | Class | Notes |
|---|---|---|
| `email` | **B** | login lookup + uniqueness |
| `mobile` | **A** | staff contact (not searched) |
| `full_name` | **A** | staff name (displayed, not searched) |
| `username`, `password_hash`, credentials, status | — | username is the login key; password already hashed |

### `case_sheets`  (all **A** — not searched)
`hereditary_diseases`, `hereditary_diseases_mother`, `hereditary_diseases_father`, `past_ailments`,
`surgeries`, `present_complaints`, `deliveries`, `appetite`, `sleep`, `motion`, `energy_level`,
`exercise_routine`, `other_observations`, `remarks`.
(`normal_deliveries`, `caesarian_deliveries` are smallint counts — encrypt as **A** only if required;
deferred by default to avoid type churn.)

### `consultation_notes` (all **A**)
`presenting_complaints`, `diagnosis`, `observations`, `treatment_advice`, `diet_advice`, `yoga_advice`.

### `discharge_summaries` (all **A**)
`diagnosis`, `presenting_complaints`, `investigations_admission`, `treatments`, `medications`,
`discharge_advice`, `yoga_guidance`, `condition_notes`, `follow_up_period`.

### `prescriptions` (all **A**)
`medicine_details`, `instructions`, `review_advice`.

### `prescription_items` (all **A**)
`medicine_name`, `dosage`, `usage_instruction`, `timing`, `duration`.

### `documents` (all **A**)
`storage_ref` (object-store key), `file_name`, `title`, `remarks`.

### `follow_ups` / `merge_requests` (all **A**)
`reason`, `remarks` / `reason`, `decision_remarks`.

### `audit_log`
`old_value`, `new_value` (JSONB), `description`, `ip_address` → **A** (encrypt JSONB as a text blob;
keep `action`, `entity_type`, `entity_id`, `user_id`, `patient_id`, `created_at` plaintext for
querying). **Note:** these snapshots will *already* contain ciphertext once the source models
encrypt, so re-encrypting is optional/defense-in-depth — see Task ENC-T6.

### No encryption (entirely operational)
`roles`, `master_data`, `op_sequence`, `user_roles`, `backup_log`, `patient_aliases.old_op_number`.

---

## 5. Components to build

```
backend/app/core/crypto/
  __init__.py
  keyring.py        # load keys from env, keyring {key_id: key}, active key selection, prod fail-fast
  cipher.py         # aes_gcm_encrypt(plaintext, aad) / aes_gcm_decrypt(blob, aad); versioned format
  blind_index.py    # hmac_blind_index(value, *, normalize) for exact + trigram tokens
  types.py          # SQLAlchemy TypeDecorators: EncryptedString, EncryptedText, EncryptedJSON,
                    #   EncryptedDate; bind AAD via column context
```

- `EncryptedString/Text` (Class A): `process_bind_param` → encrypt; `process_result_value` → decrypt.
  Underlying DB column becomes `BYTEA` (or `TEXT` holding base64). Transparent to all callers.
- For Class B, the model keeps the encrypted value column **plus** a generated/maintained
  `*_bidx bytea` blind-index column, populated by the service/`TypeDecorator` event hook.

---

## 6. Implementation phases & task list

> Migration convention: current Alembic head is **`0012`** (verify with
> `docker compose exec api alembic heads` before writing each migration); chain new revisions
> `0013 → 0014 → …`. All migrations run at container startup (existing pattern).
> Tests run via `docker compose exec api pytest tests/ -x -q --tb=short`.

### Phase 0 — Crypto foundation (no schema change) `[ENC-T0]`
- [ ] **ENC-T0.1** Add pinned `cryptography>=42,<43` to `backend/requirements.txt`.
- [ ] **ENC-T0.2** Add settings to [core/config.py](backend/app/core/config.py): `field_encryption_key`,
      `blind_index_key`, `field_encryption_key_id` (active), optional `field_encryption_keyring`
      (JSON `{id: b64key}`); add dev sentinels + extend `_require_secrets_in_production`.
- [ ] **ENC-T0.3** Implement `core/crypto/keyring.py` — parse/validate 32-byte keys, expose active
      key + lookup by `key_id`, fail-fast on bad length.
- [ ] **ENC-T0.4** Implement `core/crypto/cipher.py` — versioned AES-GCM encrypt/decrypt with AAD.
- [ ] **ENC-T0.5** Implement `core/crypto/blind_index.py` — keyed HMAC; value normalization
      (trim, casefold, strip spaces for mobile/email; unicode-normalize names).
- [ ] **ENC-T0.6** Implement `core/crypto/types.py` TypeDecorators (`EncryptedString`,
      `EncryptedText`, `EncryptedJSON`, `EncryptedDate`).
- [ ] **ENC-T0.7** Unit tests: round-trip encrypt/decrypt, tamper → `InvalidTag`, AAD mismatch
      rejection, NULL passthrough, blind-index determinism, key-rotation (decrypt old `key_id`).
- [ ] **ENC-T0.8** Add `.env.example`, `docker-compose.dev.yml`, and `.env.dev` entries with dev
      keys; document key generation (`openssl rand -base64 32`) in `Docs/`.

### Phase 1 — Class A: non-searchable PHI (zero feature risk) `[ENC-T1..T6]`
Each table below: (a) switch model columns to `Encrypted*` types, (b) Alembic migration to change
column type to `BYTEA` **with in-place data backfill** (read plaintext → encrypt → write), (c) tests.

- [ ] **ENC-T1 `patients` (Class A subset):** `address_line`, `city`, `state`, `pincode`,
      `age_years`†, `height_cm`†, `weight_kg`†, `blood_group`, `profession`, `marital_status`,
      `remarks`. († numeric/text-cast: store as encrypted text, cast in service layer.)
- [ ] **ENC-T2 `case_sheets`:** all free-text intake/clinical columns (see §4).
- [ ] **ENC-T3 `consultation_notes`:** clinical columns (see §4).
- [ ] **ENC-T4 `discharge_summaries`:** clinical columns (see §4).
- [ ] **ENC-T5 `prescriptions` + `prescription_items`:** medicine/instruction columns (see §4).
- [ ] **ENC-T6 `documents`, `follow_ups`, `merge_requests`, `users.full_name`/`users.mobile`,
      `audit_log` blobs:** remaining Class A columns.
  - For each: model change + backfill migration + targeted test asserting round-trip and that a
    raw SQL `SELECT` returns non-plaintext.

**Acceptance for Phase 1:** full existing test suite green; a raw
`docker compose exec db psql -c "SELECT diagnosis FROM consultation_notes LIMIT 1"` shows ciphertext;
PDF report + audit views still render decrypted values via the API.

### Phase 2 — Class B: searchable identifiers `[ENC-T7..T10]`
Rolled out behind `ENCRYPT_IDENTIFIERS` feature flag; each field gets an encrypted value column +
blind-index sidecar.

- [ ] **ENC-T7 Blind-index plumbing:** add `*_bidx` columns + service/event hooks that recompute the
      blind index whenever the encrypted value is set. Backfill migration computes bidx for existing
      rows.
- [ ] **ENC-T8 `patients.mobile` / `patients.email`:** encrypt value; exact lookups + duplicate
      detection switch to `mobile_bidx`/`email_bidx`. Update
      [patients/repository.py](backend/app/modules/patients/repository.py) and
      [search/repository.py](backend/app/modules/search/repository.py) exact-match branches.
  - **Substring phone search caveat:** today `mobile.ilike('%9876%')`
    ([search/repository.py](backend/app/modules/search/repository.py#L52)) supports partial-number
    search; a plain blind index only does exact match. Decision required (see §7): (a) add a phone
    n-gram/suffix blind index to preserve substring search, or (b) accept exact/normalized-only
    phone match. Recommend (a) for parity.
- [ ] **ENC-T9 `users.email`:** encrypt value; replace `func.lower(User.email) == …` login lookup
      ([auth/repository.py](backend/app/modules/auth/repository.py#L33)) and `email_exists`
      uniqueness ([users/service.py](backend/app/modules/users/service.py#L109)) with `email_bidx`
      equality; drop the DB `UNIQUE(email)` constraint and replace with `UNIQUE(email_bidx)`.
- [ ] **ENC-T10 `patients.full_name` + `date_of_birth`:** encrypt values; exact/duplicate match via
      blind index. **Fuzzy/FTS name search rebuild — see §7.**

### Phase 3 — Hardening `[ENC-T11..T13]`
- [ ] **ENC-T11** Key-rotation runbook + `scripts/rotate_field_keys.py` (re-encrypt rows to new
      `key_id`, recompute blind indexes, batched, resumable).
- [ ] **ENC-T12** Backup/restore validation: confirm `pg_dump`/restore preserves ciphertext and that
      restore on a host **without** the key cannot read PHI (proves DBA-blindness).
- [ ] **ENC-T13** Security review + docs: update `CLAUDE.md` Key Rules, SAD §10, and add an
      "encrypted columns" reference table; threat-model sign-off.

---

## 7. Search preservation strategy (the hard part — `full_name`)

### 7.0 Exactly what changes per query type

Audited against [search/repository.py](backend/app/modules/search/repository.py):

| Query capability | Current implementation | After encryption |
|---|---|---|
| OP number — exact, partial, alias | `op_number.ilike`, alias exact | ✅ **No impact** — `op_number`/aliases stay plaintext (primary lookup) |
| Phone — exact | `mobile == m` (rank boost) | ✅ `mobile_bidx` |
| Phone — substring (`'%9876%'`) | `mobile.ilike` | ⚠️ **Regresses** w/ plain bidx → needs phone n-gram/suffix bidx (ENC-T8) or exact-only |
| Name — exact / duplicate detect | `full_name == n` | ✅ `full_name_bidx` |
| Name — partial / fuzzy | `full_name.ilike`, `similarity()>0.2` | ✅ keyed trigram bidx (§7.1) |
| Full-text omnibox | `search_vector @@ plainto_tsquery` | ✅ generated col dropped → trigram bidx ranking |
| Category / status filters | `op_category_code`, `status` `==` | ✅ **No impact** — stay plaintext |
| Sort by name (`order_by full_name`) | alpha sort | ⚠️ ciphertext sorts meaninglessly → sort in app, or keep a normalized-initial plaintext sort key |

**Net:** the common lookups (OP number, exact phone, exact/fuzzy name, duplicate detection, alias)
are preserved. Two items need explicit handling — **substring phone** (ENC-T8) and **alphabetical
name sort** (sort post-decrypt in the service, or store a coarse non-identifying sort key).

### 7.1 Fuzzy name search rebuild

Exact match and uniqueness are solved by blind indexes. Fuzzy/full-text on an encrypted name needs a
replacement for `pg_trgm`/`tsvector`. Options, in recommended order:

1. **Keyed trigram blind index (recommended).** On write, tokenize `normalize(full_name)` into
   trigrams, HMAC each, store the set in a `full_name_trgm_bidx bytea[]` column with a `GIN` index.
   On search, tokenize the query the same way and match by overlap; rank by number of matching
   trigrams. The DBA sees only keyed hashes; fuzzy UX is preserved. Replaces `similarity()` and the
   generated `search_vector` for names. **Drop the generated `search_vector` column** (it cannot be
   computed from ciphertext) and rebuild ranking from the trigram-bidx overlap + exact
   mobile/op-number boosts that already exist in
   [search/repository.py](backend/app/modules/search/repository.py#L80-L82).
2. **Prefix blind index.** Store HMACs of normalized prefixes (1..N chars) for type-ahead. Cheaper,
   supports "starts-with" only.
3. **Application-side decrypt + in-memory fuzzy.** Acceptable only for a small clinic dataset; does
   not scale and is the fallback, not the default.

`op_number` stays plaintext, so the most common lookup (exact OP) is unaffected. Mobile exact match
via blind index also unaffected. Only **fuzzy name** search needs the trigram-bidx rebuild, isolated
to the `search` module.

---

## 8. Data migration / backfill strategy

For every column being encrypted:

1. **Expand** — add new `bytea` column (`<col>_enc`) and any `*_bidx` column. Online, nullable.
2. **Backfill** — batched migration (or one-off script for large tables) reads plaintext, writes
   ciphertext + blind index. Idempotent and resumable (skip already-encrypted rows by format prefix).
3. **Cut over** — point the ORM at the encrypted column; for in-place type changes use
   `ALTER ... USING` within the migration after backfill.
4. **Contract** — drop the plaintext column / old index in a *follow-up* migration once verified, so
   a fast rollback is possible mid-rollout.

Backfill runs inside the API container (it has the key); never decrypt/encrypt in `psql`. Keep
batches small (e.g. 1–5k rows) and log progress to `backup_log`-style output, not PHI.

---

## 8.5 Log & audit redaction (sensitive data exclusion) `[ENC-T-LOG]`

**Current state (already implemented — keep, don't regress):**

- **Application logs** ([core/logging.py](backend/app/core/logging.py)) — `JSONFormatter` emits only an
  allow-list (`ALLOWED_EXTRA_KEYS`: request_id, user_id, role, method, route_template, status,
  latency, exc_type, action, entity_type). `RedactionFilter` + `_redact()` replace any
  `SENSITIVE_KEYS` with `***REDACTED***`. Request/response bodies are never logged;
  `sqlalchemy.engine` is pinned to WARNING and `SQL_ECHO=false` (SAD §10.1).
- **Audit log** ([core/audit.py](backend/app/core/audit.py)) — `_sanitize()` strips `SENSITIVE_KEYS`
  from `old_value`/`new_value` JSONB **before** the row is written. So the audit table already does
  **not** persist raw `full_name`, `mobile`, `email`, `diagnosis`, etc.

**Gap found — `SENSITIVE_KEYS` is incomplete (must fix as part of this work):**
The set in [core/logging.py](backend/app/core/logging.py#L14-L40) misses many PHI keys that appear in
audit snapshots, so they currently land in `audit_log.old/new_value` in plaintext. This matters
**more** after column encryption: the ORM decrypts on read, then `_snapshot()` would re-expose the
value into the (unencrypted) audit JSONB unless the key is redacted.

- [ ] **ENC-T-LOG.1** Extend `SENSITIVE_KEYS` to cover all encrypted columns (§4), at minimum:
      `city`, `state`, `pincode`, `blood_group`, `profession`, `marital_status`, `height_cm`,
      `weight_kg`, `age_years`, `remarks`, `surgeries`, `past_ailments`, `hereditary_diseases`,
      `hereditary_diseases_mother`, `hereditary_diseases_father`, `present_complaints`, `appetite`,
      `sleep`, `motion`, `energy_level`, `exercise_routine`, `deliveries`, `other_observations`,
      `medications`, `treatments`, `instructions`, `medicine_details`, `usage_instruction`,
      `diet_advice`, `yoga_advice`, `yoga_guidance`, `investigations_admission`, `discharge_advice`,
      `review_advice`, `condition_notes`, `follow_up_period`, `reason`, `decision_remarks`,
      `signature_object_key`. **Single source of truth** — derive the audit redaction set and the
      encrypted-column set from one list so they can't drift.
- [ ] **ENC-T-LOG.2** Add a test asserting every Class A/B column name from §4 is present in
      `SENSITIVE_KEYS` (guards against future columns leaking into audit/logs).
- [ ] **ENC-T-LOG.3** Backfill scripts (§8) and `rotate_field_keys.py` must log **counts/ids only**,
      never field values; add a test/lint check that the scripts don't log row contents.
- [ ] **ENC-T-LOG.4** Confirm no new debug/`print`/`logger.info(row)` paths are introduced by the
      encryption code that could emit decrypted values; `SQL_ECHO` stays `false` everywhere.

> Note: because audit snapshots redact sensitive keys, `audit_log.old/new_value` hold mostly
> non-sensitive fields (ids, codes, status, version) — so re-encrypting those JSONB blobs (ENC-T6)
> is defense-in-depth, not strictly required. Prioritize closing the `SENSITIVE_KEYS` gap first.

---

## 9. Testing strategy

- **Unit:** cipher round-trip, tamper detection, AAD binding, NULL handling, key rotation,
  blind-index determinism + trigram overlap ranking.
- **Integration (Docker):** register patient → raw `psql` shows ciphertext → API GET returns
  plaintext; search by OP / exact phone / exact + fuzzy name still returns the patient; **substring
  phone** search behaves per the ENC-T8 decision; results still **sort by name** correctly;
  duplicate detection still fires; login by email works; PDF report renders correct name/mobile;
  audit list shows patient/user names.
- **Redaction:** assert `audit_log.old/new_value` for a patient create/update contains
  `***REDACTED***` (not the raw value) for every PHI key; assert app logs never emit a known PHI
  value (ENC-T-LOG.1/.2).
- **Migration tests:** seed plaintext rows, run backfill migration, assert ciphertext at rest +
  correct decryption via ORM.
- **Negative:** start API with wrong key → decryption fails loudly (no silent plaintext fallback);
  production startup with missing key → refuses to boot.
- Show full `pytest` output per the task checklist requirement before marking tasks `[x]`.

---

## 10. Rollback & safety

- Phased expand/contract means each step is reversible until the plaintext column is dropped.
- Feature-flag Class B (`ENCRYPT_IDENTIFIERS`) so identifier encryption + search rewrite can be
  toggled independently of Class A.
- **Key loss = data loss** — document that keys must be backed up in the secrets manager separately
  from DB backups, and that DB backups alone are useless to an attacker (the point of the feature).
- `SQL_ECHO=false` must remain enforced (already a Key Rule) so the backfill never logs plaintext.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Search/uniqueness regressions on `full_name`/`email` | Blind indexes + trigram-bidx; isolate to search/auth modules; behind flag; integration tests |
| Substring phone search lost / name sort on ciphertext | Phone n-gram/suffix bidx (ENC-T8); sort post-decrypt in service (§7.0) |
| PHI leaking into `audit_log`/app logs via incomplete redaction list | Extend `SENSITIVE_KEYS` to all encrypted columns + drift-guard test (ENC-T-LOG) |
| `search_vector` generated column can't survive encryption | Drop it; rebuild ranking from trigram blind index (§7) |
| Performance (encrypt/decrypt per row, GIN on bidx arrays) | Small clinic dataset; cache decrypted values per request; benchmark search before/after |
| Key mismanagement / loss | Keyring + `key_id` rotation; keys in secrets manager; prod fail-fast; documented backup of keys |
| Index bloat / storage growth (bytea + bidx) | Acceptable at Phase-1 scale; measure in ENC-T12 |
| Partial rollout leaving mixed plaintext/ciphertext | Format-prefix detection makes backfill idempotent/resumable; contract step gated on verification |

---

## 12. Effort estimate (rough)

| Phase | Scope | Est. |
|---|---|---|
| Phase 0 | Crypto foundation + tests | 2–3 days |
| Phase 1 | Class A (all non-searchable PHI, ~8 tables) | 3–4 days |
| Phase 2 | Class B identifiers + search/login/uniqueness rewrite | 4–6 days |
| Phase 3 | Rotation, backup validation, security review, docs | 2–3 days |
| **Total** | | **~2.5–3.5 weeks** |

---

## 13. Open decisions (confirm before build)

1. **Storage encoding** — `BYTEA` (compact, preferred) vs base64 `TEXT` (human-greppable as
   ciphertext). Recommend `BYTEA`.
2. **Fuzzy-name approach** — trigram blind index (§7 option 1, recommended) vs prefix-only vs
   app-side. Affects Phase-2 effort.
3. **Key backend** — env vars for Phase 1 (recommended) vs introduce AWS KMS/Vault now. `key_id`
   prefix keeps either open.
4. **`audit_log` JSONB re-encryption** — encrypt the blobs (defense-in-depth) or rely on the fact
   that snapshots already contain ciphertext once source models are encrypted.
5. **Scope cut** — ship Phase 0 + Phase 1 first (high value, near-zero feature risk) and schedule
   Phase 2 separately?
```
