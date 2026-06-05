
--Create your dev environment file
cp .env.dev.example .env.dev

--.env.dev is gitignored. The defaults are intentionally weak for local convenience and must never be reused in UAT/production. Generate a real JWT secret with:
# paste into JWT_SECRET_KEY in .env.dev
openssl rand -hex 32   

--Start the stack
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build -d

--To also start the optional Redis cache / rate-limiter:
docker compose -f docker-compose.dev.yml --env-file .env.dev --profile cache up --build -d

# Tail logs for a single service
docker compose -f docker-compose.dev.yml --env-file .env.dev logs -f api

# Rebuild after dependency changes
docker compose -f docker-compose.dev.yml --env-file .env.dev up --build

# Wipe all dev data (Postgres + MinIO volumes) and start fresh
docker compose -f docker-compose.dev.yml --env-file .env.dev down -v

ref
https://www.kyndryl.com/in/en/services/applications

admin / Admin@12345
