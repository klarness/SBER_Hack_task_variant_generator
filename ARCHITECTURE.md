# Архитектура и текущее состояние проекта

Документ фиксирует фактическое состояние репозитория на текущий момент. Он нужен, чтобы быстро понять, какие сервисы есть, как они связаны, какие технологии используются и что уже реализовано.

## Назначение системы

Система генерирует варианты контрольной или проверочной работы на основе одного исходного задания.

Типовой сценарий:

1. Учитель загружает один или несколько файлов с исходной работой.
2. Python-сервис извлекает текст из файлов.
3. Python-сервис отправляет единый распознанный текст в GigaChat для анализа.
4. Go-сервис сохраняет исходную работу и атомарные задания в PostgreSQL.
5. Go-сервис запускает генерацию вариантов через Python-сервис.
6. Каждый сгенерированный пункт валидируется через Python-сервис.
7. Результат сохраняется в PostgreSQL и отображается во фронтенде.
8. Пользователь может вручную отредактировать пункт, перегенерировать отдельный пункт или экспортировать результат в DOCX.

## Сервисы

В рабочей docker-compose цепочке используются:

- `frontend` - React/Vite приложение для загрузки работ, просмотра вариантов, редактирования и экспорта.
- `core` - Go API, основной оркестратор системы.
- `analyze` - Python AI-worker: парсинг файлов, вызовы GigaChat, генерация, валидация и DOCX-экспорт.
- `postgres` - основная база данных.
- `valkey` - Redis-compatible хранилище для rate limiter.
- `migrate` - контейнер для применения SQL-миграций.

В репозитории также есть `parser_text`, но сейчас он не участвует в основной рабочей цепочке. Текущий путь обработки идет через `core -> analyze`.

## Технологии

### Go core

Основные библиотеки:

- `chi` - HTTP router.
- `pgx/v5` - подключение и запросы к PostgreSQL.
- `go-redis/v9` - клиент для Valkey/Redis.
- `avast/retry-go/v4` - retry-логика генерации и валидации.
- `google/uuid` - UUID.
- `log/slog` - структурные JSON-логи.

Архитектурный стиль: Clean Architecture / Hexagonal Architecture.

### Python analyze

Основные библиотеки:

- `FastAPI` - HTTP API.
- `uvicorn` - ASGI server.
- `gigachat` - официальный клиент GigaChat.
- `python-dotenv` - загрузка `.env`.
- `json-repair` - ремонт некорректного JSON от LLM.
- `python-docx` - чтение DOCX и сборка DOCX-экспорта.
- `pymupdf`, `pdfplumber` - извлечение текста из PDF.
- `pillow` - работа с изображениями.
- `python-multipart` - multipart upload.

### Frontend

Основные библиотеки:

- React 19.
- Vite.
- TypeScript.
- TanStack Query.
- React Router.
- TipTap editor.
- React Dropzone.
- Tailwind CSS.
- Lucide React icons.

## Docker Compose

Файл запуска находится в корне:

```text
docker-compose.yaml
```

Основные порты:

- frontend: `http://localhost:5173`
- core: `http://localhost:8080`
- analyze: `http://localhost:8000`
- postgres: `localhost:5433 -> container:5432`
- valkey: `localhost:6379`

Запуск:

```bash
docker compose up -d --build
```

## Переменные окружения

### Core

Основные переменные:

- `HTTP_ADDR` - адрес HTTP-сервера, по умолчанию `:8080`.
- `DATABASE_URL` - подключение к PostgreSQL.
- `VALKEY_ADDR` - адрес Valkey.
- `VALKEY_PASSWORD` - пароль Valkey, если нужен.
- `VALKEY_DB` - номер базы Valkey.
- `AI_WORKER_BASE_URL` - адрес Python-сервиса, в Docker обычно `http://analyze:8000`.
- `AI_WORKER_CONCURRENCY` - ограничение одновременных AI-операций со стороны Go, сейчас по умолчанию `1`.
- `RATE_LIMIT_CAPACITY` - вместимость token bucket, по умолчанию `30`.
- `RATE_LIMIT_REFILL` - пополнение token bucket, по умолчанию `30`.
- `RATE_LIMIT_WINDOW` - окно пополнения, по умолчанию `1m`.
- `DEFAULT_VARIANT_COUNT` - количество вариантов по умолчанию, сейчас `2`.
- `MAX_UPLOAD_MB` - максимальный размер загрузки, сейчас `32`.

### Analyze / GigaChat

Поддерживаемые способы передачи ключей:

- `GIGACHAT_CREDENTIALS`
- `GIGACHAT_AUTHORIZATION_KEY`
- `GIGACHAT_CLIENT_SECRET`, если там лежит готовый Authorization Key
- `GIGACHAT_CLIENT_ID` + `GIGACHAT_CLIENT_SECRET`, если нужно собрать credentials как base64 от `client_id:client_secret`

Основные настройки:

- `GIGACHAT_SCOPE`, обычно `GIGACHAT_API_PERS`.
- `GIGACHAT_MODEL`, по умолчанию `GigaChat`.
- `GIGACHAT_VISION_MODEL`, если нужен отдельный vision model.
- `GIGACHAT_TIMEOUT`, по умолчанию `60.0`.
- `GIGACHAT_VERIFY_SSL_CERTS`, для локальной разработки сейчас часто `false`.
- `GIGACHAT_CONCURRENCY`, по умолчанию `1`.

Секреты нельзя коммитить в репозиторий.

## Архитектура Go core

Структура:

```text
core/
  cmd/api/main.go
  internal/
    domain/
    infrastructure/
      database/
      ratelimit/
    client/
      aiworker/
    service/
    transport/http/
  migrations/
```

### `cmd/api`

Точка входа.

Отвечает за:

- загрузку конфигурации;
- создание JSON logger;
- подключение к PostgreSQL;
- подключение к Valkey;
- создание Python AI client;
- обертку AI client в concurrency limiter;
- сборку repository, services, handlers;
- запуск HTTP-сервера;
- graceful shutdown.

### `internal/domain`

Содержит доменные модели и интерфейсы.

Основные модели:

- `Task` - исходная работа.
- `TaskItem` - атомарный пункт исходной работы.
- `Variant` - один полный вариант работы.
- `VariantItem` - сгенерированный пункт внутри варианта.
- `VariantItemHistory` - история ручных правок и перегенераций.
- `UploadedFile` - файл, пришедший из multipart.

Статусы задачи:

- `pending`
- `processing`
- `done`
- `failed`

Статусы пункта варианта:

- `ready`
- `failed`

`failed` нужен, чтобы падение одного пункта не ломало всю работу. Такой пункт остается в варианте как пустой слот с `error_message`, и пользователь может перегенерировать его вручную.

Основные интерфейсы:

- `Repository`
- `AIClient`
- `RateLimiter`

### `internal/infrastructure/database`

Реализация `Repository` через `pgx`.

Что реализовано:

- создание задачи;
- сохранение результата анализа;
- обновление статуса задачи;
- получение задачи с деталями;
- список задач с фильтрами;
- сохранение вариантов;
- получение пункта для перегенерации;
- обновление пункта варианта;
- история изменений пункта.

Важное требование безопасности: SQL-запросы на пользовательские данные фильтруются по `user_id`. Например, получение задачи идет через `WHERE id = $1 AND user_id = $2`.

### `internal/infrastructure/ratelimit`

Реализован token bucket в Valkey через Lua script.

Ключ:

```text
rate_limit:user:<user_id>
```

По умолчанию:

- capacity: `30`
- refill: `30`
- window: `1m`

Если лимит исчерпан, HTTP middleware возвращает `429 Too Many Requests`.

### `internal/client/aiworker`

HTTP-клиент к Python-сервису.

Ручки Python, которые использует core:

- `POST /analyze`
- `POST /generate`
- `POST /validate`
- `POST /export`

Также есть `LimitedClient`, который ограничивает параллельные AI-операции. Сейчас `Analyze`, `Generate`, `Validate` проходят через общий permit. `Export` специально не занимает permit, потому что DOCX-экспорт не обращается к GigaChat и не должен ждать LLM-очередь.

### `internal/service`

Application layer.

`Orchestrator`:

- принимает создание задачи;
- сохраняет задачу в `processing`;
- асинхронно запускает анализ;
- сохраняет `original_text` и `task_items`;
- запускает генерацию вариантов;
- сохраняет варианты;
- переводит задачу в `done` или `failed`.

Генерация использует fan-out / fan-in:

1. Для каждого `variant_number * task_item` создается задача генерации.
2. Внутри генерации используется retry до 3 попыток.
3. Каждая попытка делает `Generate`.
4. Затем делает `Validate`.
5. Если `Validate=false`, попытка считается неуспешной.
6. Если все 3 попытки провалились, создается `VariantItem` со статусом `failed`.
7. Остальные пункты продолжают генерироваться.

`TaskService`:

- получение задачи;
- список задач;
- ручное редактирование `VariantItem`;
- точечная перегенерация `VariantItem`;
- экспорт задачи.

### `internal/transport/http`

HTTP delivery layer.

Реализовано:

- `GET /healthz`
- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/{id}`
- `GET /api/v1/tasks/{id}/export`
- `PATCH /api/v1/variants/{id}/items/{item_id}`
- `POST /api/v1/variants/{id}/items/{item_id}/regenerate`

Все `/api/v1/*` требуют заголовок:

```text
X-User-ID: <uuid>
```

## Архитектура Python analyze

Структура:

```text
analyze/
  main.py
  schemas/
  services/
    export/
    llm/
    parsing/
```

### HTTP API

Реализованы ручки:

- `GET /healthz`
- `POST /parse`
- `POST /analyze`
- `POST /generate`
- `POST /validate`
- `POST /export`

### `/parse`

Принимает один файл и возвращает:

- `raw_text`
- `normalized_text`

Используется для проверки парсинга.

### `/analyze`

Принимает:

- `files` - массив файлов multipart.
- `text` - необязательный текст.
- `title` - название работы.
- `settings` - JSON-строка настроек.
- `user_id` - строка.

Логика:

1. Каждый файл парсится в текст.
2. Все тексты склеиваются в один `original_text`.
3. Дополнительное поле `text` также добавляется в общий текст.
4. Текст нормализуется.
5. `original_text`, `title`, `settings` отправляются в GigaChat.
6. GigaChat должен вернуть JSON с предметом, темой, типом, сложностью и списком атомарных заданий.
7. Ответ приводится к `AnalyzeResponse`.

### `/generate`

Принимает одно исходное атомарное задание и настройки.

Возвращает:

```json
{
  "content": "..."
}
```

Сейчас генерация идет через GigaChat. Prompt учитывает настройки мультипликации и номер варианта.

### `/validate`

Принимает:

- `original`
- `generated`
- `settings`

Возвращает:

```json
{
  "valid": true
}
```

Валидация также идет через GigaChat. Она проверяет, можно ли считать `generated` корректным вариантом `original`.

Текущее ограничение: валидатор сравнивает только пару `original/generated`. Он не знает правильный ответ, не хранит answer key и не делает полноценную межвариантную проверку уникальности.

### `/export`

Принимает полный JSON задачи из core и возвращает DOCX.

DOCX сейчас содержит:

- заголовок;
- метаданные;
- исходные пункты;
- все варианты;
- пометки по `failed`-пунктам.

Экспорт реализован в:

```text
analyze/services/export/docx_exporter.py
```

Формат ответа:

- `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `Content-Disposition` с ASCII `filename` и UTF-8 `filename*`
- бинарное содержимое `.docx`

## Поддерживаемые входные файлы

Сейчас `analyze` умеет определять и парсить:

- `.pdf`
- `.docx`
- `.png`
- `.jpg`
- `.jpeg`
- `.gif`
- `.bmp`
- `.tiff`
- `.webp`
- `.txt`

Определение типа идет по:

- имени файла;
- `Content-Type`;
- magic bytes;
- признаку DOCX как ZIP с `word/document.xml`;
- признакам изображения.

Особенности:

- DOCX читается не только через `python-docx`, но и через XML, чтобы не терять Word Math / Office Math формулы.
- PDF читается через Python PDF-библиотеки; качество зависит от того, есть ли в PDF текстовый слой.
- Изображения идут через GigaChat vision OCR.
- Несколько файлов в одной работе поддерживаются через одно multipart-поле `files`.

## База данных

Миграции находятся в:

```text
core/migrations/
```

Текущие таблицы:

- `users`
- `tasks`
- `task_items`
- `variants`
- `variant_items`
- `variant_item_history`

### `tasks`

Хранит исходную работу:

- `user_id`
- `title`
- `subject`
- `topic`
- `task_type`
- `difficulty`
- `original_text`
- `settings`
- `status`
- `error_message`

### `task_items`

Хранит атомарные исходные пункты:

- `task_id`
- `item_order`
- `context`
- `content`

### `variants`

Хранит варианты:

- `task_id`
- `variant_number`

### `variant_items`

Хранит сгенерированные пункты:

- `variant_id`
- `task_item_id`
- `content`
- `status`
- `error_message`
- `is_edited`

`status` и `error_message` добавлены отдельной миграцией, чтобы не терять пункт, если генерация конкретного задания упала.

### `variant_item_history`

Хранит историю изменений:

- старый текст;
- новый текст;
- источник изменения: `manual_edit` или `regenerate`.

## Frontend

Основной frontend находится в:

```text
variant-generator/
```

Реализовано:

- загрузка файлов через drag-and-drop;
- передача нескольких файлов в поле `files`;
- передача настроек генерации;
- создание задачи;
- страница библиотеки `/library` с историей запросов;
- поиск по названию и исходному тексту;
- фильтр истории по статусу;
- polling статуса задачи;
- просмотр исходных пунктов;
- просмотр вариантов;
- inline-редактирование пункта;
- точечная перегенерация пункта;
- отображение `failed`-пунктов;
- скачивание DOCX.

Важные frontend-типы находятся в:

```text
variant-generator/src/shared/types/domain.ts
```

API-клиенты:

```text
variant-generator/src/shared/api/
```

## Основные контракты

### Создание задачи

```http
POST /api/v1/tasks
X-User-ID: <uuid>
Content-Type: multipart/form-data
```

Поля:

- `title`
- `variant_count`
- `settings`
- `files`
- `text`

`files` можно передавать несколько раз:

```bash
-F "files=@page1.jpg"
-F "files=@page2.jpg"
-F "files=@page3.jpg"
```

Также поддерживается поле `files[]`.

### Настройки генерации

`settings` передается как JSON-строка.

Текущая структура на фронте:

```ts
{
  variation_types: string[];
  number_types: string[];
  number_range: string;
  locked_parts: string[];
  preserve_difficulty: boolean;
  check_answer_uniqueness: boolean;
}
```

Примеры `variation_types`:

- `replace_numbers`
- `reorder_enumeration`
- `synonymize_non_key_wording`
- `replace_context`
- `change_names`
- `change_units`
- `reorder_steps`

### Получение задачи

```http
GET /api/v1/tasks/{id}
X-User-ID: <uuid>
```

Возвращает задачу вместе с `task_items` и `variants`.

### Ручное редактирование пункта

```http
PATCH /api/v1/variants/{variant_id}/items/{variant_item_id}
X-User-ID: <uuid>
Content-Type: application/json
```

Body:

```json
{
  "content": "Новый текст пункта"
}
```

После ручного редактирования:

- `status` становится `ready`;
- `error_message` очищается;
- `is_edited` становится `true`;
- запись попадает в `variant_item_history`.

### Перегенерация пункта

```http
POST /api/v1/variants/{variant_id}/items/{variant_item_id}/regenerate
X-User-ID: <uuid>
```

Логика:

- core находит исходный `TaskItem`;
- вызывает Python `/generate`;
- вызывает Python `/validate`;
- делает до 3 попыток;
- при успехе обновляет `VariantItem`;
- при неуспехе возвращает ошибку, старое состояние пункта сохраняется.

### Экспорт DOCX

```http
GET /api/v1/tasks/{task_id}/export
X-User-ID: <uuid>
```

Core получает задачу из БД, отправляет полный JSON в Python `/export`, получает бинарный DOCX и проксирует его пользователю.

## Поведение при ошибках генерации

Раньше падение одного пункта могло ломать всю генерацию. Сейчас поведение другое:

1. Для каждого пункта есть до 3 попыток `Generate -> Validate`.
2. Если все попытки провалились, создается `VariantItem` со статусом `failed`.
3. Остальные пункты продолжают генерироваться.
4. Задача может завершиться в `done`, даже если часть пунктов `failed`.
5. В `task.error_message` пишется количество failed-пунктов.
6. Пользователь видит failed-пункт во фронте и может перегенерировать его отдельно.
7. В DOCX failed-пункт не пропадает, а выгружается с пометкой.

## Лимиты и устойчивость

### Rate limit пользователей

Каждый `/api/v1/*` запрос проходит через Valkey token bucket.

Если лимит исчерпан:

```http
429 Too Many Requests
```

### Ограничение GigaChat concurrency

Из-за текущего бесплатного синхронного доступа к GigaChat система настроена на последовательные AI-вызовы:

```env
AI_WORKER_CONCURRENCY=1
GIGACHAT_CONCURRENCY=1
```

Это не делает fan-out бесполезным полностью: Go по-прежнему строит очередь задач генерации и умеет независимо обрабатывать результаты, но фактические обращения к GigaChat проходят последовательно.

### Retry

Retry реализован в Go через `retry-go`.

Используется:

- в первичной генерации вариантов;
- в точечной перегенерации.

Количество попыток сейчас: `3`.

## Логирование

Core использует `slog` JSON-логи.

Логируются:

- старт приложения;
- подключение PostgreSQL и Valkey;
- входящие HTTP-запросы;
- создание задачи;
- анализ задачи;
- fan-out / fan-in генерации;
- вызовы AI worker;
- rate limit;
- ручное редактирование;
- перегенерация;
- экспорт.

Python сейчас в основном использует стандартные логи FastAPI/Uvicorn. В списке доработок остается добавление более подробных структурных логов в Python.

## Что проверено вручную

На текущем состоянии проверялись:

- `go test ./...` в `core`;
- `npm run build` во frontend;
- применение миграций через Docker;
- запуск `docker compose up -d --build`;
- реальный DOCX export через core;
- валидность DOCX как ZIP-архива;
- то, что `/export` больше не ждет LLM permit.

Последняя проверка DOCX:

- endpoint: `GET /api/v1/tasks/919a594b-c7be-40c9-b045-dc829319f4f6/export`
- результат: `200 OK`
- размер: `44931` байт
- длительность через core: около `110 ms`

## Текущие ограничения

1. Нет полноценной авторизации: пользователь определяется по `X-User-ID`.
2. GigaChat используется синхронно и с concurrency `1`.
3. Валидация не знает правильные ответы и answer key.
4. Межвариантная проверка уникальности пока не реализована строго.
5. PDF с плохим текстовым слоем может парситься хуже исходного DOCX.
6. Для изображений качество зависит от GigaChat vision OCR.
7. PDF-экспорт пока не реализован; реализован DOCX.
8. `parser_text` есть в репозитории, но не подключен к основной цепочке.
9. Часть старых Markdown-файлов в репозитории повреждена кодировкой; этот файл написан заново в нормальном UTF-8.

## Приоритетные доработки

- Добавить answer key в модель анализа заданий.
- Хранить структуру тестового вопроса: вопрос, варианты ответа, правильный ответ.
- Улучшить валидацию фактологических заданий.
- Реализовать межвариантную проверку уникальности.
- Добавить структурные логи в Python.
- Добавить smoke-тесты Python без реального GigaChat через mock-клиент.
- Реализовать PDF-экспорт.
- Исправить поврежденную кодировку в существующих Markdown/TSX-комментариях.
