# /new-endpoint

Scaffold a new API endpoint following the ArogyaM PMS backend pattern.

## Argument
`/new-endpoint <domain> <verb> <resource>`

## Instructions

1. Find the nearest existing endpoint/controller for the same domain or style, such as `backend/app/modules/auth/router.py` or `backend/app/modules/users/router.py`.
2. Use LSP definition/references to confirm imports, dependency injection, auth, routing, and response patterns.
3. Add or update schema/DTO types in `backend/app/modules/<domain>/schemas.py`.
4. Add repository/data-access functions in `backend/app/modules/<domain>/repository.py`.
5. Add service/business logic in `backend/app/modules/<domain>/service.py` that calls the repository and does not construct raw SQLAlchemy queries.
6. Add route/controller code in `backend/app/modules/<domain>/router.py`.
7. Register the route in `backend/app/main.py` if the project requires explicit registration.
8. Add or update focused tests under `backend/app/tests/` when the project has endpoint tests.
9. Run:
   ```bash
   cd backend && ruff check app/
   cd backend && mypy app/ --ignore-missing-imports
   cd backend && python -m pytest app/tests/<specific_endpoint_test_if_available> -q -p no:cacheprovider
   ```

## Constraints
- Enforce the project's authentication and authorization dependency pattern.
- Preserve patient/user role scoping rules when applicable.
- Do not put business logic directly in route handlers.
- Report only the schema, repository, service, route, and test locations changed.
