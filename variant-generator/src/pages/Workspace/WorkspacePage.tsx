import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, AlertCircle } from "lucide-react";
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
    <div className="h-screen flex flex-col bg-surface-base">
      {/* Top bar */}
      <header className="shrink-0 h-14 bg-white border-b border-border-subtle px-5 flex items-center gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-ink-700 hover:text-ink-900 transition"
        >
          <ChevronLeft size={16} />
          Новая задача
        </Link>

        <div className="w-px h-6 bg-border" />

        {task && <ExportBar taskId={task.id} title={task.title} />}

        {!isMock && task && task.status !== "done" && (
          <StatusPill status={task.status} />
        )}
      </header>

      {/* Workspace body */}
      <div className="flex-1 grid grid-cols-[minmax(0,400px)_1fr] overflow-hidden">
        {/* Left: original */}
        <div className="overflow-hidden">
          {task ? (
            <OriginalPreview task={task} />
          ) : (
            <div className="h-full bg-white border-r border-border-subtle grid place-items-center">
              {isLoading && <Spinner />}
            </div>
          )}
        </div>

        {/* Right: variants */}
        <div className="overflow-hidden">
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
    <div className="ml-auto inline-flex items-center gap-2 px-3 h-7 rounded-full bg-sber-50 text-sber-700 text-xs font-medium">
      <Spinner size={12} />
      {status === "pending" ? "В очереди" : "Генерация…"}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="h-full p-5">
      <div className="grid grid-cols-3 gap-4 h-full">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl2 border border-border-subtle shimmer"
          />
        ))}
      </div>
    </div>
  );
}

function PendingState() {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="text-center max-w-sm">
        <Spinner size={32} />
        <h3 className="mt-4 text-base font-semibold text-ink-900">
          Генерируем варианты
        </h3>
        <p className="mt-2 text-sm text-ink-700">
          Это может занять до минуты. Можно не закрывать вкладку — мы обновим
          интерфейс автоматически.
        </p>
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full grid place-items-center p-8">
      <div className="text-center max-w-sm">
        <AlertCircle size={32} className="mx-auto text-danger" strokeWidth={1.5} />
        <h3 className="mt-3 text-base font-semibold text-ink-900">
          Что-то пошло не так
        </h3>
        <p className="mt-2 text-sm text-ink-700">{message}</p>
      </div>
    </div>
  );
}
