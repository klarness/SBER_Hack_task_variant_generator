# Инструкция по запуску

## 1. Требования

- Docker Desktop
- Docker Compose
- Доступ к GigaChat из сети РФ

Для локальной проверки фронта без Docker дополнительно нужен Node.js, но основной запуск идет через Docker.

## 2. Настройка `.env`

В корне проекта должен быть файл `.env`.
Можно взять пример:

```bash
cp .env.example .env
```

Минимально для GigaChat нужно заполнить один из вариантов:

```env
GIGACHAT_CREDENTIALS=
```

или:

```env
GIGACHAT_AUTHORIZATION_KEY=
```

или текущий поддерживаемый вариант:

```env
GIGACHAT_CLIENT_ID=
GIGACHAT_CLIENT_SECRET=
```

Для локального теста обычно используются:

```env
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat
GIGACHAT_TIMEOUT=60.0
GIGACHAT_VERIFY_SSL_CERTS=false
GIGACHAT_CONCURRENCY=1
AI_WORKER_CONCURRENCY=1
VITE_DEV_USER_ID=11111111-1111-1111-1111-111111111111
```

Секреты GigaChat не коммитить.

## 3. Запуск всего проекта

Из корня репозитория:

```bash
docker compose up -d --build
```

Поднимаются сервисы:

- `frontend` - React UI;
- `core` - Go API;
- `analyze` - Python AI-worker;
- `postgres` - база данных;
- `valkey` - rate limiter;
- `migrate` - миграции PostgreSQL.

## 4. Адреса

Фронтенд:

```text
http://localhost:5173/
```

Go API:

```text
http://localhost:8080/
```

Python analyze:

```text
http://localhost:8000/
```

Health-check Python:

```bash
curl http://localhost:8000/healthz
```

Через фронтенд API проксируется на Go backend:

```text
http://localhost:5173/api/v1/...
```

## 5. Проверка API вручную

Все ручки `/api/v1/*` требуют header:

```text
X-User-ID: 11111111-1111-1111-1111-111111111111
```

Пример создания задачи:

```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
  -F "title=Проверочная работа" \
  -F "variant_count=2" \
  -F 'settings={"variation_types":["replace_numbers"],"number_types":["integers"],"number_range":"keep comparable to original","locked_parts":[],"preserve_difficulty":true,"check_answer_uniqueness":true}' \
  -F "text=1. Решите уравнение x + 2 = 5."
```

Получить задачу:

```bash
curl http://localhost:8080/api/v1/tasks/<task_id> \
  -H "X-User-ID: 11111111-1111-1111-1111-111111111111"
```

## 6. Остановка

```bash
docker compose down
```

Если нужно удалить данные PostgreSQL и Valkey:

```bash
docker compose down -v
```

## 7. Частые проблемы

### Docker не скачал образ

Если Docker Hub оборвал загрузку с `TLS handshake timeout` или `EOF`, повторить:

```bash
docker compose pull
docker compose up -d --build
```

### GigaChat возвращает 429

Это лимит бесплатного тарифа.
В проекте по умолчанию стоит последовательный режим:

```env
AI_WORKER_CONCURRENCY=1
GIGACHAT_CONCURRENCY=1
```

Если 429 уже получен, нужно подождать и повторить запрос позже.

### Фронт не видит backend

В Docker фронт ходит через Vite proxy на `core`.
Проверить:

```bash
curl http://localhost:5173/api/v1/tasks \
  -H "X-User-ID: 11111111-1111-1111-1111-111111111111"
```

