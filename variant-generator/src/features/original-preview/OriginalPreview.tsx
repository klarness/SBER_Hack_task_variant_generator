import type { Task } from "@/shared/types/domain";
import { LatexText } from "@/shared/ui/LatexText";

interface Props {
  task: Task;
}

export function OriginalPreview({ task }: Props) {
  const items = [...(task.task_items ?? [])].sort((a, b) => a.order - b.order);

  return (
    <div className="h-full flex flex-col">
      <header className="px-6 py-5">
        <h2 className="text-[17px] font-bold text-ink-900 tracking-tight">
          Исходное задание
        </h2>
        <p className="mt-1 text-[13px] text-ink-500 line-clamp-1">
          {task.subject ? `${task.subject}` : "—"}
          {task.topic ? ` · ${task.topic}` : ""}
          {task.difficulty ? (
            <>
              {" · "}
              <span className="text-accent font-medium">{task.difficulty}</span>
            </>
          ) : null}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3.5">
        {items.length === 0 ? (
          <div className="glass-card p-5">
            <LatexText
              text={task.original_text}
              className="text-sm text-ink-700 font-sans leading-relaxed"
            />
          </div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="glass-card px-5 py-4">
              <div className="font-mono text-[13.5px] font-bold text-accent tracking-[0.04em] mb-2">
                Задание {it.order}
              </div>
              <LatexText
                text={it.content}
                className="text-[14.5px] text-ink-900 leading-relaxed"
              />
              {it.context && (
                <LatexText
                  text={it.context}
                  className="mt-2 text-xs text-ink-500 italic"
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
