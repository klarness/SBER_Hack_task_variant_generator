import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Library, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { UploadDropzone } from "@/features/upload-form/UploadDropzone";
import { SettingsPanel } from "@/features/upload-form/SettingsPanel";
import { Input } from "@/shared/ui/Input";
import { Button } from "@/shared/ui/Button";
import { Slider } from "@/shared/ui/Slider";
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
  const [files, setFiles] = useState<File[]>([]);
  const [variantCount, setVariantCount] = useState(4);
  const [settings, setSettings] = useState<TaskSettings>(() =>
    defaultSettingsForSubject(subject ?? "math")
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (!subject) return;
    setSettings(defaultSettingsForSubject(subject));
  }, [subject]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isSettingsOpen]);

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: (task) => navigate(`/workspace/${task.id}`),
  });

  const canSubmit = !!subject && title.trim().length > 0 && files.length > 0;

  const handleSubmit = () => {
    if (!subject || !canSubmit || createMutation.isPending) return;
    createMutation.mutate({
      title: title.trim(),
      subject: subjectLabel(subject),
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
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="shrink-0 bg-white/90 backdrop-blur border-b border-border-subtle">
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

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-8 md:py-10 flex flex-col gap-6">
          <div>
            <p className="label-mono text-accent-ink">{subjectLabel(subject)}</p>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold font-display text-ink-900">
              Загрузить работу
            </h1>
            <p className="mt-2 text-sm text-ink-700">
              Добавьте один или несколько файлов одной работы. После обработки
              вы попадете на экран проверки исходника, вариантов и экспорта.
            </p>
          </div>

          <div className="bg-white rounded-xl2 border border-border-subtle p-5 md:p-6 shadow-card flex flex-col gap-5">
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

            <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end pt-1">
              <div>
                <label className="block text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">
                  Количество вариантов
                </label>
                <Slider
                  value={variantCount}
                  onChange={setVariantCount}
                  min={1}
                  max={10}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => setIsSettingsOpen(true)}
                className="h-11"
              >
                <SlidersHorizontal size={16} strokeWidth={1.75} />
                Настройки
              </Button>
            </div>

            {createMutation.isError && (
              <div className="px-3 py-2 rounded-lg bg-red-50 border border-danger/20 text-sm text-danger">
                {(createMutation.error as Error).message}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="lg"
                onClick={handleSubmit}
                disabled={!canSubmit}
                loading={createMutation.isPending}
              >
                <Sparkles size={18} strokeWidth={1.75} />
                Начать обработку
              </Button>
            </div>
          </div>
        </div>
      </main>

      {isSettingsOpen && (
        <SettingsModal onClose={() => setIsSettingsOpen(false)}>
          <SettingsPanel
            subject={subject}
            variantCount={variantCount}
            onVariantCountChange={setVariantCount}
            settings={settings}
            onSettingsChange={setSettings}
          />
        </SettingsModal>
      )}
    </div>
  );
}

function SettingsModal({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink-900/30 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-border-subtle shadow-glassHover p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold font-display text-ink-900">
            Настройки генерации
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-ink-700 hover:bg-surface-subtle transition"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>
        {children}
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Готово</Button>
        </div>
      </div>
    </div>
  );
}
