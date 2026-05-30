import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/shared/ui/Button";

interface Props {
  open: boolean;
  title: string;
  description: string;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (prompt: string) => void;
}

export function RegeneratePromptDialog({
  open,
  title,
  description,
  loading = false,
  onCancel,
  onSubmit,
}: Props) {
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (open) setPrompt("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/25 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-white shadow-2xl">
        <div className="flex items-start gap-3 px-5 pt-5">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
            <Sparkles size={17} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-ink-900">{title}</h3>
            <p className="mt-1 text-sm text-ink-600 leading-relaxed">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-500 hover:bg-surface-subtle hover:text-ink-900 disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Например: сделай числа проще, замени контекст на бытовой, сохрани формат теста"
            className="h-28 w-full resize-none rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-accent"
            autoFocus
          />
          <p className="mt-2 text-xs text-ink-500">
            Поле можно оставить пустым, тогда сработает обычная перегенерация.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onCancel}
            disabled={loading}
          >
            Отмена
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => onSubmit(prompt)}
            loading={loading}
          >
            Перегенерировать
          </Button>
        </div>
      </div>
    </div>
  );
}
