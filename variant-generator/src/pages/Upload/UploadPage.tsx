import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Library, Sparkles } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { UploadDropzone } from "@/features/upload-form/UploadDropzone";
import { SettingsPanel } from "@/features/upload-form/SettingsPanel";
import { Input } from "@/shared/ui/Input";
import { Textarea } from "@/shared/ui/Textarea";
import { Button } from "@/shared/ui/Button";
import { createTask } from "@/shared/api/tasks";
import type { TaskSettings } from "@/shared/types/domain";
import {
  defaultSettingsForSubject,
  isSubjectValue,
  subjectLabel,
  type SubjectValue,
} from "@/shared/constants/subjects";

export function UploadPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const subject = useMemo<SubjectValue | null>(() => {
    const value = searchParams.get("subject");
    return isSubjectValue(value) ? value : null;
  }, [searchParams]);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [variantCount, setVariantCount] = useState(4);
  const [settings, setSettings] = useState<TaskSettings>(() =>
    defaultSettingsForSubject(subject ?? "math")
  );

  useEffect(() => {
    if (!subject) return;
    setSettings(defaultSettingsForSubject(subject));
  }, [subject]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: (task) => navigate(`/workspace/${task.id}`),
  });

  const canSubmit =
    !!subject && title.trim().length > 0 && (text.trim().length > 0 || files.length > 0);

  const handleSubmit = () => {
    if (!subject || !canSubmit || createMutation.isPending) return;
    createMutation.mutate({
      title: title.trim(),
      subject: subjectLabel(subject),
      text: text.trim() || undefined,
      files,
      settings,
      variantCount,
    });
  };

  if (!subject) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="bg-white rounded-xl2 border border-border-subtle p-6 shadow-card max-w-md">
          <h1 className="text-xl font-bold font-display text-ink-900">
            Сначала выберите предмет
          </h1>
          <p className="mt-2 text-sm text-ink-700">
            Настройки загрузки зависят от предмета, поэтому начните с главного экрана.
          </p>
          <Button className="mt-5" onClick={() => navigate("/")}>
            Вернуться
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-ink-700 hover:bg-surface-subtle hover:text-ink-900 transition"
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            Главная
          </Link>
          <Link
            to="/library"
            className="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-ink-700 hover:bg-surface-subtle hover:text-ink-900 transition"
          >
            <Library size={16} strokeWidth={1.75} />
            Библиотека
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="mb-8">
            <p className="label-mono text-accent-ink">{subjectLabel(subject)}</p>
            <h1 className="mt-2 text-3xl font-bold font-display text-ink-900">
              Загрузить работу
            </h1>
            <p className="mt-2 text-sm text-ink-700">
              Добавьте один или несколько файлов одной работы либо вставьте текст вручную.
              Система разберет материал как один эталон.
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
                  placeholder={`Контрольная работа: ${subjectLabel(subject)}`}
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
                  placeholder="Например: 1. Решите уравнение $x^2 - 5x + 6 = 0$..."
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
                subject={subject}
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
