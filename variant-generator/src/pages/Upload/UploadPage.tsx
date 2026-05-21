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
    <div className="canvas-bg min-h-screen flex flex-col">
      <span className="canvas-blob canvas-blob-1" />
      <span className="canvas-blob canvas-blob-2" />
      <span className="canvas-blob canvas-blob-3" />

      <header className="canvas-content relative z-[5] pt-12 pb-6 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <h1
            className="title-gradient font-display font-bold tracking-tighter2 leading-[1.02]
                       text-[44px] md:text-[60px] lg:text-[72px]"
          >
            Генератор вариантов заданий
          </h1>
        </div>
      </header>

      <main className="canvas-content flex-1">
        <div className="max-w-7xl mx-auto px-6 pb-16 pt-2">
          <div className="mb-8 max-w-2xl">
            <p className="text-[15px] md:text-base text-ink-700 leading-relaxed">
              Загрузите эталонное задание и система создаст несколько
              однотипных вариантов одинаковой сложности.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
            <div className="glass-card p-8 flex flex-col gap-6">
              <div>
                <label className="label-mono text-ink-700 block mb-2.5">
                  Название
                </label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Контрольная по алгебре, 8 класс"
                />
              </div>

              <div>
                <label className="label-mono text-ink-700 block mb-2.5">
                  Файлы с заданием
                </label>
                <UploadDropzone files={files} onChange={setFiles} />
              </div>

              <div>
                <label className="label-mono text-ink-700 block mb-2.5">
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
                <div className="px-4 py-3 rounded-xl bg-warn-bg border border-warn-border text-sm text-warn-ink">
                  {(createMutation.error as Error).message}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <Button
                  size="lg"
                  variant="soft"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  loading={createMutation.isPending}
                >
                  <Sparkles size={18} strokeWidth={2} />
                  Сгенерировать варианты
                </Button>
              </div>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
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
