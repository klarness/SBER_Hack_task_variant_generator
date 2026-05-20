import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { UploadDropzone } from "@/features/upload-form/UploadDropzone";
import { SettingsPanel } from "@/features/upload-form/SettingsPanel";
import { Input } from "@/shared/ui/Input";
import { Textarea } from "@/shared/ui/Textarea";
import { Button } from "@/shared/ui/Button";
import { createTask } from "@/shared/api/tasks";
import type { TaskSettings } from "@/shared/types/domain";

export function UploadPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [variantCount, setVariantCount] = useState(4);
  const [settings, setSettings] = useState<TaskSettings>({
    variation_types: ["replace_numbers"],
    number_types: ["integers"],
    number_range: "keep comparable to original",
    locked_parts: [],
    preserve_difficulty: true,
    check_answer_uniqueness: true,
  });

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: (task) => navigate(`/workspace/${task.id}`),
  });

  const canSubmit =
    title.trim().length > 0 && (text.trim().length > 0 || files.length > 0);

  const handleSubmit = () => {
    if (!canSubmit || createMutation.isPending) return;
    createMutation.mutate({
      title: title.trim(),
      text: text.trim() || undefined,
      files,
      settings,
      variantCount,
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-display text-ink-900">
              Сгенерировать варианты
            </h1>
            <p className="mt-2 text-sm text-ink-700">
              Загрузите эталонное задание и система создаст несколько
              однотипных вариантов одинаковой сложности.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
            <div className="flex flex-col gap-5 bg-white rounded-xl2 border border-border-subtle p-6 shadow-card">
              <div>
                <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  Название
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Контрольная по алгебре, 8 класс"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  Файлы с заданием
                </label>
                <UploadDropzone files={files} onChange={setFiles} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  Или введите текст вручную
                </label>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Например: 1. Решите уравнение x² − 5x + 6 = 0…"
                  rows={5}
                />
              </div>

              {createMutation.isError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-danger/20 text-sm text-danger">
                  {(createMutation.error as Error).message}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  loading={createMutation.isPending}
                >
                  <Sparkles size={18} strokeWidth={1.75} />
                  Сгенерировать варианты
                </Button>
              </div>
            </div>

            <aside className="bg-white rounded-xl2 border border-border-subtle p-6 shadow-card lg:sticky lg:top-20">
              <SettingsPanel
                variantCount={variantCount}
                onVariantCountChange={setVariantCount}
                settings={settings}
                onSettingsChange={setSettings}
              />
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 h-8 rounded-lg bg-sber-gradient grid place-items-center text-white font-bold text-sm">
        В
      </span>
      <span className="font-display font-bold text-ink-900">
        Variant&nbsp;Studio
      </span>
    </div>
  );
}
