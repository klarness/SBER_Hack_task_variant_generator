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

  if (variants.length === 0) {
    return (
      <div className="h-full grid place-items-center text-sm text-ink-500">
        Вариантов пока нет
      </div>
    );
  }

  // Адаптивная сетка:
  // 1 вариант — 1 колонка, 2 — 2, 3+ — 3 с горизонтальным скроллом
  return (
    <div className="h-full overflow-auto p-5">
      <div
        className="grid gap-4 min-h-full"
        style={{
          gridTemplateColumns:
            variants.length === 1
              ? "minmax(0, 1fr)"
              : variants.length === 2
                ? "repeat(2, minmax(360px, 1fr))"
                : `repeat(${variants.length}, minmax(380px, 1fr))`,
        }}
      >
        {variants.map((v) => (
          <VariantCard
            key={v.id}
            taskId={task.id}
            variant={v}
            taskItems={taskItems}
          />
        ))}
      </div>
    </div>
  );
}
