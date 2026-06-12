# Backup service image (INT-T13.1)
# Base: postgres:16-alpine (provides pg_dump + psql)
# mc binary copied from minio/mc so docs_backup.sh can mirror the bucket.
FROM minio/mc:latest AS mc_stage

FROM postgres:16-alpine

# Copy MinIO client
COPY --from=mc_stage /usr/bin/mc /usr/local/bin/mc

# Install bash — scripts use bash-isms; postgres:16-alpine ships only sh.
# No cron daemon needed: entrypoint.sh uses a sleep loop (crond requires
# setpgid which Docker's default seccomp profile blocks unprivileged).
RUN apk add --no-cache bash \
    && mkdir -p /var/log /backups

COPY pg_backup.sh docs_backup.sh notify.sh purge.sh entrypoint.sh /scripts/
RUN chmod +x /scripts/pg_backup.sh /scripts/docs_backup.sh \
               /scripts/notify.sh /scripts/purge.sh /scripts/entrypoint.sh

VOLUME ["/backups"]
ENTRYPOINT ["/scripts/entrypoint.sh"]
