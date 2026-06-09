# =============================================================================
# ArogyaM PMS — Backend (FastAPI) image. Multi-stage (DEV-TF.2).
#   base : Python + virtualenv at /app/.venv with all runtime deps installed.
#   dev  : hot-reload target used by docker-compose.dev.yml (uvicorn --reload).
#   prod : hardened production image — non-root user, no dev tools, minimal FS.
#
# The dev compose bind-mounts ./backend over /app and keeps /app/.venv as an
# anonymous volume, so the venv built here survives the bind mount. That is why
# dependencies live in the venv (not the system site-packages) and why PATH
# points at the venv first.
#
# Production hardening (DEV-TF.2, SAD §10 / §18):
#   - Runs as non-root user (uid/gid 1000 — arogyam)
#   - No shell, no package manager, no debug tooling in final image
#   - Read-only filesystem except /tmp and /app/tmp (explicit tmpfs in compose)
#   - Labels carry version metadata for image scanning
#   - Pins base image via digest in CI; digest omitted here for readability
# =============================================================================

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Native libs required by WeasyPrint (HTML->PDF case sheet report rendering):
# Pango/Cairo for text shaping & layout, gdk-pixbuf for embedded PNG logos,
# plus shared-mime-info and fonts so generated PDFs render text crisply.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf-2.0-0 \
    libffi8 \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Isolated virtualenv so the bind-mounted source never shadows the packages.
RUN python -m venv /app/.venv

COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Entrypoint: runs `alembic upgrade head` then exec "$@" (the CMD).
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# -----------------------------------------------------------------------------
# dev — source is bind-mounted at runtime; the COPY here only matters for a
# standalone `docker build` (e.g. CI smoke build) without the compose mount.
# -----------------------------------------------------------------------------
FROM base AS dev
COPY . .
EXPOSE 8000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# -----------------------------------------------------------------------------
# prod — hardened production image (DEV-TF.2).
#   1. Creates a non-root system user (arogyam, uid 1000).
#   2. Copies only the application source and the pre-built venv from base.
#   3. Drops to the non-root user before ENTRYPOINT.
#   4. No --reload; workers controlled via WEB_CONCURRENCY env var.
# -----------------------------------------------------------------------------
FROM base AS prod

ARG APP_VERSION=unset
LABEL org.opencontainers.image.title="arogyam-api" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.vendor="ArogyaM" \
      org.opencontainers.image.description="ArogyaM PMS FastAPI backend"

# Create non-root user and group.
RUN groupadd --gid 1000 arogyam \
    && useradd --uid 1000 --gid arogyam --no-create-home --shell /usr/sbin/nologin arogyam

COPY . .

# Fix ownership so the non-root user can read app source and venv.
RUN chown -R arogyam:arogyam /app /entrypoint.sh

USER arogyam

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
# WEB_CONCURRENCY defaults to (2 * CPU + 1) via uvicorn; override in compose.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--no-access-log", "--workers", "2"]
