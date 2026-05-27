import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { VariantCard } from "@/features/variant-card/VariantCard";
import type { Task } from "@/shared/types/domain";

interface Props {
  task: Task;
}

export function VariantGrid({ task }: Props) {
  const variants = [...(task.variants ?? [])].sort(
    (a, b) => a.variant_number - b.variant_number
  );
  const taskItems = task.task_items ?? [];

  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index >= variants.length) setIndex(0);
  }, [variants.length, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (variants.length < 2) return;
      const active = document.activeElement;
      const isEditing =
        active?.closest('[contenteditable="true"]') ||
        active?.closest("textarea") ||
        active?.closest("input") ||
        active?.closest("math-field");
      if (isEditing) return;
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + variants.length) % variants.length);
      else if (e.key === "ArrowRight") setIndex((i) => (i + 1) % variants.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variants.length]);

  if (variants.length === 0) {
    return (
      <div className="grid place-items-center text-sm text-ink-500 py-20">
        Вариантов пока нет
      </div>
    );
  }

  const current = variants[Math.min(index, variants.length - 1)];
  const next = () => setIndex((i) => (i + 1) % variants.length);
  const prev = () => setIndex((i) => (i - 1 + variants.length) % variants.length);
  const single = variants.length < 2;

  return (
    <>
      <div className="sticky top-0 z-10 bg-glass-toolbar backdrop-blur-header">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={single}
            aria-label="Предыдущий вариант"
            className="w-10 h-10 inline-flex items-center justify-center rounded-full bg-white border border-border text-ink-900 hover:bg-accent hover:text-white hover:border-accent transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-ink-900"
          >
            <ChevronLeft size={20} strokeWidth={2} />
          </button>

          <div className="flex flex-col items-center min-w-0">
            <span className="label-mono text-ink-500">Вариант</span>
            <span className="text-base font-bold text-ink-900 tabular-nums">
              {current.variant_number} <span className="text-ink-500 font-medium">/ {variants.length}</span>
            </span>
          </div>

          <button
            type="button"
            onClick={next}
            disabled={single}
            aria-label="Следующий вариант"
            className="w-10 h-10 inline-flex items-center justify-center rounded-full bg-white border border-border text-ink-900 hover:bg-accent hover:text-white hover:border-accent transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-ink-900"
          >
            <ChevronRight size={20} strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 pb-3 min-h-[40px] flex items-center justify-center gap-1.5 flex-wrap">
          {variants.length > 1 &&
            variants.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Перейти к варианту ${v.variant_number}`}
                className={
                  i === index
                    ? "h-7 min-w-7 px-2 rounded-full bg-accent text-white text-xs font-bold tabular-nums transition"
                    : "h-7 min-w-7 px-2 rounded-full bg-white border border-border text-ink-700 text-xs font-medium tabular-nums hover:bg-accent-soft/60 transition"
                }
              >
                {v.variant_number}
              </button>
            ))}
        </div>
      </div>

      <div className="px-5 pb-5 pt-1">
        <VariantCard
          key={current.id}
          taskId={task.id}
          variant={current}
          taskItems={taskItems}
        />
      </div>
    </>
  );
}
