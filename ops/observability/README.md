# ArogyaM PMS — Observability Baseline (DEV-TF.9)

Phase 1 observability uses Docker healthchecks + structured stdout logs + optional
Uptime Kuma for uptime alerting. Prometheus/Grafana metrics are deferred to R2.

---

## 1. Health endpoints

The FastAPI backend exposes two health endpoints:

| Endpoint | Purpose | Used by |
|----------|---------|---------|
| `GET /api/v1/health` | Liveness — returns `{"status":"ok"}` (fast, no DB call) | Docker healthcheck, load balancer |
| `GET /api/v1/ready` | Readiness — checks DB connection + MinIO reachability | Compose start-order gate, uptime monitor |

The compose healthchecks in `docker-compose.prod.yml` wire these to the `api` service.
The proxy exposes `/healthz` (Nginx stub) separately so the proxy itself can be health-checked.

---

## 2. Docker compose healthchecks summary

All services in `docker-compose.prod.yml` have `healthcheck` blocks. Startup dependency
chains use `condition: service_healthy` to enforce readiness ordering:

```
db (pg_isready) → createbuckets → api (/ready) → proxy (/healthz)
redis (redis-cli ping) ──────────────────────↗
minio (curl /minio/health/live) → createbuckets ↗
```

---

## 3. Structured log collection

All containers write structured JSON to stdout (Docker's json-file driver).
To ship logs to a central sink, replace the logging driver in `docker-compose.prod.yml`:

### Loki (Grafana stack — recommended for R2)
```yaml
x-logging: &prod-logging
  driver: loki
  options:
    loki-url: "http://loki:3100/loki/api/v1/push"
    loki-external-labels: "app=arogyam,env=prod"
```

### Syslog (forward to an existing SIEM)
```yaml
x-logging: &prod-logging
  driver: syslog
  options:
    syslog-address: "tcp://siem.example.com:514"
    tag: "arogyam/{{.Name}}"
```

Until a central sink is configured, read logs with:
```bash
docker compose -f docker-compose.prod.yml logs -f --since 1h api
docker compose -f docker-compose.prod.yml logs -f --since 1h proxy
```

---

## 4. Uptime Kuma (optional — Phase 1 alerting)

[Uptime Kuma](https://github.com/louislam/uptime-kuma) is a lightweight self-hosted
uptime monitor with SMTP + Slack alerting. Deploy it alongside the stack:

```bash
docker compose -f ops/observability/docker-compose.uptime-kuma.yml up -d
```

Then add monitors via the Uptime Kuma UI (default `http://<host>:3001`):

| Monitor | URL | Expected | Alert |
|---------|-----|---------|-------|
| API liveness | `https://<domain>/api/v1/health` | HTTP 200 | Email + Slack |
| API readiness | `https://<domain>/api/v1/ready` | HTTP 200 | Email |
| Proxy | `https://<domain>/healthz` | HTTP 200 | Email |
| TLS cert expiry | `https://<domain>` | cert valid > 14 days | Email |

---

## 5. Backup failure alerting

The nightly `ops/backup/pg_backup.sh` script calls `ops/backup/notify.sh` on failure.
Set `ALERT_EMAIL_TO` and SMTP env vars in `.env.prod` to enable email alerts.
The backup run is also recorded in the `backup_log` table (visible on the admin
Backup Status page).

---

## 6. R2 observability upgrade path

When traffic grows or SLA requirements tighten, add:
- Prometheus + Grafana (structured log metrics, error-rate dashboards)
- FastAPI `/metrics` endpoint via `prometheus-fastapi-instrumentator`
- Alert rules: p95 latency > 1s on search, error-rate > 1%, disk usage > 80%
