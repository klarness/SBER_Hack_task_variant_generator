import { useEffect, useState, type ComponentType } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CircleHelp,
  Download,
  Eye,
  FileUp,
  Keyboard,
  Library,
  MousePointerClick,
  Pencil,
  Sigma,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { SUBJECTS } from "@/shared/constants/subjects";

export function HomePage() {
  const navigate = useNavigate();
  const [isChoosingSubject, setIsChoosingSubject] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  useEffect(() => {
    if (!isChoosingSubject && !isHelpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isHelpOpen) {
        setIsHelpOpen(false);
        return;
      }
      setIsChoosingSubject(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isChoosingSubject, isHelpOpen]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
          <Logo />
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="ml-auto inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-ink-700 hover:bg-surface-subtle hover:text-ink-900 transition"
          >
            <CircleHelp size={16} strokeWidth={1.75} />
            Как пользоваться
          </button>
          <Link
            to="/library"
            className="ml-2 inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium text-ink-700 hover:bg-surface-subtle hover:text-ink-900 transition"
          >
            <Library size={16} strokeWidth={1.75} />
            Библиотека
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-20">
          <section className="text-center">
            <p className="label-mono text-accent-ink">AI-конструктор контрольных</p>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold font-display text-ink-900">
              Генератор заданий
            </h1>
            <p className="mt-5 mx-auto max-w-2xl text-base md:text-lg text-ink-700 leading-relaxed">
              Загрузите исходную работу, проверьте распознанные задания и
              скачайте готовые варианты для печати или редактирования.
            </p>

            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setIsChoosingSubject(true)}>
                <Upload size={18} strokeWidth={1.75} />
                Загрузить
              </Button>
            </div>
          </section>

          <section className="mt-10 grid md:grid-cols-4 gap-3">
            {[
              "Выберите предмет и загрузите файлы одной работы.",
              "Дождитесь распознавания и создания вариантов.",
              "Проверьте исходник и исправьте спорные места.",
              "Скачайте нужные варианты в DOCX или PDF.",
            ].map((item, index) => (
              <div
                key={item}
                className="bg-white rounded-xl2 border border-border-subtle p-5 shadow-card text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent-ink grid place-items-center text-sm font-bold">
                  {index + 1}
                </div>
                <p className="mt-3 text-sm text-ink-700 leading-relaxed">{item}</p>
              </div>
            ))}
          </section>
        </div>
      </main>

      {isHelpOpen && <HelpModal onClose={() => setIsHelpOpen(false)} />}

      {isChoosingSubject && (
        <SubjectModal
          onClose={() => setIsChoosingSubject(false)}
          onPick={(value) => navigate(`/upload?subject=${value}`)}
        />
      )}
    </div>
  );
}

const HELP_STEPS = [
  {
    title: "Добавьте работу",
    text: "Нажмите «Загрузить», выберите предмет и добавьте файл. Если работа сфотографирована по частям, можно выбрать сразу несколько фото.",
    icon: FileUp,
  },
  {
    title: "Проверьте исходник",
    text: "Посмотрите, правильно ли сервис прочитал задания. Если есть ошибка, нажмите карандаш, исправьте текст и сохраните.",
    icon: Pencil,
  },
  {
    title: "Проверьте варианты",
    text: "Откройте получившиеся варианты. Любое задание можно поправить вручную или попросить сервис переделать только его.",
    icon: Eye,
  },
  {
    title: "Скачайте файл",
    text: "Выберите, что скачать: все варианты или только нужные. DOCX подойдет для правок, PDF — для печати.",
    icon: Download,
  },
  {
    title: "Формулы",
    text: "Поставьте курсор в нужное место и нажмите кнопку Σ. Появится пустая формула, которую можно заполнить как в обычном редакторе.",
    icon: Sigma,
  },
  {
    title: "Клавиатура для формул",
    text: "Для дробей, степеней, корней и индексов используйте кнопки под формулой или экранную клавиатуру. Специальные символы вручную писать не нужно.",
    icon: Keyboard,
  },
];

function HelpIllustration({
  index,
  icon: Icon,
}: {
  index: number;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="relative h-full p-4">
      <div className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-white text-accent shadow-card">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <div className="absolute right-4 top-5 h-3 w-16 rounded-full bg-white/80" />
      <div className="absolute left-4 right-4 bottom-4 rounded-xl bg-white px-3 py-2 shadow-card">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-white text-xs font-bold">
            {index + 1}
          </span>
          <span className="h-2 flex-1 rounded-full bg-accent-soft" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <span className="h-2 rounded-full bg-border-subtle" />
          <span className="h-2 rounded-full bg-border-subtle" />
          <span className="h-2 rounded-full bg-border-subtle" />
        </div>
      </div>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink-900/30 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-border-subtle shadow-glassHover p-5 md:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-mono text-accent-ink">Памятка</p>
            <h2 className="mt-2 text-2xl md:text-3xl font-bold font-display text-ink-900">
              Как пользоваться сайтом
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-700 leading-relaxed">
              Короткая подсказка: как загрузить контрольную, проверить задания,
              поправить ошибки и скачать готовые варианты.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="w-9 h-9 shrink-0 inline-flex items-center justify-center rounded-full text-ink-700 hover:bg-surface-subtle transition"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {HELP_STEPS.map((step, index) => (
            <article
              key={step.title}
              className="rounded-xl border border-border-subtle bg-surface-base/45 p-4"
            >
              <div className="h-32 rounded-xl bg-white border border-border-subtle overflow-hidden">
                <HelpIllustration index={index} icon={step.icon} />
              </div>
              <h3 className="mt-4 text-sm font-bold text-ink-900">{step.title}</h3>
              <p className="mt-1.5 text-sm text-ink-700 leading-relaxed">
                {step.text}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid lg:grid-cols-[1.05fr_0.95fr] gap-4">
          <section className="rounded-xl border border-border-subtle bg-white p-4">
            <div className="flex items-center gap-2 text-ink-900 font-bold">
              <MousePointerClick size={18} className="text-accent" />
              Редактирование исходника
            </div>
            <ol className="mt-3 space-y-2 text-sm text-ink-700 leading-relaxed list-decimal pl-5">
              <li>После загрузки откроется страница с распознанными заданиями.</li>
              <li>Если в задании есть ошибка, нажмите карандаш рядом с ним.</li>
              <li>Исправьте текст, таблицу или формулу и нажмите «Сохранить».</li>
              <li>
                После сохранения сайт сам обновит варианты для этого задания.
              </li>
            </ol>
          </section>

          <section className="rounded-xl border border-border-subtle bg-white p-4">
            <div className="flex items-center gap-2 text-ink-900 font-bold">
              <Sigma size={18} className="text-accent" />
              Формулы и клавиатура
            </div>
            <ol className="mt-3 space-y-2 text-sm text-ink-700 leading-relaxed list-decimal pl-5">
              <li>Поставьте курсор в место, куда нужно вставить формулу.</li>
              <li>Нажмите кнопку Σ в верхней панели редактора.</li>
              <li>Заполните появившуюся пустую формулу.</li>
              <li>
                Для дробей, степеней, корней и индексов используйте готовые
                кнопки под формулой.
              </li>
              <li>Нажмите «Готово», чтобы формула сохранилась в задании.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function SubjectModal({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (value: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-ink-900/30 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-border-subtle shadow-glassHover p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-2xl font-bold font-display text-ink-900">
            Выберите предмет
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

        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SUBJECTS.map((subject) => (
            <button
              key={subject.value}
              type="button"
              onClick={() => onPick(subject.value)}
              className="h-14 px-4 rounded-xl border border-border-subtle bg-white text-left font-semibold text-ink-900 hover:border-accent hover:bg-accent-soft/60 transition inline-flex items-center justify-between gap-3"
            >
              <span>{subject.label}</span>
              <ArrowRight size={17} strokeWidth={1.75} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <Sparkles size={18} strokeWidth={2} className="text-accent" />
      <span className="font-display font-bold text-ink-900">
        Генератор заданий
      </span>
    </div>
  );
}
