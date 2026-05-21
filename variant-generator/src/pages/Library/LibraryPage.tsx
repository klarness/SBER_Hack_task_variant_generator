import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Library,
  Loader2,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react";
import { listTasks } from "@/shared/api/tasks";
import { Input } from "@/shared/ui/Input";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Spinner } from "@/shared/ui/Spinner";
import type { Task, TaskStatus } from "@/shared/types/domain";

type StatusFilter = "all" | TaskStatus;

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "processing", label: "В работе" },
  { value: "done", label: "Готовые" },
  { value: "failed", label: "Ошибки" },
];

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const tasksQuery = useQuery({
    queryKey: ["tasks", "library", query, status],
    queryFn: () =>
      listTasks({
        query: query.trim() || undefined,
        status: status === "all" ? undefined : status,
        limit: 100,
      }),
    placeholderData: (previous) => previous,
  });

  const tasks = tasksQuery.data?.items ?? [];
  const counters = useMemo(() => buildCounters(tasks), [tasks]);

  return (
    <div className="min-h-screen bg-surface-base">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-sber-gradient grid place-items-center text-white font-bold text-sm">
              В
            </span>
            <span className="font-display font-bold text-ink-900">
              Variant&nbsp;Studio
            </span>
          </Link>

          <div className="w-px h-6 bg-border" />

          <div className="inline-flex items-center gap-2 text-sm font-medium text-ink-900">
            <Library size={16} strokeWidth={1.75} />
            Библиотека
          </div>

          <Link
            to="/"
            className="ml-auto inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium text-white bg-sber-gradient hover:bg-sber-gradient-hover transition"
          >
            <Plus size={16} strokeWidth={1.75} />
            Новая работа
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <section className="mb-6">
          <h1 className="text-2xl font-bold font-display text-ink-900">
            История запросов
          </h1>
          <p className="mt-2 text-sm text-ink-700 max-w-2xl">
            Здесь хранятся все работы текущего пользователя: загруженные файлы,
            результат анализа, статус генерации и готовые варианты.
          </p>
        </section>

        <section className="grid grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Всего" value={counters.total} />
          <SummaryCard label="Готово" value={counters.done} tone="success" />
          <SummaryCard label="В работе" value={counters.processing} tone="active" />
          <SummaryCard label="Ошибки" value={counters.failed} tone="danger" />
        </section>

        <section className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-xl">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500"
              strokeWidth={1.75}
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию или исходному тексту"
              className="pl-9"
            />
          </div>

          <div className="inline-flex h-10 rounded-lg border border-border bg-white p-1">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatus(option.value)}
                className={[
                  "px-3 rounded-md text-sm font-medium transition",
                  status === option.value
                    ? "bg-sber-50 text-sber-700"
                    : "text-ink-700 hover:bg-surface-subtle",
                ].join(" ")}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            onClick={() => tasksQuery.refetch()}
            loading={tasksQuery.isFetching}
            title="Обновить список"
          >
            <RefreshCcw size={16} strokeWidth={1.75} />
            Обновить
          </Button>
        </section>

        {tasksQuery.isPending && <LoadingState />}

        {tasksQuery.isError && (
          <Card className="p-8 text-center">
            <AlertCircle
              size={32}
              className="mx-auto text-danger"
              strokeWidth={1.5}
            />
            <h2 className="mt-3 text-base font-semibold text-ink-900">
              Не удалось загрузить библиотеку
            </h2>
            <p className="mt-2 text-sm text-ink-700">
              {(tasksQuery.error as Error).message}
            </p>
          </Card>
        )}

        {!tasksQuery.isPending && !tasksQuery.isError && tasks.length === 0 && (
          <EmptyState hasQuery={query.trim().length > 0 || status !== "all"} />
        )}

        {tasks.length > 0 && (
          <div className="grid gap-3">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "active" | "danger";
}) {
  const toneClass = {
    neutral: "text-ink-900",
    success: "text-emerald-700",
    active: "text-sber-700",
    danger: "text-danger",
  }[tone];

  return (
    <Card className="p-4">
      <div className="text-xs font-semibold text-ink-500 uppercase tracking-wider">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </Card>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <Link to={`/workspace/${task.id}`} className="block">
      <Card hoverable className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-surface-base border border-border-subtle grid place-items-center text-sber-700 shrink-0">
            <FileText size={18} strokeWidth={1.75} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink-900 truncate">
                {task.title || "Без названия"}
              </h2>
              <StatusBadge status={task.status} />
            </div>

            <div className="mt-1 flex items-center gap-2 text-xs text-ink-500">
              <span>{formatDate(task.updated_at || task.created_at)}</span>
              {task.subject && <span>• {task.subject}</span>}
              {task.topic && <span className="truncate">• {task.topic}</span>}
            </div>

            <p className="mt-2 text-sm text-ink-700 line-clamp-2">
              {task.error_message || task.original_text || "Текст еще не извлечен"}
            </p>
          </div>

          <div className="text-sm font-medium text-sber-700 shrink-0">
            Открыть
          </div>
        </div>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const config = {
    pending: {
      label: "В очереди",
      className: "bg-surface-base text-ink-700 border-border",
      icon: Clock3,
    },
    processing: {
      label: "Генерация",
      className: "bg-sber-50 text-sber-700 border-sber-100",
      icon: Loader2,
    },
    done: {
      label: "Готово",
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
      icon: CheckCircle2,
    },
    failed: {
      label: "Ошибка",
      className: "bg-red-50 text-danger border-danger/20",
      icon: AlertCircle,
    },
  }[status];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 h-6 px-2 rounded-full border text-xs font-medium ${config.className}`}
    >
      <Icon
        size={13}
        strokeWidth={1.75}
        className={status === "processing" ? "animate-spin" : undefined}
      />
      {config.label}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="py-16 grid place-items-center">
      <Spinner size={32} />
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <Card className="p-10 text-center">
      <Library size={36} className="mx-auto text-ink-500" strokeWidth={1.5} />
      <h2 className="mt-4 text-base font-semibold text-ink-900">
        {hasQuery ? "Ничего не найдено" : "Библиотека пока пустая"}
      </h2>
      <p className="mt-2 text-sm text-ink-700">
        {hasQuery
          ? "Измените поиск или фильтр статуса."
          : "Создайте первую работу, и она появится здесь автоматически."}
      </p>
      {!hasQuery && (
        <Link
          to="/"
          className="mt-5 inline-flex items-center justify-center h-10 px-4 rounded-lg text-sm font-medium text-white bg-sber-gradient hover:bg-sber-gradient-hover transition"
        >
          <Plus size={16} strokeWidth={1.75} />
          Новая работа
        </Link>
      )}
    </Card>
  );
}

function buildCounters(tasks: Task[]) {
  return tasks.reduce(
    (acc, task) => {
      acc.total += 1;
      if (task.status === "done") acc.done += 1;
      if (task.status === "processing" || task.status === "pending") {
        acc.processing += 1;
      }
      if (task.status === "failed") acc.failed += 1;
      return acc;
    },
    { total: 0, done: 0, processing: 0, failed: 0 }
  );
}

function formatDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
