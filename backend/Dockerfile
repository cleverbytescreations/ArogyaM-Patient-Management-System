# =============================================================================
# ArogyaM PMS — Backend (FastAPI) image. Multi-stage.
#   base : Python + virtualenv at /app/.venv with all runtime deps installed.
#   dev  : hot-reload target used by docker-compose.dev.yml (uvicorn --reload).
#
# The dev compose bind-mounts ./backend over /app and keeps /app/.venv as an
# anonymous volume, so the venv built here survives the bind mount. That is why
# dependencies live in the venv (not the system site-packages) and why PATH
# points at the venv first.
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
