import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, FileText, FileType2 } from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { downloadBlob, exportTask } from "@/shared/api/tasks";
import { cn } from "@/shared/lib/cn";
import type { Variant } from "@/shared/types/domain";

interface Props {
  taskId: string;
  title: string;
  variants?: Variant[];
}

export function ExportBar({ taskId, title, variants = [] }: Props) {
  const variantNumbers = useMemo(
    () => {
      const numbers = variants
        .map((variant) => Number(variant.variant_number))
        .filter((number) => Number.isInteger(number) && number > 0);
      return [...new Set(numbers)].sort((a, b) => a - b);
    },
    [variants]
  );
  const variantNumbersKey = variantNumbers.join(",");
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>(variantNumbers);
  const [includeDifficulty, setIncludeDifficulty] = useState(false);

  useEffect(() => {
    setSelectedNumbers(variantNumbers);
  }, [variantNumbersKey]);

  const docxMutation = useMutation({
    mutationFn: async () => {
      const res = await exportTask(taskId, selectedNumbers, "docx", includeDifficulty);
      downloadBlob(res);
    },
  });

  const pdfMutation = useMutation({
    mutationFn: async () => {
      const res = await exportTask(taskId, selectedNumbers, "pdf", includeDifficulty);
      downloadBlob(res);
    },
  });

  const hasVariants = variantNumbers.length > 0;
  const allSelected = selectedNumbers.length === variantNumbers.length;

  const toggleVariant = (number: number) => {
    setSelectedNumbers((current) =>
      current.includes(number)
        ? current.filter((item) => item !== number)
        : [...current, number].sort((a, b) => a - b)
    );
  };

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <h1
        className="mr-auto text-sm font-medium text-ink-900 truncate max-w-xs"
        title={title}
      >
        {title}
      </h1>

      <label className="h-8 inline-flex items-center gap-2 rounded-full border border-border bg-white/60 px-3 text-xs font-semibold text-ink-700 cursor-pointer hover:bg-white transition">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 accent-[var(--accent)]"
          checked={includeDifficulty}
          onChange={(event) => setIncludeDifficulty(event.currentTarget.checked)}
        />
        Сложность
      </label>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => pdfMutation.mutate()}
        loading={pdfMutation.isPending}
        disabled={!hasVariants || selectedNumbers.length === 0}
      >
        <FileText size={14} strokeWidth={1.75} />
        Экспорт PDF
      </Button>

      <div className="flex items-center gap-1 rounded-full border border-border bg-white/60 px-1 py-1">
        {hasVariants ? (
          <>
            <button
              type="button"
              onClick={() => setSelectedNumbers(variantNumbers)}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-semibold transition",
                allSelected
                  ? "bg-accent text-white"
                  : "text-ink-700 hover:bg-surface-subtle"
              )}
            >
              Все
            </button>
            {variantNumbers.map((number) => {
              const checked = selectedNumbers.includes(number);
              return (
                <button
                  key={number}
                  type="button"
                  onClick={() => toggleVariant(number)}
                  className={cn(
                    "h-7 min-w-8 px-2 rounded-full text-xs font-semibold transition inline-flex items-center justify-center gap-1",
                    checked
                      ? "bg-accent-soft text-accent-ink"
                      : "text-ink-600 hover:bg-surface-subtle"
                  )}
                  title={`Вариант ${number}`}
                >
                  {checked && <Check size={12} />}
                  {number}
                </button>
              );
            })}
          </>
        ) : (
          <span className="px-2.5 text-xs font-semibold text-ink-500">
            Нет вариантов
          </span>
        )}
      </div>

      <Button
        size="sm"
        variant="secondary"
        onClick={() => docxMutation.mutate()}
        loading={docxMutation.isPending}
        disabled={!hasVariants || selectedNumbers.length === 0}
      >
        <FileType2 size={14} strokeWidth={1.75} />
        Экспорт DOCX
      </Button>
    </div>
  );
}
