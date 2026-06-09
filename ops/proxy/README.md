# ArogyaM PMS — Reverse Proxy Configuration (DEV-TF.3)

The production edge proxy configuration lives at **`nginx/nginx.prod.conf`** (relative
to the repo root). It is mounted into the `proxy` service in `docker-compose.prod.yml`.

## What it provides

| Feature | Detail |
|---------|--------|
| TLS termination | TLS 1.2/1.3 via Let's Encrypt certificates (`/etc/letsencrypt/live/$DOMAIN/`) |
| HTTP → HTTPS redirect | Port 80 redirects to 443; ACME http-01 challenge passthrough |
| HSTS | `max-age=63072000; includeSubDomains; preload` |
| Security headers | `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Content-Security-Policy` |
| PII-safe access log | `log_format noquery` — logs `$uri` (path only), never `$args` / raw `$request` |
| SPA routing | `/` → frontend container port 80 |
| API routing | `/api/` → backend container port 8000 |
| Upload size | `client_max_body_size 12m` (10 MB doc uploads + multipart overhead) |

## Log format — query-string redaction (SAD §10.1 control #7)

```nginx
log_format noquery '$remote_addr - $remote_user [$time_local] '
                   '"$request_method $uri $server_protocol" '
                   '$status $body_bytes_sent "$http_referer" "$http_user_agent"';
```

`$uri` is the **normalized path** — query strings, including patient search terms,
OP numbers, and mobile numbers, are never written to the access log.

## Deployment notes

1. Copy TLS certificates to `/etc/letsencrypt/live/$DOMAIN/` on the host (or use
   the `certbot` companion container — see `docker-compose.prod.yml`).
2. Set `DOMAIN` in `.env.prod` — this is interpolated into the Nginx config via
   `envsubst` (the official Nginx image processes `*.conf.template` automatically).
3. The config template at `nginx/nginx.prod.conf` is copied into the proxy container
   under `/etc/nginx/templates/default.conf.template` by `docker-compose.prod.yml`.

## Dev proxy

For local development the simpler HTTP-only proxy lives at `nginx/nginx.dev.conf`
and is used by `docker-compose.dev.yml`.
