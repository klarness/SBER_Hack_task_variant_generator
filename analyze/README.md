# Изменения в Python-сервисе `analyze`

Этот файл нужен разработчику Python-сервиса, чтобы быстро понять, что было изменено при интеграции с Go-сервисом `core`.
Здесь описаны только наши изменения и найденные ограничения, без пересказа всего проекта.

## Коротко

`analyze` теперь работает как AI-worker для Go-бэкенда:

```text
core -> analyze /analyze -> GigaChat
core -> analyze /generate -> GigaChat
core -> analyze /validate -> GigaChat
core -> analyze /export -> DOCX
```

Сервис принимает несколько файлов как одно эталонное задание, извлекает текст, склеивает его в один `original_text`, анализирует через GigaChat, генерирует варианты и валидирует результат.

Сервис `parser_text` сейчас не участвует в основной цепочке.

## Docker

Исправлен `analyze/Dockerfile`.

Что было сделано:

- убран лишний второй `FROM alpine`, который перетирал Python-образ;
- запуск uvicorn исправлен на `analyze.main:app`;
- код копируется в контейнер как пакет `/app/analyze`;
- импорты вида `from analyze...` теперь работают в Docker;
- порт сервиса остался `8000`.

Команда запуска внутри контейнера:

```bash
uvicorn analyze.main:app --host 0.0.0.0 --port 8000
```

В root `docker-compose.yaml` сервис `analyze` собирается из папки `analyze`, а `core` обращается к нему по адресу:

```text
http://analyze:8000
```

## Зависимости

В `requirements.txt` оставлена официальная библиотека GigaChat:

```text
gigachat
```

Также добавлено:

```text
python-dotenv
```

Лишние зависимости `docx` и `asyncio` были убраны. Для DOCX используется `python-docx`.

## Переменные окружения GigaChat

`GigaChatClient` читает настройки из окружения.

Поддерживаются варианты:

- `GIGACHAT_CREDENTIALS`;
- `GIGACHAT_AUTHORIZATION_KEY`;
- `GIGACHAT_CLIENT_SECRET`, если там лежит готовый Authorization Key из GigaChat Studio;
- `GIGACHAT_CLIENT_ID` + `GIGACHAT_CLIENT_SECRET`, если нужно собрать credentials как base64 от `client_id:client_secret`.

Секреты в логах и документации не выводятся.

Дополнительные настройки:

```env
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat
GIGACHAT_TIMEOUT=60.0
GIGACHAT_VERIFY_SSL_CERTS=false
GIGACHAT_CONCURRENCY=1
```

Для локальной разработки `GIGACHAT_VERIFY_SSL_CERTS=false` допустим. Для прода нужно включать проверку сертификатов и корректно устанавливать корневые сертификаты.

## Access token

Добавлен кеш access token внутри `GigaChatClient`.

Зачем:

- GigaChat access token живет ограниченное время;
- если получать OAuth token перед каждым запросом, быстро ловится `429 Too Many Requests`;
- теперь token запрашивается один раз и переиспользуется до истечения срока.

Перед истечением срока token считается устаревшим заранее, с запасом примерно 60 секунд.

## Лимит параллельных LLM-запросов

У нас бесплатный GigaChat с жестким ограничением по параллельности.
Поэтому ограничение стоит в двух местах:

- в Go: `AI_WORKER_CONCURRENCY=1`;
- в Python: `GIGACHAT_CONCURRENCY=1`.

Go все еще может создавать много горутин для fan-out/fan-in, но фактические HTTP-вызовы к `analyze` сериализуются через Go-limiter.
Python-limiter нужен как дополнительная защита, если кто-то дергает `analyze` напрямую.

Важное ограничение: парсеры PDF/DOCX/image сейчас создают отдельные экземпляры `GigaChatClient`. Из-за этого OCR внутри документов потенциально может обойти единый процессный лимит, если одновременно обрабатывается много изображений. Это нужно доработать: сделать общий singleton-клиент или общий semaphore на модуль.

## HTTP-ручки

### `GET /healthz`

Простая проверка живости:

```json
{"status":"ok"}
```

### `POST /parse`

Старая/вспомогательная ручка для парсинга одного файла.

Принимает:

```text
file
```

Возвращает сырой и нормализованный текст.

Основная цепочка Go сейчас использует не `/parse`, а `/analyze`.

### `POST /analyze`

Главная ручка анализа эталонного задания.

Go отправляет `multipart/form-data`.

Поля:

```text
files    повторяющееся поле для массива файлов
text     опциональный сырой текст
title    название задания
settings JSON-строка с параметрами мультипликации
user_id  идентификатор пользователя
```

Поддерживаются оба имени поля для файлов на Go-стороне:

```text
files
files[]
```

Что происходит:

1. Каждый файл проходит через `FileExtractionService`.
2. TXT читается как UTF-8.
3. PDF парсится через PyMuPDF, текст страниц извлекается напрямую.
4. Картинки внутри PDF/DOCX дополнительно отправляются в GigaChat vision для OCR.
5. PNG/JPG/JPEG отправляются в GigaChat vision для OCR.
6. Все распознанные части нормализуются.
7. Все части склеиваются в один `original_text`.
8. `original_text`, `title` и `settings` отправляются в GigaChat.
9. GigaChat должен вернуть предмет, тему, тип, сложность и список атомарных заданий.

Ответ:

```json
{
  "original_text": "...",
  "subject": "Mathematics",
  "topic": "Algebra",
  "task_type": "problem",
  "difficulty": "easy",
  "items": [
    {
      "order": 1,
      "context": "",
      "content": "Solve the equation: x + 2 = 5"
    }
  ]
}
```

Старый fallback-разбор по нумерации больше не используется в рабочем `/analyze`.
Если GigaChat не отвечает, возвращает не JSON или не возвращает `items`, ручка отвечает `502`.

### История с нумерацией

До подключения LLM был временный split по номерам.
На smoke-тесте нашли баг:

```text
1. Решите уравнение x + 2 = 5. 2. Вычислите 3 + 4.
```

Число `5.` ошибочно воспринималось как новое задание.
Мы исправляли это проверкой последовательности `1.`, `2.`, `3.`, но сейчас эта логика не является основной: структуру заданий возвращает GigaChat.

### `POST /generate`

Генерация одного `VariantItem`.

Go отправляет JSON:

```json
{
  "user_id": "...",
  "task_id": "...",
  "task_item_id": "...",
  "variant_number": 1,
  "order": 1,
  "context": "",
  "source_content": "Solve the equation: x + 2 = 5",
  "settings": {}
}
```

Python нормализует `settings`, добавляет их в prompt и вызывает GigaChat.

GigaChat должен вернуть:

```json
{"content":"..."}
```

Если ответ не JSON или `content` пустой, ручка отвечает `502`.

### `POST /validate`

Проверка одного сгенерированного задания.

Go отправляет:

```json
{
  "user_id": "...",
  "task_id": "...",
  "task_item_id": "...",
  "variant_number": 1,
  "original": "...",
  "generated": "...",
  "settings": {}
}
```

Python передает `original`, `generated` и нормализованные `settings` в GigaChat.

Ожидаемый ответ GigaChat:

```json
{"valid":true}
```

После smoke-тестов prompt валидатора был смягчен:

- разные числа допустимы;
- другой правильный ответ допустим;
- имена, контекст и единицы можно менять, если это разрешено `settings`;
- нельзя менять тип задания, тему, сложность и дидактическую цель;
- нельзя возвращать решение вместо условия.

Ограничение: сейчас `/validate` сравнивает только `original` и `generated`. Он не знает остальные варианты этой же работы, поэтому не может надежно проверить совпадение ответов или дубли между вариантами.

### `POST /export`

Экспорт пока базовый.

Go отправляет полный JSON задачи с вариантами.
Python собирает DOCX через `python-docx` и возвращает бинарный файл.

Сейчас в DOCX есть:

- заголовок;
- исходный текст;
- заголовки вариантов;
- задания внутри вариантов.

Пока нет:

- PDF-экспорта;
- красивой верстки;
- ответов для учителя;
- маркировки сложности цветом/иконкой;
- проверки, что варианты удобно помещаются на странице.

## Контракт `settings`

`settings` приходит из Go как JSON-объект.
Он соответствует параметрам мультипликации из требований.

Рекомендуемый формат:

```json
{
  "variation_types": [
    "replace_numbers",
    "reorder_enumeration",
    "synonymize_non_key_wording",
    "replace_context",
    "change_names",
    "change_units",
    "reorder_steps"
  ],
  "number_types": ["integers", "decimals", "fractions"],
  "number_range": "keep comparable to original",
  "locked_parts": ["не менять эту часть условия"],
  "preserve_difficulty": true,
  "check_answer_uniqueness": true
}
```

Поддерживаемые `variation_types`:

```text
replace_numbers              заменить числовые данные
reorder_enumeration          изменить порядок перечисления условий/объектов/действий
synonymize_non_key_wording   заменить неключевые формулировки синонимами
replace_context              заменить ситуацию или пример при сохранении логики
change_names                 изменить имена, названия, обозначения
change_units                 изменить единицы измерения без изменения сложности
reorder_steps                переставить шаги в многошаговой инструкции
```

Для обратной совместимости Python также понимает boolean-поля:

```json
{
  "change_numbers": true,
  "change_context": true,
  "change_names": true
}
```

Если `variation_types` пустой, используется базовый набор:

```json
["replace_numbers", "replace_context", "change_names"]
```

Важно: `variant_count` не находится внутри `settings`. Это отдельное multipart-поле, которое Go валидирует как число от 2 до 10.

## Что убрали из рабочей цепочки

Убраны эвристические fallback-и из основных LLM-ручек:

- `/analyze` больше не должен молча делить текст регулярками при сбое LLM;
- `/generate` больше не должен просто заменять числа локальной эвристикой;
- `/validate` больше не должен принимать результат только по непустому тексту или пересечению слов.

Теперь при проблеме LLM ручки возвращают ошибку `502`, чтобы Go видел реальный сбой и мог корректно пометить задачу как `failed`.

## Проверки, которые запускались

Локальные проверки:

```bash
python -m compileall analyze
go test ./...
docker compose config --quiet
docker compose up -d --build core analyze
```

Health-check:

```bash
GET http://localhost:8000/healthz
```

Прямые проверки Python:

- `/generate` вернул новый вариант через GigaChat;
- `/analyze` разобрал текст на атомарные задания через GigaChat;
- `/validate` отвечает через GigaChat, но качество решения зависит от prompt.

Полная проверка через Go:

```text
POST /api/v1/tasks
GET /api/v1/tasks/{id}
GET /api/v1/tasks/{id}/export
```

Результат полного smoke-теста:

- задача дошла до `done`;
- `/analyze` отработал;
- `/generate` вызвался 2 раза;
- `/validate` вызвался 2 раза;
- варианты сохранились в PostgreSQL;
- `/export` вернул DOCX.

Найденный дефект: два варианта для простого уравнения получились одинаковыми.
Это показывает, что `check_answer_uniqueness` пока не реализован как межвариантная проверка.

## Что нужно доработать в `analyze`

Приоритетно:

- сделать межвариантную проверку уникальности: не сохранять два одинаковых `content` в одной работе;
- учитывать `check_answer_uniqueness` не только в prompt, но и в коде;
- передавать в генерацию информацию о уже созданных вариантах или делать отдельную проверку после fan-in;
- сделать общий процессный limiter для всех GigaChat-вызовов, включая OCR в PDF/DOCX/image;
- улучшить prompt `/generate`, чтобы `variant_number` реально влиял на разнообразие;
- добавить нормальный JSON repair для ответов GigaChat;
- добавить структурные логи в Python на уровне ручек и вызовов GigaChat;
- реализовать PDF-экспорт и улучшить DOCX;
- добавить ответы для учителя, если они нужны в выгрузке;
- добавить smoke-тесты без реального GigaChat через mock-клиент.

