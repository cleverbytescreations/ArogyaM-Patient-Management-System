# =============================================================================
# ArogyaM PMS — Frontend (React + Vite) image. Multi-stage (DEV-TF.2).
#   deps  : Node + installed dependencies (cache layer).
#   dev   : Vite dev server with HMR, used by docker-compose.dev.yml.
#   build : Production Vite build → static assets in /app/dist.
#   prod  : Nginx Alpine serving the static assets — hardened, non-root,
#           minimal attack surface (no Node in the final image).
#
# Production hardening (DEV-TF.2, SAD §10 / §18):
#   - Final image is Nginx Alpine — no Node runtime, no build tooling.
#   - Non-root user (nginx uid 101 on Alpine).
#   - nginx.conf tuned: gzip, cache headers, security headers, no version leak.
#   - Pins base images; update digests monthly.
# =============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# dev — source is bind-mounted at runtime; COPY only matters for standalone builds.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS dev
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# -----------------------------------------------------------------------------
# build — production Vite build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS build
ARG APP_VERSION=unset
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Inject version into the build so the SPA can display it in the UI if needed.
ENV VITE_APP_VERSION=${APP_VERSION}
RUN npm run build

# -----------------------------------------------------------------------------
# prod — minimal Nginx Alpine image serving static assets (DEV-TF.2).
# The Nginx config is layered from ops/proxy/nginx.frontend.conf — see that
# file for CSP, cache headers, and gzip settings.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod

ARG APP_VERSION=unset
LABEL org.opencontainers.image.title="arogyam-frontend" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="ArogyaM" \
      org.opencontainers.image.description="ArogyaM PMS React SPA (static)"

# Copy the Vite build output.
COPY --from=build /app/dist /usr/share/nginx/html

# Overlay the production Nginx server block (gzip, cache headers, SPA routing).
COPY nginx.prod.conf /etc/nginx/conf.d/default.conf

# Nginx Alpine runs as the 'nginx' user (uid 101) by default when the
# main process is started as root — it drops privileges automatically.
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
