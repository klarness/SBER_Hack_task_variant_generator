import { VariantItem } from "./VariantItem";
import type { TaskItem, Variant } from "@/shared/types/domain";

interface Props {
  taskId: string;
  variant: Variant;
  taskItems: TaskItem[]; 
  a4?: boolean;
}

export function VariantCard({ taskId, variant, taskItems, a4 = true }: Props) {
  const orderMap = new Map(taskItems.map((ti) => [ti.id, ti.order]));

  const sortedItems = [...(variant.items ?? [])].sort((a, b) => {
    const oa = orderMap.get(a.task_item_id) ?? 0;
    const ob = orderMap.get(b.task_item_id) ?? 0;
    return oa - ob;
  });

  return (
    <article
      className={
        a4
          ? 
            "bg-white border border-border-subtle rounded-xl2 shadow-card overflow-hidden flex flex-col"
          : "bg-white border border-border-subtle rounded-xl2 shadow-card flex flex-col"
      }
    >
      <header className="flex items-center justify-between px-4 h-11 border-b border-border-subtle bg-surface-base/40">
        <h3 className="text-sm font-semibold text-ink-900">
          Вариант {variant.variant_number}
        </h3>
        <span className="text-xs text-ink-500 tabular-nums">
          {variant.items?.length ?? 0} вопросов
        </span>
      </header>

      <div className="px-3 py-1 flex-1 overflow-y-auto">
        {sortedItems.map((item) => (
          <VariantItem
            key={item.id}
            taskId={taskId}
            variantNumber={variant.variant_number}
            questionOrder={orderMap.get(item.task_item_id) ?? 0}
            item={item}
          />
        ))}
        {sortedItems.length === 0 && (
          <div className="py-8 text-center text-sm text-ink-500">
            Этот вариант пустой
          </div>
        )}
      </div>
    </article>
  );
}
