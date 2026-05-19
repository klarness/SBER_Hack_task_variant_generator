import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCw, Pencil, Loader2 } from "lucide-react";
import { useState } from "react";
import { RichEditor } from "@/features/editor/RichEditor";
import {
  editVariantItem,
  regenerateVariantItem,
} from "@/shared/api/variants";
import type { Task, VariantItem as VI } from "@/shared/types/domain";
import { cn } from "@/shared/lib/cn";

interface Props {
  taskId: string;
  variantNumber: number;
  questionOrder: number; // Q1, Q2…
  item: VI;
}

export function VariantItem({
  taskId,
  variantNumber,
  questionOrder,
  item,
}: Props) {
  const qc = useQueryClient();
  const [localContent, setLocalContent] = useState(item.content);

  // === PATCH (редактирование) ===
  const editMutation = useMutation({
    mutationFn: (content: string) =>
      editVariantItem(item.variant_id, item.id, content),
    onSuccess: (updated) => {
      patchInCache(qc, taskId, item.id, updated);
    },
  });

  // === Regenerate ===
  const regenMutation = useMutation({
    mutationFn: () => regenerateVariantItem(item.variant_id, item.id),
    onSuccess: (updated) => {
      setLocalContent(updated.content);
      patchInCache(qc, taskId, item.id, updated);
    },
  });

  return (
    <div className="group/item relative py-3 border-b border-border-subtle last:border-b-0">
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-2 text-xs font-semibold text-sber-700 tabular-nums">
          Q{questionOrder}-В{variantNumber}
        </span>

        <div className="flex-1 min-w-0">
          <RichEditor
            value={localContent}
            onChange={setLocalContent}
            onCommit={(html) => editMutation.mutate(html)}
            showToolbar={false}
          />
        </div>

        <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition">
          {item.is_edited && (
            <span title="Отредактировано вручную">
              <Pencil
                size={12}
                className="text-ink-500 mr-1"
                strokeWidth={1.75}
              />
            </span>
          )}
          <button
            type="button"
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
            title="Перегенерировать"
            className={cn(
              "w-7 h-7 inline-flex items-center justify-center rounded-md",
              "text-ink-700 hover:bg-sber-50 hover:text-sber-700 transition",
              "disabled:opacity-50"
            )}
          >
            {regenMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RotateCw size={14} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {editMutation.isError && (
        <p className="mt-1 ml-8 text-xs text-danger">
          Не удалось сохранить. Попробуйте ещё раз.
        </p>
      )}
    </div>
  );
}

/** Точечно обновляет VariantItem внутри Task в кэше React Query */
function patchInCache(
  qc: ReturnType<typeof useQueryClient>,
  taskId: string,
  itemId: string,
  updated: VI
) {
  qc.setQueryData<Task>(["task", taskId], (prev) => {
    if (!prev?.variants) return prev;
    return {
      ...prev,
      variants: prev.variants.map((v) => ({
        ...v,
        items: v.items?.map((it) => (it.id === itemId ? updated : it)),
      })),
    };
  });
}
