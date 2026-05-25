# Генератор заданий

Сервис для генерации вариантов контрольных работ. Учитель загружает один или несколько файлов, система распознает исходник, генерирует варианты заданий через GigaChat, дает их отредактировать и экспортировать в DOCX/PDF.

## Сервисы

- `frontend` - React/Vite интерфейс.
- `core` - Go API и оркестратор.
- `analyze` - Python FastAPI: парсинг файлов, OCR, GigaChat, экспорт.
- `postgres` - база данных.
- `valkey` - rate limiter.
- `migrate` - миграции БД.

## Дефолтное окружение

Создайте `.env` в корне:

```bash
cp .env.example .env
```

Базовые переменные:

```env
GIGACHAT_CLIENT_ID=
GIGACHAT_CLIENT_SECRET=
GIGACHAT_CREDENTIALS=
GIGACHAT_AUTHORIZATION_KEY=
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat-2-Pro
GIGACHAT_TIMEOUT=60.0
GIGACHAT_VERIFY_SSL_CERTS=false
GIGACHAT_CONCURRENCY=1

AI_WORKER_BASE_URL=http://analyze:8000
AI_WORKER_CONCURRENCY=1
RATE_LIMIT_CAPACITY=30
RATE_LIMIT_REFILL=30
RATE_LIMIT_WINDOW=1m
DEFAULT_VARIANT_COUNT=2
MAX_UPLOAD_MB=32

POSTGRES_IMAGE=postgres:16-alpine
VALKEY_IMAGE=valkey/valkey:7.2-alpine
MIGRATE_IMAGE=migrate/migrate:v4.17.1
```

Для работы нужно заполнить один из вариантов GigaChat:

- `GIGACHAT_CREDENTIALS`;
- `GIGACHAT_AUTHORIZATION_KEY`;
- `GIGACHAT_CLIENT_ID` + `GIGACHAT_CLIENT_SECRET`.

Секреты не коммитить.

## Запуск

Из корня проекта:

```bash
docker compose up -d --build
```

Адреса:

```text
Frontend: http://127.0.0.1:5173
Go API:   http://127.0.0.1:8080
Analyze:  http://127.0.0.1:8000
```

Проверка:

```bash
curl http://127.0.0.1:8080/healthz
curl http://127.0.0.1:8000/healthz
```

## Остановка

```bash
docker compose down
```

Удалить данные БД и Valkey:

```bash
docker compose down -v
```
