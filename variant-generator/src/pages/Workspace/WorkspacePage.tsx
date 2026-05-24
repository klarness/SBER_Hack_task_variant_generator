import { Link, useParams, useSearchParams } from "react-router-dom";
import { AlertCircle, ChevronLeft, Library } from "lucide-react";
import { useTaskPolling } from "@/shared/hooks/useTaskPolling";
import { OriginalPreview } from "@/features/original-preview/OriginalPreview";
import { VariantGrid } from "@/features/variant-grid/VariantGrid";
import { ExportBar } from "@/features/export-bar/ExportBar";
import { Spinner } from "@/shared/ui/Spinner";
import { MOCK_TASK } from "@/shared/constants/mock";

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isMock = params.get("mock") === "1";

  const realQuery = useTaskPolling(isMock ? undefined : id);

  const task = isMock ? MOCK_TASK : realQuery.data;
  const isLoading = !isMock && realQuery.isPending;
  const isError = !isMock && realQuery.isError;

  return (
    <div className="canvas-bg h-screen flex flex-col">
      <span className="canvas-blob canvas-blob-1" />
      <span className="canvas-blob canvas-blob-2" />

      <header
        className="canvas-content shrink-0 h-16 px-6 flex items-center gap-4
                   bg-glass-toolbar backdrop-blur-header border-b border-glass-headerBorder"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-ink-900 transition rounded-full px-3 h-9 hover:bg-white/60"
        >
          <ChevronLeft size={16} strokeWidth={2} />
          Новая задача
        </Link>

        <div className="w-px h-6 bg-border/40" />

        <Link
          to="/library"
          className="inline-flex items-center gap-1 text-sm text-ink-700 hover:text-ink-900 transition"
        >
          <Library size={16} strokeWidth={1.75} />
          Библиотека
        </Link>

        <div className="w-px h-6 bg-border" />

        {task && <ExportBar taskId={task.id} title={task.title} />}

        {!isMock && task && task.status !== "done" && (
          <StatusPill status={task.status} />
        )}
      </header>

      <div className="canvas-content flex-1 grid grid-cols-[2fr_3fr] overflow-hidden divide-x divide-border-subtle">
        <div className="overflow-y-auto overscroll-contain">
          {task ? (
            <OriginalPreview task={task} />
          ) : (
            <div className="h-full grid place-items-center">
              {isLoading && <Spinner />}
            </div>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain">
          {isLoading && <LoadingState />}
          {isError && <ErrorState message="Не удалось загрузить задачу" />}
          {task && task.status === "failed" && (
            <ErrorState
              message={task.error_message || "Генерация не удалась"}
            />
          )}
          {task && (task.status === "pending" || task.status === "processing") && (
            <PendingState />
          )}
          {task && task.status === "done" && <VariantGrid task={task} />}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <div className="ml-auto inline-flex items-center gap-2 px-3 h-8 rounded-full bg-accent-soft text-accent-ink text-xs font-semibold">
      <Spinner size={12} />
      {status === "pending" ? "В очереди" : "Генерация…"}
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
        <h3 className="mt-5 text-lg font-bold text-ink-900 tracking-tight">
          Генерируем варианты
        </h3>
        <p className="mt-2 text-sm text-ink-700 leading-relaxed">
          Это может занять несколько минут.
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
