# Variant Studio — Фронт

ИИ-генератор вариантов учебных заданий. Хакатон Сбера.

## Установка

```bash
# из распакованной папки скелета
npm install
npm run dev
```

Откроется на `http://localhost:5173`.

## Что нужно дописать вручную после распаковки

### 1. tsconfig.json — добавить алиас `@`

В `compilerOptions` добавить:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### 2. index.html — обновить title и lang

```html
<html lang="ru">
  <head>
    <title>Variant Studio</title>
  </head>
</html>
```

### 3. Проверить, что бек на 8080

В `.env.local` стоит `VITE_API_BASE_URL=http://localhost:8080`. Если у вас другой порт — поменять.

Если хочется без CORS — раскомментировать прокси в `vite.config.ts` и тогда в `.env.local` сделать `VITE_API_BASE_URL=` (пусто), фронт будет ходить в свой же origin.

## Демо без бека

`http://localhost:5173/workspace/mock?mock=1` — откроет Workspace на моковых данных. Удобно для верстки в первую очередь, пока бек не готов.

## Структура

```
src/
├── app/           — App.tsx, роутер, react-query, DesktopGuard
├── pages/         — UploadPage, WorkspacePage
├── features/      — изолированные блоки UI (форма, грид, карточка, редактор)
├── shared/
│   ├── api/       — обёртки над HTTP
│   ├── types/     — domain.ts (синхронен с domain/models.go)
│   ├── hooks/     — useTaskPolling, useDebouncedCallback
│   ├── ui/        — Button, Card, Input и пр.
│   ├── lib/       — cn()
│   └── constants/ — mock.ts
└── styles/        — index.css с токенами Сбера
```

## Контракт с беком

| Метод  | Путь                                                      | Что делает          |
|--------|-----------------------------------------------------------|---------------------|
| POST   | `/api/v1/tasks`                                           | Создать задачу       |
| GET    | `/api/v1/tasks/{id}`                                      | Получить задачу (polling) |
| GET    | `/api/v1/tasks`                                           | Список задач         |
| GET    | `/api/v1/tasks/{id}/export`                               | Скачать PDF/DOCX     |
| PATCH  | `/api/v1/variants/{variant_id}/items/{item_id}`           | Редактировать вопрос |
| POST   | `/api/v1/variants/{variant_id}/items/{item_id}/regenerate`| Перегенерировать вопрос |

Все ручки требуют `X-User-ID: <uuid>` в заголовке. Пока берётся из `.env.local`.

## Дизайн-токены

См. `tailwind.config.js`. Основное:
- `bg-sber-gradient` — фирменный градиент
- `text-sber-500`, `text-sber-700` — зелёный текст
- `bg-surface-base` (#F7F7F8) — фон страницы
- `bg-surface-card` (#FFFFFF) — карточки
- `shadow-card`, `shadow-cardHover` — тени
- Шрифт: SB Sans / Manrope (см. `src/styles/index.css`)

## Шрифт SB Sans

Когда найдёшь файлы шрифта — положи их в `public/fonts/` и раскомментируй `@font-face` в `src/styles/index.css`.

## Иконки

`lucide-react`. Размеры по умолчанию: 14 в тулбарах, 16 в инпутах, 18-20 на кнопках, `strokeWidth={1.75}` для мягкости. Иконки используемые: Sparkles, UploadCloud, FileText, X, Image, Bold, Italic, RotateCw, Pencil, Download, BookmarkPlus, ChevronLeft, AlertCircle, Monitor, Loader2, Heading2, List, ListOrdered, RotateCcw, Check, FileType2.
