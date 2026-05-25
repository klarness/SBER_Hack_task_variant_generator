# C4 Mermaid diagrams

Готовые схемы для Mermaid Live Editor: https://mermaid.live

## 1. System Context

```mermaid
C4Context
title System Context - Генератор заданий

Person(teacher, "Учитель", "Загружает контрольную работу, проверяет исходник, редактирует задания и скачивает варианты.")

System(app, "Генератор заданий", "Сервис генерации вариантов контрольных работ на основе исходного задания.")

System_Ext(gigachat, "GigaChat API", "LLM и vision OCR для анализа, генерации, валидации и распознавания сложных материалов.")
System_Ext(tesseract, "Tesseract OCR", "Локальное OCR для обычного текста на изображениях и страницах PDF.")

Rel(teacher, app, "Работает через браузер")
Rel(app, gigachat, "Отправляет prompts и изображения")
Rel(app, tesseract, "Использует для локального OCR")

UpdateElementStyle(teacher, $bgColor="#D4EFB0", $fontColor="#15200E", $borderColor="#23A038")
UpdateElementStyle(app, $bgColor="#23A038", $fontColor="#FFFFFF", $borderColor="#0F5520")
UpdateElementStyle(gigachat, $bgColor="#E8F1FF", $fontColor="#15200E", $borderColor="#4D7CFE")
UpdateElementStyle(tesseract, $bgColor="#FFF4CC", $fontColor="#15200E", $borderColor="#B7791F")
```

## 2. Container Diagram

```mermaid
C4Container
title Container Diagram - Генератор заданий

Person(teacher, "Учитель", "Пользователь системы")

System_Boundary(system, "Генератор заданий") {
    Container(frontend, "Frontend", "React, Vite, TypeScript, TipTap, MathLive, KaTeX", "Загрузка файлов, проверка исходника, редактирование вариантов, библиотека, экспорт.")
    Container(core, "Core API", "Go, chi, pgx, retry-go, slog", "Основной backend: API, оркестрация генерации, rate limit, работа с БД.")
    Container(analyze, "Analyze Service", "Python, FastAPI, GigaChat SDK, PyMuPDF, pdfplumber, python-docx, python-pptx", "Парсинг файлов, OCR, вызовы GigaChat, генерация, валидация, DOCX/PDF экспорт.")
    ContainerDb(postgres, "PostgreSQL", "PostgreSQL 16", "Задачи, исходные пункты, варианты, история правок.")
    ContainerDb(valkey, "Valkey", "Redis-compatible", "Token Bucket rate limiter.")
}

System_Ext(gigachat, "GigaChat API", "LLM и vision model")
System_Ext(tesseract, "Tesseract OCR", "Локальный OCR движок")

Rel(teacher, frontend, "Открывает сайт", "HTTP")
Rel(frontend, core, "Вызывает API", "HTTP / JSON / multipart")
Rel(core, postgres, "Читает и сохраняет данные", "SQL через pgx")
Rel(core, valkey, "Проверяет лимиты пользователя", "Redis protocol")
Rel(core, analyze, "Отправляет файлы, задания и задачи на экспорт", "HTTP")
Rel(analyze, gigachat, "Analyze / Generate / Validate / Vision OCR", "HTTPS")
Rel(analyze, tesseract, "OCR обычного текста", "local process")

UpdateElementStyle(frontend, $bgColor="#D4EFB0", $fontColor="#15200E", $borderColor="#23A038")
UpdateElementStyle(core, $bgColor="#23A038", $fontColor="#FFFFFF", $borderColor="#0F5520")
UpdateElementStyle(analyze, $bgColor="#CFE8FF", $fontColor="#15200E", $borderColor="#2F6FED")
UpdateElementStyle(postgres, $bgColor="#EDE7FF", $fontColor="#15200E", $borderColor="#6B46C1")
UpdateElementStyle(valkey, $bgColor="#FFE4E4", $fontColor="#15200E", $borderColor="#C53030")
```

## 3. Core API Component Diagram

```mermaid
C4Component
title Component Diagram - Go Core API

Container_Boundary(core, "Core API - Go") {
    Component(router, "HTTP Router", "chi", "Маршруты /api/v1, middleware, healthcheck.")
    Component(handlers, "Handlers", "Go", "Разбор HTTP-запросов, multipart, JSON, ответы фронтенду.")
    Component(rateMiddleware, "Rate Limit Middleware", "Go + Valkey", "Блокирует запросы при превышении лимита.")
    Component(orchestrator, "Orchestrator", "Go goroutines + retry-go", "Асинхронный анализ и fan-out/fan-in генерация вариантов.")
    Component(taskService, "TaskService", "Go", "Библиотека, редактирование, перегенерация, экспорт, удаление задач.")
    Component(repo, "PostgresRepository", "pgx", "CRUD задач, вариантов, истории, фильтрация по user_id.")
    Component(aiClient, "Python AI Client", "net/http", "Клиент к analyze: /analyze, /generate, /validate, /export.")
    Component(limitedClient, "Limited AI Client", "semaphore", "Ограничивает параллельные AI-запросы через AI_WORKER_CONCURRENCY.")
}

ContainerDb(postgres, "PostgreSQL", "Хранит задачи и варианты")
ContainerDb(valkey, "Valkey", "Token Bucket")
Container(analyze, "Analyze Service", "Python FastAPI", "Парсинг, LLM, экспорт")

Rel(router, rateMiddleware, "Пропускает /api/v1/*")
Rel(rateMiddleware, valkey, "Проверяет token bucket")
Rel(router, handlers, "Передает HTTP-запрос")
Rel(handlers, orchestrator, "Создать задачу")
Rel(handlers, taskService, "Получить, удалить, редактировать, экспортировать")
Rel(orchestrator, repo, "Сохраняет задачу, анализ и варианты")
Rel(orchestrator, limitedClient, "Analyze / Generate / Validate")
Rel(taskService, repo, "Читает и обновляет данные")
Rel(taskService, limitedClient, "Точечная перегенерация")
Rel(taskService, aiClient, "Export без LLM permit")
Rel(limitedClient, aiClient, "Ограниченный вызов")
Rel(aiClient, analyze, "HTTP")
Rel(repo, postgres, "SQL")
```

## 4. Analyze Service Component Diagram

```mermaid
C4Component
title Component Diagram - Python Analyze Service

Container_Boundary(analyze, "Analyze Service - Python FastAPI") {
    Component(api, "FastAPI endpoints", "FastAPI", "/parse, /analyze, /generate, /validate, /export")
    Component(extraction, "FileExtractionService", "Python", "Определяет тип файла и выбирает parser.")
    Component(pdfParser, "PDFParser", "PyMuPDF, pdfplumber, Tesseract, GigaChat Vision", "Постраничный парсинг PDF, math OCR, fallback по страницам.")
    Component(docxParser, "DOCXParser", "python-docx, XML, Office Math", "Извлекает абзацы, таблицы, изображения и формулы Word Math.")
    Component(pptxParser, "PPTXParser", "python-pptx, XML", "Извлекает слайды, таблицы, изображения и Office Math.")
    Component(imageParser, "ImageParser", "Pillow, Tesseract, GigaChat Vision", "OCR PNG/JPG/JPEG.")
    Component(txtParser, "TXTParser", "Python", "Декодирует текстовые файлы.")
    Component(normalizer, "Text / HTML / Math Normalizers", "Python regex", "Чистит текст, HTML для prompts, формулы в $...$.")
    Component(llmClient, "GigaChatClient", "gigachat SDK", "Analyze, Generate, Validate, Vision OCR, token cache.")
    Component(docxExport, "DOCX Exporter", "python-docx, latex2mathml, mathml2omml", "Сборка DOCX с формулами, списками и таблицами.")
    Component(pdfExport, "PDF Exporter", "ReportLab, matplotlib.mathtext", "Сборка PDF с кириллицей и формулами-картинками.")
}

System_Ext(gigachat, "GigaChat API", "LLM и vision model")
System_Ext(tesseract, "Tesseract OCR", "Локальный OCR")

Rel(api, extraction, "Передает файлы на парсинг")
Rel(extraction, pdfParser, "PDF")
Rel(extraction, docxParser, "DOCX")
Rel(extraction, pptxParser, "PPTX")
Rel(extraction, imageParser, "PNG/JPG")
Rel(extraction, txtParser, "TXT")
Rel(pdfParser, tesseract, "OCR обычного текста")
Rel(imageParser, tesseract, "OCR обычного текста")
Rel(pdfParser, llmClient, "Math OCR")
Rel(docxParser, llmClient, "OCR изображений при необходимости")
Rel(pptxParser, llmClient, "OCR изображений при необходимости")
Rel(imageParser, llmClient, "Vision OCR")
Rel(api, normalizer, "Нормализует текст и HTML")
Rel(api, llmClient, "Analyze / Generate / Validate")
Rel(llmClient, gigachat, "HTTPS")
Rel(api, docxExport, "Export format=docx")
Rel(api, pdfExport, "Export format=pdf")
```

## 5. Sequence - создание и генерация работы

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Учитель
    participant FE as Frontend
    participant Core as Go Core API
    participant VK as Valkey
    participant DB as PostgreSQL
    participant Analyze as Python Analyze
    participant Giga as GigaChat

    Teacher->>FE: Выбирает предмет и загружает файлы
    FE->>Core: POST /api/v1/tasks multipart(files[], settings)
    Core->>VK: Проверить rate limit по X-User-ID
    VK-->>Core: allowed
    Core->>DB: INSERT tasks(status=processing)
    Core-->>FE: 202 Accepted + task_id

    Core->>Analyze: POST /analyze multipart(files[])
    Analyze->>Analyze: Парсинг PDF/DOCX/PPTX/TXT/PNG/JPG
    Analyze->>Analyze: Склейка файлов в original_text
    Analyze->>Giga: Analyze prompt
    Giga-->>Analyze: JSON items[]
    Analyze-->>Core: original_text + task_items
    Core->>DB: UPDATE task + INSERT task_items

    loop Для каждого исходного задания
        Core->>Analyze: POST /generate source_content + previous_variants
        Analyze->>Giga: Generate prompt
        Giga-->>Analyze: content
        Analyze-->>Core: generated content
        Core->>Analyze: POST /validate original + generated + previous_variants
        Analyze->>Analyze: Локальная проверка дублей
        Analyze->>Giga: Validate prompt
        Giga-->>Analyze: valid=true/false
        Analyze-->>Core: valid
    end

    Core->>DB: INSERT variants + variant_items
    Core->>DB: UPDATE tasks(status=done)
    FE->>Core: GET /api/v1/tasks/{id} polling
    Core-->>FE: Готовая задача с вариантами
    Teacher->>FE: Проверяет, редактирует, экспортирует
```

## 6. Sequence - редактирование исходника и автообновление вариантов

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Учитель
    participant FE as Frontend
    participant Core as Go Core API
    participant DB as PostgreSQL
    participant Analyze as Python Analyze
    participant Giga as GigaChat

    Teacher->>FE: Исправляет исходное задание в редакторе
    FE->>Core: PATCH /api/v1/tasks/{task_id}/items/{item_id}
    Core->>DB: UPDATE task_items WHERE task_id AND user_id
    DB-->>Core: updated TaskItem
    Core-->>FE: updated TaskItem

    FE->>FE: Находит варианты, связанные с исправленным TaskItem

    loop Для каждого связанного VariantItem
        FE->>Core: POST /variants/{variant_id}/items/{item_id}/regenerate
        Core->>DB: Получить Task + TaskItem + VariantItem по user_id
        Core->>Analyze: POST /generate
        Analyze->>Analyze: HTML из редактора -> текст для prompt
        Analyze->>Giga: Generate prompt
        Giga-->>Analyze: content
        Analyze-->>Core: generated content
        Core->>Analyze: POST /validate
        Analyze->>Giga: Validate prompt
        Giga-->>Analyze: valid=true
        Analyze-->>Core: valid
        Core->>DB: UPDATE variant_items + INSERT history
        Core-->>FE: updated VariantItem
    end

    FE-->>Teacher: Показывает обновленные варианты
```

## 7. Sequence - экспорт DOCX/PDF

```mermaid
sequenceDiagram
    autonumber
    actor Teacher as Учитель
    participant FE as Frontend
    participant Core as Go Core API
    participant DB as PostgreSQL
    participant Analyze as Python Analyze

    Teacher->>FE: Выбирает DOCX/PDF и нужные варианты
    FE->>Core: GET /api/v1/tasks/{id}/export?format=pdf&variants=1,2
    Core->>DB: SELECT task + task_items + variants WHERE user_id
    DB-->>Core: Полная задача
    Core->>Core: Фильтрует выбранные варианты
    Core->>Analyze: POST /export?format=pdf
    Analyze->>Analyze: Сборка DOCX или PDF
    Analyze-->>Core: binary file + Content-Disposition
    Core-->>FE: binary file
    FE-->>Teacher: Скачивает файл
```

