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

После правки от 2026-05-21 limiter в Python сделан общим на модуль `services/llm/client.py`.
Поэтому разные экземпляры `GigaChatClient`, включая клиенты внутри OCR-парсеров PDF/DOCX/image, используют один общий semaphore.

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

## 2026-05-21: возврат безопасного GigaChat-клиента

После эксперимента с ручным `httpx`-клиентом вернули работу через официальную библиотеку `gigachat`.

Что сохранено из эксперимента Python-разработчика:

- более широкое определение типа файла в `FileExtractionService`;
- нормализация OCR-артефактов в `TextNormalizer`;
- более разнообразный prompt генерации.

Что убрано:

- печать `AUTH HEADER`, `CLIENT_ID` и `CLIENT_SECRET` в stdout;
- ручной OAuth/chat-клиент на `httpx`;
- import-time ошибка при отсутствии GigaChat env-переменных;
- игнорирование `GIGACHAT_CONCURRENCY`.

Что восстановлено:

- `GIGACHAT_CREDENTIALS`;
- `GIGACHAT_AUTHORIZATION_KEY`;
- `GIGACHAT_CLIENT_ID` + `GIGACHAT_CLIENT_SECRET`;
- кеш access token;
- общий Python-side limiter для всех экземпляров `GigaChatClient`.

## 2026-05-21: исправление DOCX с формулами Word Math

На файле `математика_7класс (1).docx` парсер видел только текст пунктов, например `а) Выполните действие:`, но терял сами выражения.
Причина: формулы в этом DOCX хранятся не картинками и не обычным текстом, а Office Math XML-узлами `m:oMath`.
`python-docx` через `paragraph.text` эти формулы не возвращает.

Что изменено:

- `DOCXParser` теперь читает `word/document.xml` напрямую;
- текст и формулы собираются в исходном порядке;
- `m:oMath` конвертируется в читаемый текст: степени через `^`, умножение через `*`, скобки из delimiter-свойств Word Math;
- старый OCR вложенных картинок в DOCX оставлен без изменения;
- `/parse` исправлен: `UploadFile.seek()` больше не вызывается с неподдерживаемым `whence`.

Проверка:

```bash
curl -F "file=@математика_7класс (1).docx" http://localhost:8000/parse
```

Теперь файл извлекается так:

```text
а) 3xy*(4yz); б) (3b^4c)^2;
в) (x+2)(x+5); г) (5a^2-8ab+2a):2a.
...
б) (x-1)(x-2)-x^2=17.
```

## 2026-05-21: исправление PDF с математическими формулами

Тот же материал после сохранения в PDF падал на `/analyze` с ошибкой:

```text
GigaChat analyze item content is empty
```

Причина была в текстовом слое PDF: PyMuPDF через `page.get_text()` отдавал формулы в неправильном порядке.
Например метки `а)`, `б)` шли отдельно, а сами выражения переносились ниже отдельными кусками.
Из-за этого LLM получал плохо собранный `original_text` и иногда возвращал пустой `content` у item.

Что изменено сначала:

- `PDFParser` теперь собирает текст не через готовый `page.get_text()`, а через `page.get_text("words")`;
- слова группируются в визуальные строки по координатам;
- математические italic-символы нормализуются в обычные `x`, `y`, `a`, `b`;
- верхние индексы в PDF-текстовом слое восстанавливаются как `^`;
- строки возвращаются через `\n`, чтобы LLM лучше видел структуру работы.

Дополнительная правка для точности:

- добавлен `pdfplumber`;
- для PDF с текстовым слоем он используется первым, потому что на этом файле лучше восстановил скобки и порядок внутри выражения `2(c+5)-a(c+5)`;
- PyMuPDF-координатный разбор оставлен как fallback, если `pdfplumber` не смог извлечь текст;
- OCR вложенных картинок в PDF оставлен как раньше.

Проверка:

```bash
curl -F "file=@математика_7класс.docx.pdf" http://localhost:8000/parse
curl -F "files=@математика_7класс.docx.pdf" -F "title=Математика 7 класс" -F "settings={}" http://localhost:8000/analyze
```

Результат `/analyze`: `200 OK`, найдено 5 заданий.

После добавления `pdfplumber` проблемный фрагмент извлекается так:

```text
в) 2(c+5)-a(c+5); г) 3a-3c+xa-xc.
```

Ограничение: PDF все равно не является идеальным источником для формул.
Если в PDF нет нормального текстового слоя или формулы нарисованы как изображение/векторные куски, нужна OCR/vision-ветка по странице.
Если есть исходный DOCX, он надежнее, потому что формулы там хранятся как Office Math, а не как набор координат символов.

## 2026-05-21: длинные контрольные и ремонт JSON от GigaChat

На файле `demonstraczionnyj-variant-vhodnoj-kontrolnoj-raboty-po-istorii-10-klass (1).docx` парсинг DOCX проходил успешно, но `/analyze` падал:

```text
GigaChat analyze failed: Expecting value: line 15 column 40
```

Причина: на длинной контрольной из 25 пунктов GigaChat вернул почти JSON, но с синтаксической ошибкой.
Старый код пытался сделать только `json.loads()` и падал с `502`.

Что изменено:

- добавлена библиотека `json-repair`;
- `parse_json_object()` сначала пробует строгий `json.loads()`;
- если JSON сломан, извлекает объект из ответа и прогоняет через `json-repair`;
- для `items` добавлена мягкая нормализация полей: кроме `content` принимаются `question`, `text`, `task`, `prompt`.

Проверка:

```bash
curl -F "files=@demonstraczionnyj-variant-vhodnoj-kontrolnoj-raboty-po-istorii-10-klass (1).docx" \
  -F "title=История 10 класс" \
  -F "settings={}" \
  http://localhost:8000/analyze
```

Результат: `200 OK`, найдено 25 заданий.

## 2026-05-21: `/export` и кириллица в имени файла

В логах также был отдельный сбой `/export`:

```text
UnicodeEncodeError: 'latin-1' codec can't encode characters
```

Причина: Starlette кодирует обычные HTTP-заголовки как latin-1, а мы передавали кириллический `filename` прямо в `Content-Disposition`.

Что изменено:

- обычный `filename` теперь ASCII-safe;
- оригинальное имя передается через `filename*=UTF-8''...`;
- `X-Filename` тоже ASCII-safe.

Проверка: `/export` с заголовком `История 10 класс` вернул DOCX без `500`.

## 2026-05-21: HTML-теги и `V.` в заданиях

На исторической контрольной GigaChat иногда возвращал варианты ответов внутри HTML-списка:

```text
<ul><li>а) ...</li><li>б) ...</li></ul>
```

Фронт показывает `content` как plain text, поэтому эти теги были видны пользователю.
Также модель иногда заменяла кириллический вариант `В.` на латинское `V.`.

Что изменено:

- все `content/context`, пришедшие от LLM, перед отдачей на фронт очищаются от HTML;
- `<li>` превращается в обычный текст с разделителем `;`;
- `A.`, `B.`, `V.` в маркерах ответов нормализуются в `А.`, `В.`;
- та же нормализация маркеров добавлена в общий `TextNormalizer`, чтобы исходный текст тоже был стабильнее.

Проверка:

```bash
curl -F "files=@demonstraczionnyj-variant-vhodnoj-kontrolnoj-raboty-po-istorii-10-klass (1).docx" \
  -F "title=История 10 класс" \
  -F "settings={}" \
  http://localhost:8000/analyze
```

В ответе не найдено `<ul>`, `<li>`, `</li>` или `V.`.

## Что нужно доработать в `analyze`

Приоритетно:

- сделать межвариантную проверку уникальности: не сохранять два одинаковых `content` в одной работе;
- учитывать `check_answer_uniqueness` не только в prompt, но и в коде;
- передавать в генерацию информацию о уже созданных вариантах или делать отдельную проверку после fan-in;
- покрыть общий limiter тестом, чтобы OCR не обходил `GIGACHAT_CONCURRENCY`;
- улучшить prompt `/generate`, чтобы `variant_number` реально влиял на разнообразие;
- добавить нормальный JSON repair для ответов GigaChat;
- добавить структурные логи в Python на уровне ручек и вызовов GigaChat;
- реализовать PDF-экспорт и улучшить DOCX;
- добавить ответы для учителя, если они нужны в выгрузке;
- добавить smoke-тесты без реального GigaChat через mock-клиент.
## 2026-05-21: рабочий DOCX-экспорт

Проблема: экспорт в DOCX был реализован прямо в `main.py` минимальной функцией. Дополнительно core пропускал `/export` через тот же limiter, что и обращения к GigaChat. Из-за `GIGACHAT_CONCURRENCY=1` выгрузка могла ждать длинную очередь `generate/validate`, хотя сама сборка DOCX не обращается к LLM.

Что изменено:

- сборка DOCX вынесена в `analyze/services/export/docx_exporter.py`;
- документ теперь содержит метаданные, исходные пункты и все варианты;
- `failed`-пункты не пропадают: в DOCX пишется пометка, что пункт не удалось сгенерировать;
- многострочный текст сохраняется с переносами;
- `Content-Disposition` возвращает ASCII `filename` и UTF-8 `filename*`;
- в core экспорт больше не занимает LLM permit;
- frontend умеет читать `filename*=UTF-8''...` при скачивании.

Проверка:

```bash
curl -H "X-User-ID: 11111111-1111-1111-1111-111111111111" \
  http://localhost:8080/api/v1/tasks/<task_id>/export \
  -o export.docx
```

Фактическая проверка на задаче `919a594b-c7be-40c9-b045-dc829319f4f6`: `200 OK`, DOCX валидный как ZIP, размер `44931` байт, длительность запроса через core около `90 ms`.
