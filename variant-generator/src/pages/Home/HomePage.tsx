import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Library, Upload } from "lucide-react";
import { Button } from "@/shared/ui/Button";
import { SUBJECTS } from "@/shared/constants/subjects";

export function HomePage() {
  const navigate = useNavigate();
  const [isChoosingSubject, setIsChoosingSubject] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-border-subtle">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center">
          <Logo />
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
        <div className="max-w-5xl mx-auto px-6 py-12 md:py-20">
          <section className="text-center">
            <p className="label-mono text-accent-ink">AI-конструктор контрольных</p>
            <h1 className="mt-4 text-4xl md:text-6xl font-bold font-display text-ink-900">
              Генератор заданий
            </h1>
            <p className="mt-5 mx-auto max-w-2xl text-base md:text-lg text-ink-700 leading-relaxed">
              Загрузите исходную работу, выберите предмет и получите несколько
              равноценных вариантов с сохранением структуры, сложности и формул.
            </p>

            <div className="mt-8 flex justify-center">
              <Button size="lg" onClick={() => setIsChoosingSubject(true)}>
                <Upload size={18} strokeWidth={1.75} />
                Загрузить
              </Button>
            </div>
          </section>

          <section className="mt-10 grid md:grid-cols-3 gap-3">
            {[
              "Выберите предмет и загрузите один или несколько файлов.",
              "Проверьте настройки генерации и запустите создание вариантов.",
              "Откройте результат, исправьте отдельные задания или экспортируйте DOCX.",
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

          {isChoosingSubject && (
            <section className="mt-8 bg-white rounded-xl2 border border-border-subtle p-5 md:p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold font-display text-ink-900">
                    Выберите предмет
                  </h2>
                  <p className="mt-1 text-sm text-ink-700">
                    Для каждого предмета будут свои настройки и отдельная
                    заготовка промпта.
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsChoosingSubject(false)}
                >
                  Закрыть
                </Button>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {SUBJECTS.map((subject) => (
                  <button
                    key={subject.value}
                    type="button"
                    onClick={() => navigate(`/upload?subject=${subject.value}`)}
                    className="h-14 px-4 rounded-xl border border-border-subtle bg-white text-left font-semibold text-ink-900 hover:border-accent/50 hover:bg-accent-soft/50 transition inline-flex items-center justify-between gap-3"
                  >
                    <span>{subject.label}</span>
                    <ArrowRight size={17} strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </section>
          )}
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
      <span className="font-display font-bold text-ink-900">Variant&nbsp;Studio</span>
    </div>
  );
}
