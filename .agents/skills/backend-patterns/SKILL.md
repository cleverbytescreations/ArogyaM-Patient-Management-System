---
name: backend-patterns
description: Use for FastAPI backend design, clean architecture, services, repositories, sync SQLAlchemy, migrations, background workflows, caching, document pipelines, and scalable backend implementation.
---

# Backend Patterns

Use this skill when the task involves:
- FastAPI module, router, service, repository, model, or schema design
- SQLAlchemy session handling, queries, transactions, or migrations
- Pydantic v2 validation and API response contracts
- RBAC, record-level guards, audit, or log-redaction behavior
- MinIO/S3 document upload/download or optional Redis integration
- Background tasks, backup hooks, future queue seams, and integration patterns

## Backend Baseline

Preferred stack:
- FastAPI >= 0.115 with synchronous route handlers unless there is a clear I/O reason
- SQLAlchemy 2.x sync `Session`, `create_engine`, and `sessionmaker`
- Pydantic v2 schemas with `ConfigDict(from_attributes=True)` where ORM serialization is needed
- Alembic migrations under `backend/app/migrations`
- psycopg3 via `psycopg[binary]`, direct PostgreSQL connection, no PgBouncer/pooler in Phase 1
- python-jose for JWT, passlib bcrypt for password hashing
- ruff, mypy, pytest, pytest-cov, httpx

## Backend Architecture Rule

Use clean layering:
1. API layer - `backend/app/modules/<domain>/router.py` - HTTP concerns only: parse request, enforce dependencies, inject `db: Session = Depends(get_db)`, call service, return response
2. Service layer - `backend/app/modules/<domain>/service.py` - business logic, orchestration, transaction/session coordination, side effects, audit writes, and `db.commit()`
3. Repository/data-access layer - `backend/app/modules/<domain>/repository.py` - SQLAlchemy query construction; receives `Session`; returns ORM models, rows, or scalar values
4. Model/data layer - `backend/app/modules/<domain>/models.py` - ORM definitions only
5. Schema layer - `backend/app/modules/<domain>/schemas.py` - Pydantic request/response models

API -> Service -> Repository -> Model. Services receive the router-provided session and pass `db` into repository functions. Do not put SQLAlchemy `select()`, `insert()`, `update()`, `delete()`, joins, filters, ordering, pagination, or aggregate query construction in service or endpoint files.

## API Design Rules
- Mount endpoints under `/api/v1`.
- Use snake_case JSON, ISO-8601 timestamps, and UUID identifiers.
- Use response models and the shared error envelope `{ "error": { "code", "message", "details", "request_id" } }`.
- List responses use `{ "items", "total", "page", "page_size" }`.
- File uploads are multipart with server-side MIME/content sniffing and the configured upload size limit.
- OpenAPI and frontend request/response types must align with `Docs/API_SPECIFICATION_OPENAPI.md`.

## Service Layer Rules
- Services receive `db: Session` from the router.
- Services own business rules, validation, workflow transitions, cost/state calculations, side effects, `db.flush()`, `db.commit()`, rollback decisions, and API error translation.
- Services call repositories from one or more domains within the same session for cross-domain orchestration.
- Services write audit rows via `app/core/audit.py::write_audit()` in the same transaction as the mutation.
- Services compare client `version` against the entity version and raise `VersionConflictError` on stale writes.
- Services must not contain SQLAlchemy query construction such as `select()`, `insert()`, `update()`, `delete()`, joins, filters, ordering, pagination, or aggregates.

## Repository Layer Rules
- Use one repository/data-access file per domain: `backend/app/modules/<domain>/repository.py`.
- Repository functions are synchronous and accept `db: Session` as the first parameter.
- Repositories own query construction, execution, joins, filters, ordering, pagination, aggregates, and persistence helpers.
- Repositories contain no business logic, workflow transitions, authorization decisions, background task enqueueing, audit writes, commits, or HTTP concerns.
- Repositories must not raise `HTTPException`; return `None`, empty collections, or raise domain/database errors for services to translate.
- Repositories are stateless; prefer module-level functions unless the project already uses a thin class pattern.
- Sessions are opened by FastAPI dependencies in routers, never inside repository functions.

Canonical signatures:
```python
def get_by_id(db: Session, entity_id: uuid.UUID) -> Model | None: ...
def list_with_filters(db: Session, filters: FilterSchema, limit: int, offset: int) -> tuple[list[Model], int]: ...
def create(db: Session, entity: Model) -> None: ...
def update(db: Session, entity: Model, changes: dict[str, object]) -> Model: ...
def soft_delete(db: Session, entity: Model) -> Model: ...
```

If a new SQLAlchemy-backed service is added and no repository exists for that domain, create the repository with the feature. Do not require a full-codebase refactor unless the user asks.

## Session Pattern

```python
@router.post("/resource", response_model=ResourceOut)
def create_resource(
    body: ResourceCreate,
    request: Request,
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> ResourceOut:
    require_permission("create_resource")(payload)
    return service.create_resource(db, body, payload, request)
```

```python
def create_resource(db: Session, body: ResourceCreate, actor_payload: dict, request=None) -> ResourceOut:
    entity = Model(...)
    repository.create(db, entity)
    db.flush()
    write_audit(db, action="CREATE", ...)
    db.commit()
    return ResourceOut.model_validate(entity)
```

## OP Numbering Rule

OP number generation must run inside the patient-registration transaction:
```python
op_row = db.execute(
    select(OpSequence).where(OpSequence.category_code == category).with_for_update()
).scalar_one()
op_row.last_sequence += 1
op_number = f"{op_row.prefix}{str(op_row.last_sequence).zfill(op_row.padding_width)}"
```

Never generate an OP number outside the registration transaction. Never reuse or decrement issued OP sequences through normal UI flows.

## Async / Background Rules

Use FastAPI background tasks for lightweight Phase 1 work such as backup alerts. Do not block request/response cycles with heavy work.

Typical pattern:
1. Accept request or complete mutation
2. Persist required state in PostgreSQL
3. Add a lightweight background task only after required state is durable
4. Return status or job-tracking response when applicable

Redis RQ is deferred to Full-Scope/Future for PDF generation, OCR extraction, embeddings, and bulk import. No transactional outbox is part of the current architecture.

## Redis Rules

Gate Redis calls on `settings.redis_url`.

Use Redis for login rate-limit counters and optional JWT `jti` denylist only. Do not use Redis for source-of-truth records, patient/session state, document metadata, workflow status, or anything that must survive process restart.

### Redis DB Slot Strategy
See `architecture-deep-dive -> Cache / Queue` for canonical Redis DB slot guidance.

## Search / AI Integration Rules

Backend search orchestration builds PostgreSQL FTS/trigram queries in repositories and returns minimal identifiers for search results. Opening the patient profile is the boundary for medical detail and must be audited.

See `architecture-deep-dive` for search/storage separation and future semantic-search scope.

## OCR / AI Workflow Rules

OCR, embeddings, RAG, and semantic search are Future scope. If adding preparatory seams, keep them dormant and do not introduce new runtime services or schema extensions without checklist coverage.

## Security Rules
- Use `require_permission("perm_name")` and deny by default on protected routes.
- Record-level checks happen in services after fetching the entity.
- All sensitive actions write `audit_log`: login/failure, view profile, create/update patient and clinical records, upload, document access, export, merge, user/role/master-data changes, backup/restore.
- Never log request/response bodies, SQL parameter values, file contents, search terms, or clinical text in non-audit logs.
- Document downloads are permission-checked proxy streams or short-lived pre-signed URLs only.

## Performance Rules
- Paginate all list endpoints and validate sort fields against allow-lists.
- Use indexes backing hot paths: OP/mobile exact lookup, FTS/trigram search, visit date, status, audit filters, follow-up status/date.
- Avoid N+1 queries with `selectinload` or `joinedload` when response serialization needs relationships.
- Keep `echo=False`; `SQL_ECHO` must stay false outside explicit local debugging.

## Error Handling Rules
- Raise domain exceptions from `app/core/errors.py`; let global handlers produce envelopes.
- Use 401 for unauthenticated, 403 for forbidden, 404 for not found, 409 for version/state conflicts, 413/415 for upload failures, 422 for validation.
- API responses must not leak stack traces, SQL, object storage internals, or secret values.
