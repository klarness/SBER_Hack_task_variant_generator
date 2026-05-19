import type { Task } from "@/shared/types/domain";

interface Props {
  task: Task;
}

export function OriginalPreview({ task }: Props) {
  const items = [...(task.task_items ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="h-full flex flex-col bg-white border-r border-border-subtle">
      <header className="px-5 py-4 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-ink-900">
          Исходное задание
        </h2>
        <p className="mt-1 text-xs text-ink-500 line-clamp-1">
          {task.subject ? `${task.subject}` : "—"}
          {task.topic ? ` · ${task.topic}` : ""}
          {task.difficulty ? ` · ${task.difficulty}` : ""}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {items.length === 0 ? (
          <pre className="whitespace-pre-wrap text-sm text-ink-700 font-sans leading-relaxed">
            {task.original_text}
          </pre>
        ) : (
          items.map((it) => (
            <div
              key={it.id}
              className="rounded-lg border border-border-subtle p-3 bg-surface-base/40"
            >
              <div className="text-xs font-semibold text-sber-700 mb-1">
                Q{it.order}
              </div>
              <div className="text-sm text-ink-900 whitespace-pre-wrap leading-relaxed">
                {it.content}
              </div>
              {it.context && (
                <div className="mt-2 text-xs text-ink-500 italic">
                  {it.context}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
