# /new-endpoint

Scaffold a new API endpoint following the ArogyaM module pattern.

## Argument
`/new-endpoint <domain> <http_verb> <resource>`
Example: `/new-endpoint patients GET search`

## Endpoint Pattern (do not deviate)

### 1. Schema — `backend/app/modules/<domain>/schemas.py`
```python
class <Resource>Create(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    # fields

class <Resource>Response(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    created_at: datetime
    # fields
```

### 2. Repository query — `backend/app/modules/<domain>/repository.py`
```python
def get_<resource>(db: Session, resource_id: uuid.UUID) -> <Model> | None:
    return db.execute(select(<Model>).where(<Model>.id == resource_id)).scalar_one_or_none()

def create_<resource>(db: Session, entity: <Model>) -> None:
    db.add(entity)
```

### 3. Service method — `backend/app/modules/<domain>/service.py`
```python
def <action>_<resource>(
    db: Session,
    body: <Resource>Create,
    actor_payload: dict,
    request=None,
) -> <Resource>Response:
    ip, ua, rid = extract_request_meta(request)
    actor_id = uuid.UUID(actor_payload["sub"])
    # business logic
    entity = <Model>(...)
    repo.create_<resource>(db, entity)
    db.flush()
    write_audit(db, action="CREATE", user_id=actor_id, entity_type="<resource>", ...)
    db.commit()
    return <Resource>Response.model_validate(entity)
```

### 4. Route — `backend/app/modules/<domain>/router.py`
```python
@router.<method>("<path>", response_model=<Resource>Response, status_code=201)
def <action>_<resource>(
    body: <Resource>Create,
    request: Request,
    payload: CurrentUser,
    db: Annotated[Session, Depends(get_db)],
) -> <Resource>Response:
    require_permission("<perm_name>")(payload)
    return service.<action>_<resource>(db, body, payload, request)
```

## Instructions
1. Use `LSP goto_definition` on the nearest existing endpoint to confirm imports — do NOT re-read the whole file.
2. Add schema, repository function, service method, and route in a single `Edit` per file.
3. Register the router in `backend/app/main.py` if the module is new.
4. Run linter:
   ```bash
   cd backend && ruff check app/ -q
   ```
5. Report what was added (4 locations, 1 optional router registration).