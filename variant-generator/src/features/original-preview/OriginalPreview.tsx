import { useEffect, useState } from "react";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, X } from "lucide-react";
import { RichEditor } from "@/features/editor/RichEditor";
import { editTaskItem } from "@/shared/api/tasks";
import { regenerateVariantItem } from "@/shared/api/variants";
import { cn } from "@/shared/lib/cn";
import type { Task, TaskItem, VariantItem } from "@/shared/types/domain";
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
              <OriginalTaskItem key={it.id} task={task} item={it} />
            ))}
          </article>
        )}
      </div>
    </>
  );
}

function OriginalTaskItem({ task, item }: { task: Task; item: TaskItem }) {
  const qc = useQueryClient();
  const [localContent, setLocalContent] = useState(item.content);
  const [localContext, setLocalContext] = useState(item.context ?? "");
  const [draftContent, setDraftContent] = useState(item.content);
  const [draftContext, setDraftContext] = useState(item.context ?? "");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLocalContent(item.content);
    setLocalContext(item.context ?? "");
    setDraftContent(item.content);
    setDraftContext(item.context ?? "");
  }, [item.content, item.context]);

  const regenMutation = useMutation({
    mutationFn: async () => {
      const targets = relatedVariantItems(task, item.id);
      const updated: VariantItem[] = [];
      for (const target of targets) {
        updated.push(
          await regenerateVariantItem(target.variantId, target.itemId)
        );
      }
      return updated;
    },
    onSuccess: (updatedItems) => {
      patchVariantItemsInCache(qc, task.id, updatedItems);
    },
  });

  const editMutation = useMutation({
    mutationFn: (input: { content: string; context?: string }) =>
      editTaskItem(task.id, item.id, input),
    onSuccess: (updated) => {
      setLocalContent(updated.content);
      setLocalContext(updated.context ?? "");
      setDraftContent(updated.content);
      setDraftContext(updated.context ?? "");
      patchTaskItemInCache(qc, task.id, updated);
      if (relatedVariantItems(task, item.id).length > 0) {
        regenMutation.mutate();
      }
    },
  });

  const save = async () => {
    const updated = await editMutation.mutateAsync({
      content: draftContent,
      context: draftContext,
    });
    setIsEditing(false);
    return updated;
  };

  return (
    <div className="py-3.5 px-3 -mx-1 border-b border-white/40 last:border-b-0 rounded-xl ring-1 ring-transparent hover:ring-accent/15 hover:bg-white/30 transition">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="font-mono text-[13.5px] font-bold text-accent tracking-[0.04em]">
          Задание {item.order}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setDraftContent(localContent);
              setDraftContext(localContext);
              setIsEditing((value) => !value);
            }}
            title={isEditing ? "Закрыть редактор" : "Редактировать исходное задание"}
            className={cn(
              "w-8 h-8 inline-flex items-center justify-center rounded-lg",
              "border border-border bg-white/60 backdrop-blur-sm",
              "text-ink-600 hover:bg-surface-subtle hover:text-ink-900 transition"
            )}
          >
            {isEditing ? <X size={14} /> : <Pencil size={14} />}
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <RichEditor
            value={draftContent}
            onChange={setDraftContent}
            onCommit={() => void save()}
            onCancel={() => {
              setDraftContent(localContent);
              setDraftContext(localContext);
              setIsEditing(false);
            }}
            compact
          />
          <textarea
            value={draftContext}
            onChange={(event) => setDraftContext(event.target.value)}
            placeholder="Общий контекст для этого задания, если нужен"
            className="w-full min-h-20 rounded-xl border border-border bg-white/80 px-3 py-2 text-sm text-ink-900 outline-none focus:border-accent"
          />
        </div>
      ) : (
        <>
          <LatexText
            text={localContent}
            className="text-[14.5px] text-ink-900 leading-relaxed"
          />
          {localContext && (
            <LatexText
              text={localContext}
              className="mt-2 text-xs text-ink-500 italic"
            />
          )}
        </>
      )}

      {regenMutation.isPending && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink">
          <Loader2 size={13} className="animate-spin" />
          Обновляем варианты после правки исходника...
        </p>
      )}

      {editMutation.isError && (
        <p className="mt-2 text-xs text-danger">
          Не удалось сохранить исходное задание. Проверьте текст и попробуйте еще раз.
        </p>
      )}
      {regenMutation.isError && (
        <p className="mt-2 text-xs text-danger">
          Исходник сохранен, но связанные варианты не удалось обновить автоматически.
        </p>
      )}
    </div>
  );
}

function relatedVariantItems(task: Task, taskItemId: string) {
  return (task.variants ?? []).flatMap((variant) =>
    (variant.items ?? [])
      .filter((item) => item.task_item_id === taskItemId)
      .map((item) => ({ variantId: variant.id, itemId: item.id }))
  );
}

function patchTaskItemInCache(qc: QueryClient, taskId: string, updated: TaskItem) {
  qc.setQueryData<Task>(["task", taskId], (prev) => {
    if (!prev?.task_items) return prev;
    return {
      ...prev,
      task_items: prev.task_items.map((item) =>
        item.id === updated.id ? updated : item
      ),
    };
  });
}

function patchVariantItemsInCache(
  qc: QueryClient,
  taskId: string,
  updatedItems: VariantItem[]
) {
  if (updatedItems.length === 0) return;
  const byId = new Map(updatedItems.map((item) => [item.id, item]));
  qc.setQueryData<Task>(["task", taskId], (prev) => {
    if (!prev?.variants) return prev;
    return {
      ...prev,
      variants: prev.variants.map((variant) => ({
        ...variant,
        items: variant.items?.map((item) => byId.get(item.id) ?? item),
      })),
    };
  });
}
