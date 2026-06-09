# ArogyaM PMS — Performance / Load Tests (TST-T0.4)

## NFR targets (SAD §2.6)

| Scenario | p95 target | Concurrent users |
|----------|-----------|-----------------|
| Patient search | < 1 s | 15–20 (peak 30) |
| Dashboard load | < 2 s | 15–20 (peak 30) |
| Stable 15-min soak | no errors | 15 concurrent |

## Prerequisites

- [k6](https://k6.io/docs/getting-started/installation/) installed locally
- A seeded test database (~50 k patients) — run `seed_patients.py` first
- The API stack running (`docker compose ... up -d`)
- Set env vars (or use `.env.perf`):
  ```bash
  export BASE_URL=http://localhost:8080    # proxy URL
  export AUTH_TOKEN=<bearer-token>         # login and grab an access token
  ```

## Seed the database

```bash
# From the repo root (requires psycopg[binary] installed):
pip install psycopg[binary] faker
python tests/perf/seed_patients.py \
    --dsn "postgresql://arogyam:arogyam_dev_pw@localhost:5432/arogyam" \
    --count 50000
```

The seeder inserts 50 000 realistic Indian patient records with varied
first/last names, mobile numbers, OP numbers, and DOBs to exercise the
FTS + pg_trgm search indexes at production-representative scale.

## Run tests

```bash
# Quick smoke (5 VUs, 30 s)
k6 run -e BASE_URL=$BASE_URL -e AUTH_TOKEN=$AUTH_TOKEN \
    --vus 5 --duration 30s tests/perf/search_load.js

# Full NFR validation (ramp to 30 VUs, 5-min soak)
k6 run -e BASE_URL=$BASE_URL -e AUTH_TOKEN=$AUTH_TOKEN \
    tests/perf/search_load.js

k6 run -e BASE_URL=$BASE_URL -e AUTH_TOKEN=$AUTH_TOKEN \
    tests/perf/dashboard_load.js

# Export results as JSON for CI artefact
k6 run --out json=results/search_$(date +%Y%m%d).json \
    -e BASE_URL=$BASE_URL -e AUTH_TOKEN=$AUTH_TOKEN \
    tests/perf/search_load.js
```

## Pass/fail criteria

Both scripts use k6 `thresholds` — the run exits non-zero if any threshold
is breached, making it suitable as a CI gate:

- `http_req_duration{p(95)}` < 1000 ms (search) / 2000 ms (dashboard)
- `http_req_failed` < 1 %
- `checks` pass rate > 99 %
