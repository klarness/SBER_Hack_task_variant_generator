import type { Task } from "@/shared/types/domain";
import { LatexText } from "@/shared/ui/LatexText";

interface Props {
  task: Task;
}

export function OriginalPreview({ task }: Props) {
  const items = [...(task.task_items ?? [])].sort((a, b) => a.order - b.order);

  return (
    <>
      <header className="sticky top-0 z-10 bg-glass-toolbar backdrop-blur-header px-6 pt-5 pb-11">
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

      <div className="px-5 pb-5 pt-1">
        {items.length === 0 ? (
          <article className="glass-card p-5">
            <LatexText
              text={task.original_text}
              className="text-sm text-ink-700 font-sans leading-relaxed"
            />
          </article>
        ) : (
          <article className="glass-card px-4 py-2">
            {items.map((it) => (
              <div
                key={it.id}
                className="py-3.5 px-3 -mx-1 border-b border-white/40 last:border-b-0 rounded-xl ring-1 ring-transparent hover:ring-accent/15 hover:bg-white/30 transition"
              >
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
            ))}
          </article>
        )}
      </div>
    </>
  );
}
