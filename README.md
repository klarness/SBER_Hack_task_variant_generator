# SBER_Hack_task_variant_generator

Go backend for generating task variants.

## Backend

Service code lives in `core`.

Required dependencies:

- PostgreSQL
- Valkey/Redis
- Python AI worker with `/analyze`, `/generate`, `/validate`, `/export`

Run infrastructure:

```bash
cd core
docker compose up -d
```

This starts PostgreSQL, Valkey, migrations and the Go `core` API.

If Docker Hub times out while pulling images, pull them separately and rerun compose:

```bash
cd core
docker compose pull postgres valkey migrate
docker compose build core
docker compose up -d
```

Image names can be overridden in `core/.env`; see `core/.env.example`.

Run API locally without Docker:

```bash
cd core
go run ./cmd/api
```

Default API address is `:8080`. Main env variables:

- `DATABASE_URL`
- `VALKEY_ADDR`
- `AI_WORKER_BASE_URL`
- `RATE_LIMIT_CAPACITY`
- `RATE_LIMIT_REFILL`
- `RATE_LIMIT_WINDOW`
- `DEFAULT_VARIANT_COUNT`
- `MAX_UPLOAD_MB`

Every `/api/v1/*` request requires `X-User-ID: <uuid>`.

Create task:

```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "X-User-ID: 00000000-0000-0000-0000-000000000001" \
  -F "title=Math test" \
  -F "variant_count=4" \
  -F "files=@page1.jpg" \
  -F "files=@page2.jpg"
```

The API accepts multiple uploaded files in the same `files` multipart field and forwards them to the Python worker as one task.

Useful endpoints:

- `GET /api/v1/tasks?q=&subject=&topic=&status=` - task library search and filtering
- `GET /api/v1/tasks/{id}` - task status, source items and generated variants
- `PATCH /api/v1/variants/{id}/items/{item_id}` - manual item edit, saved to edit history
- `POST /api/v1/variants/{id}/items/{item_id}/regenerate` - point regeneration with validation retries
- `GET /api/v1/tasks/{id}/export` - proxy export through the Python worker
