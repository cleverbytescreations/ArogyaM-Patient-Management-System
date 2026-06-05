# =============================================================================
# ArogyaM PMS — Frontend (React + Vite) image. Multi-stage.
#   base : node + installed dependencies.
#   dev  : Vite dev server with HMR, used by docker-compose.dev.yml.
#
# The dev compose bind-mounts ./frontend over /app and keeps /app/node_modules
# as an anonymous volume, so the dependencies installed here survive the mount.
# A production stage (build -> static assets served by Nginx) is added later.
# =============================================================================

FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# -----------------------------------------------------------------------------
# dev — source is bind-mounted at runtime; COPY only matters for standalone builds.
# -----------------------------------------------------------------------------
FROM base AS dev
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
