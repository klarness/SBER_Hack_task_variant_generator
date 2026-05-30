import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  FileCheck2,
  Library,
  Sparkles,
} from "lucide-react";
import { useTaskPolling } from "@/shared/hooks/useTaskPolling";
import { OriginalPreview } from "@/features/original-preview/OriginalPreview";
import { VariantGrid } from "@/features/variant-grid/VariantGrid";
import { ExportBar } from "@/features/export-bar/ExportBar";
import { Spinner } from "@/shared/ui/Spinner";
import { Button } from "@/shared/ui/Button";
import { MOCK_TASK } from "@/shared/constants/mock";
import { cn } from "@/shared/lib/cn";

type WorkspaceStep = "source" | "variants" | "export";

const STEPS: Array<{
  id: WorkspaceStep;
  title: string;
  description: string;
}> = [
  {
    id: "source",
    title: "Проверьте исходник",
    description: "Исправьте распознанный текст, если нужно.",
  },
  {
    id: "variants",
    title: "Проверьте варианты",
    description: "Посмотрите задания и перегенерируйте спорные пункты.",
  },
  {
    id: "export",
    title: "Скачайте работу",
    description: "Выберите варианты и формат файла.",
  },
];

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isMock = params.get("mock") === "1";
  const [activeStep, setActiveStep] = useState<WorkspaceStep>("source");

  const realQuery = useTaskPolling(isMock ? undefined : id);

  const task = isMock ? MOCK_TASK : realQuery.data;
  const isLoading = !isMock && realQuery.isPending;
  const isError = !isMock && realQuery.isError;
  const isDone = task?.status === "done";

  useEffect(() => {
    if (!task) return;
    setActiveStep("source");
  }, [task?.id]);

  return (
    <div className="canvas-bg min-h-screen flex flex-col">
      <span className="canvas-blob canvas-blob-1" />
      <span className="canvas-blob canvas-blob-2" />

      <header
        className="canvas-content shrink-0 min-h-16 px-6 py-3 flex items-center gap-4
                   bg-white border-b border-border-subtle"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-ink-900 transition rounded-full px-3 h-9 hover:bg-white/60"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Новая работа
        </Link>

        <div className="w-px h-6 bg-border/40" />

        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm text-ink-700 hover:text-ink-900 transition"
        >
          <Library size={16} strokeWidth={1.75} />
          Библиотека
        </Link>

        {task && (
          <div className="min-w-0 ml-1 mr-auto">
            <h1 className="text-sm font-semibold text-ink-900 truncate max-w-md">
              {task.title}
            </h1>
            <p className="text-xs text-ink-500 truncate">
              {task.subject || "Предмет не указан"}
            </p>
          </div>
        )}

        {!isMock && task && task.status !== "done" && (
          <StatusPill status={task.status} />
        )}
      </header>

      <main className="canvas-content flex-1">
        {isLoading && <LoadingState />}
        {isError && <ErrorState message="Не удалось загрузить задачу" />}
        {task && task.status === "failed" && (
          <ErrorState message={task.error_message || "Генерация не удалась"} />
        )}
        {task && (task.status === "pending" || task.status === "processing") && (
          <PendingState />
        )}
        {task && isDone && (
          <div className="flex flex-col">
            <WorkflowSteps activeStep={activeStep} onChange={setActiveStep} />
            <section>
              {activeStep === "source" && (
                <div className="max-w-5xl mx-auto">
                  <OriginalPreview task={task} />
                  <StepActions>
                    <Button size="lg" onClick={() => setActiveStep("variants")}>
                      Все верно, перейти к вариантам
                      <ArrowRight size={17} />
                    </Button>
                  </StepActions>
                </div>
              )}

              {activeStep === "variants" && (
                <div className="max-w-5xl mx-auto">
                  <VariantGrid task={task} />
                  <StepActions>
                    <Button
                      size="lg"
                      variant="secondary"
                      onClick={() => setActiveStep("source")}
                    >
                      Вернуться к исходнику
                    </Button>
                    <Button size="lg" onClick={() => setActiveStep("export")}>
                      Перейти к скачиванию
                      <ArrowRight size={17} />
                    </Button>
                  </StepActions>
                </div>
              )}

              {activeStep === "export" && (
                <ExportStep task={task} onBack={() => setActiveStep("variants")} />
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function WorkflowSteps({
  activeStep,
  onChange,
}: {
  activeStep: WorkspaceStep;
  onChange: (step: WorkspaceStep) => void;
}) {
  const activeIndex = STEPS.findIndex((step) => step.id === activeStep);

  return (
    <div className="shrink-0">
      <div className="max-w-5xl mx-auto px-5 py-3 grid md:grid-cols-3 gap-2">
        {STEPS.map((step, index) => {
          const active = step.id === activeStep;
          const completed = index < activeIndex;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onChange(step.id)}
              className={cn(
                "min-w-0 rounded-xl border px-4 py-3 text-left transition",
                active
                  ? "border-accent bg-accent-soft/70"
                  : "border-border-subtle bg-white/60 hover:bg-white"
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    active
                      ? "bg-accent text-white"
                      : completed
                        ? "bg-accent-soft text-accent-ink"
                        : "bg-surface-subtle text-ink-600"
                  )}
                >
                  {completed ? <Check size={14} /> : index + 1}
                </span>
                <span className="text-sm font-bold text-ink-900 truncate">
                  {step.title}
                </span>
              </div>
              <p className="mt-1.5 pl-9 text-xs text-ink-600 leading-snug">
                {step.description}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ExportStep({
  task,
  onBack,
}: {
  task: typeof MOCK_TASK;
  onBack: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-5 py-8">
      <div className="glass-card p-6 md:p-8">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Download size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold font-display text-ink-900">
              Скачать готовую работу
            </h2>
            <p className="mt-2 text-sm text-ink-700 leading-relaxed">
              Выберите нужные варианты и скачайте файл. DOCX удобнее для
              дальнейшего редактирования, PDF подходит для быстрой печати.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-border-subtle bg-white/70 px-4 py-4">
          <ExportBar
            taskId={task.id}
            title={task.title}
            variants={task.variants ?? []}
          />
        </div>

        <div className="mt-6 flex justify-between gap-3">
          <Button size="lg" variant="secondary" onClick={onBack}>
            Вернуться к вариантам
          </Button>
          <div className="hidden sm:flex items-center gap-2 text-sm text-ink-600">
            <FileCheck2 size={16} />
            Готово к выдаче ученикам
          </div>
        </div>
      </div>
    </div>
  );
}

function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-2 pb-8">
      <div className="flex flex-wrap justify-end gap-3">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <div className="ml-auto inline-flex items-center gap-2 px-3 h-8 rounded-full bg-accent-soft text-accent-ink text-xs font-semibold">
      <Spinner size={12} />
      {status === "pending" ? "В очереди" : "Генерация..."}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="h-full p-5">
      <div className="h-full glass-card shimmer" />
    </div>
  );
}

function PendingState() {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="glass-card text-center max-w-md px-10 py-12">
        <Spinner size={32} />
        <Sparkles size={24} className="mx-auto mt-5 text-accent" />
        <h3 className="mt-4 text-lg font-bold text-ink-900 tracking-tight">
          Готовим варианты
        </h3>
        <p className="mt-2 text-sm text-ink-700 leading-relaxed">
          Мы распознаем исходник, разбираем задания и создаем варианты. Это
          может занять несколько минут.
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="glass-card text-center max-w-md px-10 py-10">
        <AlertCircle size={32} className="mx-auto text-danger" strokeWidth={1.75} />
        <h3 className="mt-3 text-lg font-bold text-ink-900">
          Что-то пошло не так
        </h3>
        <p className="mt-2 text-sm text-ink-700 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
