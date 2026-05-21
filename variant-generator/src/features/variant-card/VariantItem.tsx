import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, Pencil, RotateCw } from "lucide-react";
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
  questionOrder: number;
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
  const isFailed = item.status === "failed";

  const editMutation = useMutation({
    mutationFn: (content: string) =>
      editVariantItem(item.variant_id, item.id, content),
    onSuccess: (updated) => {
      patchInCache(qc, taskId, item.id, updated);
    },
  });

  const regenMutation = useMutation({
    mutationFn: () => regenerateVariantItem(item.variant_id, item.id),
    onSuccess: (updated) => {
      setLocalContent(updated.content);
      patchInCache(qc, taskId, item.id, updated);
    },
  });

  return (
    <div className="group/item relative py-3.5 border-b border-white/40 last:border-b-0">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="font-mono text-[12.5px] font-bold text-accent tracking-[0.04em]">
          Задание {questionOrder}
        </span>

        <div
          className={cn(
            "shrink-0 flex items-center gap-0.5 transition",
            isFailed
              ? "opacity-100"
              : "opacity-0 group-hover/item:opacity-100 focus-within:opacity-100"
          )}
        >
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
              "w-8 h-8 inline-flex items-center justify-center rounded-lg",
              "border border-border bg-white/60 backdrop-blur-sm",
              "text-accent hover:bg-accent hover:text-white hover:border-accent transition",
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

      <div className="min-w-0">
        {isFailed ? (
          <div className="rounded-xl border border-warn-border bg-warn-bg px-3.5 py-2.5 text-sm text-warn-ink">
            <div className="flex items-start gap-2">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Не удалось сгенерировать этот пункт</p>
                <p className="mt-1 text-xs opacity-80">
                  Попробуйте выполнить генерацию задания еще раз
                </p>
              </div>
            </div>
          </div>
        ) : (
          <RichEditor
            value={localContent}
            onChange={setLocalContent}
            onCommit={(html) => editMutation.mutate(html)}
            showToolbar={false}
          />
        )}
      </div>

      {editMutation.isError && (
        <p className="mt-1 text-xs text-danger">
          Не удалось сохранить. Попробуйте еще раз.
        </p>
      )}
      {regenMutation.isError && (
        <p className="mt-1 text-xs text-danger">
          Не удалось перегенерировать. Можете написать задание вручную.
        </p>
      )}
    </div>
  );
}

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
