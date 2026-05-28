import { VariantItem } from "./VariantItem";
import type { TaskItem, Variant } from "@/shared/types/domain";

interface Props {
  taskId: string;
  variant: Variant;
  taskItems: TaskItem[]; 
  a4?: boolean;
  highlightDiff?: boolean;
}

export function VariantCard({ taskId, variant, taskItems, a4 = true, highlightDiff = false }: Props) {
  const orderMap = new Map(taskItems.map((ti) => [ti.id, ti.order]));
  const sourceMap = new Map(taskItems.map((ti) => [ti.id, ti.content]));

  const sortedItems = [...(variant.items ?? [])].sort((a, b) => {
    const oa = orderMap.get(a.task_item_id) ?? 0;
    const ob = orderMap.get(b.task_item_id) ?? 0;
    return oa - ob;
  });

  void a4;
  return (
    <article className="glass-card">
      <header className="flex items-center justify-between px-5 pt-4 pb-2">
        <h3 className="text-[17px] font-bold text-ink-900 tracking-tight">
          Вариант {variant.variant_number}
        </h3>
        <span className="text-xs text-ink-500 tabular-nums">
          {variant.items?.length ?? 0} вопросов
        </span>
      </header>

      <div className="px-4 pb-3">
        {sortedItems.map((item) => (
          <VariantItem
            key={item.id}
            taskId={taskId}
            variantNumber={variant.variant_number}
            questionOrder={orderMap.get(item.task_item_id) ?? 0}
            item={item}
            sourceContent={sourceMap.get(item.task_item_id)}
            highlightDiff={highlightDiff}
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
