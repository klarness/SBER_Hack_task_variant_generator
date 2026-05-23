import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/shared/ui/Slider";
import { Checkbox } from "@/shared/ui/Checkbox";
import { TagInput } from "@/shared/ui/TagInput";
import type {
  NumberType,
  TaskSettings,
  VariationType,
} from "@/shared/types/domain";
import { subjectLabel, type SubjectValue } from "@/shared/constants/subjects";
import { cn } from "@/shared/lib/cn";

interface Props {
  subject: SubjectValue;
  variantCount: number;
  onVariantCountChange: (n: number) => void;
  settings: TaskSettings;
  onSettingsChange: (next: TaskSettings) => void;
}

const SUBJECT_STRATEGIES: Record<
  SubjectValue,
  { key: VariationType; label: string; hint: string }[]
> = {
  russian: [
    {
      key: "synonymize_non_key_wording",
      label: "Переформулировать условие",
      hint: "Меняются неключевые слова, грамматическая тема сохраняется",
    },
    {
      key: "replace_context",
      label: "Заменить языковой материал",
      hint: "Можно заменить предложения или фрагменты на равнозначные",
    },
    {
      key: "reorder_enumeration",
      label: "Перемешать пункты",
      hint: "Подходит для списков и заданий с однотипными подпунктами",
    },
  ],
  math: [
    {
      key: "replace_numbers",
      label: "Заменить числа",
      hint: "Сохраняется тип действия и сопоставимая сложность",
    },
    {
      key: "change_names",
      label: "Заменить обозначения",
      hint: "Можно менять переменные, имена объектов и подписи",
    },
    {
      key: "change_units",
      label: "Заменить единицы",
      hint: "Только если это не меняет смысл и уровень задания",
    },
  ],
  history: [
    {
      key: "replace_context",
      label: "Заменить исторический контекст",
      hint: "Событие или период меняются на сопоставимые",
    },
    {
      key: "change_names",
      label: "Заменить имена и даты",
      hint: "Меняются персоналии, названия, годы и термины",
    },
    {
      key: "reorder_enumeration",
      label: "Перемешать ответы",
      hint: "Для тестов и списков с вариантами ответа",
    },
  ],
  social: [
    {
      key: "replace_context",
      label: "Заменить ситуацию",
      hint: "Кейс меняется, проверяемое понятие сохраняется",
    },
    {
      key: "synonymize_non_key_wording",
      label: "Переформулировать вопрос",
      hint: "Термины и дидактическая цель не меняются",
    },
    {
      key: "change_names",
      label: "Заменить участников кейса",
      hint: "Имена, организации и примеры становятся другими",
    },
  ],
  literature: [
    {
      key: "replace_context",
      label: "Заменить фрагмент или пример",
      hint: "Сохраняется тип анализа и литературоведческий навык",
    },
    {
      key: "change_names",
      label: "Заменить авторов/героев",
      hint: "Можно менять имена в рамках сопоставимого материала",
    },
    {
      key: "synonymize_non_key_wording",
      label: "Переформулировать вопрос",
      hint: "Смысл вопроса остается прежним",
    },
  ],
  biology: [
    {
      key: "change_names",
      label: "Заменить объекты",
      hint: "Организмы, органы и процессы меняются на сопоставимые",
    },
    {
      key: "replace_context",
      label: "Заменить биологический контекст",
      hint: "Сохраняется проверяемая закономерность",
    },
    {
      key: "reorder_enumeration",
      label: "Перемешать пункты",
      hint: "Для тестов, списков признаков и классификаций",
    },
  ],
  chemistry: [
    {
      key: "replace_numbers",
      label: "Заменить числовые данные",
      hint: "Массы, объемы и коэффициенты остаются сопоставимыми",
    },
    {
      key: "change_units",
      label: "Заменить единицы",
      hint: "Не должно ломать расчет и условие",
    },
    {
      key: "change_names",
      label: "Заменить вещества",
      hint: "Только на методически сопоставимые вещества",
    },
  ],
  informatics: [
    {
      key: "replace_numbers",
      label: "Заменить входные данные",
      hint: "Числа, массивы и параметры меняются без роста сложности",
    },
    {
      key: "change_names",
      label: "Заменить имена",
      hint: "Переменные, файлы и объекты получают другие имена",
    },
    {
      key: "reorder_steps",
      label: "Переставить шаги",
      hint: "Только для независимых действий или инструкций",
    },
  ],
  physics: [
    {
      key: "replace_numbers",
      label: "Заменить величины",
      hint: "Числа меняются с сохранением физического смысла",
    },
    {
      key: "change_units",
      label: "Заменить единицы",
      hint: "Сохраняется корректная размерность",
    },
    {
      key: "replace_context",
      label: "Заменить сюжет задачи",
      hint: "Физическая модель и формулы остаются теми же",
    },
  ],
};

const NUMBER_TYPES: { key: NumberType; label: string }[] = [
  { key: "integers", label: "Целые" },
  { key: "decimals", label: "Десятичные" },
  { key: "fractions", label: "Дроби" },
];

const SUBJECTS_WITH_NUMBERS = new Set<SubjectValue>([
  "math",
  "history",
  "biology",
  "chemistry",
  "informatics",
  "physics",
]);

export function SettingsPanel({
  subject,
  variantCount,
  onVariantCountChange,
  settings,
  onSettingsChange,
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const strategies = SUBJECT_STRATEGIES[subject];
  const showNumberTypes = SUBJECTS_WITH_NUMBERS.has(subject);

  const toggleVariation = (key: VariationType) => {
    const next = settings.variation_types.includes(key)
      ? settings.variation_types.filter((s) => s !== key)
      : [...settings.variation_types, key];
    onSettingsChange({ ...settings, variation_types: next });
  };

  const toggleNumberType = (key: NumberType) => {
    const next = settings.number_types.includes(key)
      ? settings.number_types.filter((s) => s !== key)
      : [...settings.number_types, key];
    onSettingsChange({ ...settings, number_types: next });
  };

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="label-mono text-ink-700">Параметры генерации</h3>
        <p className="mt-1 text-sm text-ink-700">{subjectLabel(subject)}</p>
        <div className="mt-3.5">
          <Slider
            label="Количество вариантов"
            value={variantCount}
            onChange={onVariantCountChange}
            min={2}
            max={10}
          />
        </div>
      </section>

      <section className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="w-full h-11 px-3 rounded-xl border border-border bg-white/70 hover:bg-accent-soft/45 transition inline-flex items-center justify-between gap-3 text-left"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <SlidersHorizontal size={17} strokeWidth={1.75} />
            <span className="font-semibold text-sm text-ink-900">
              Настройки изменений
            </span>
          </span>
          <ChevronDown
            size={17}
            strokeWidth={1.75}
            className={cn("transition", isExpanded && "rotate-180")}
          />
        </button>

        {isExpanded && (
          <div className="mt-4 flex flex-col gap-4">
            <div>
              <h4 className="label-mono text-ink-700 mb-2">Флажки предмета</h4>
              <div className="flex flex-col gap-0.5">
                {strategies.map((s) => (
                  <Checkbox
                    key={s.key}
                    label={s.label}
                    hint={s.hint}
                    checked={settings.variation_types.includes(s.key)}
                    onChange={() => toggleVariation(s.key)}
                  />
                ))}
              </div>
            </div>

            {showNumberTypes && (
              <div>
                <h4 className="label-mono text-ink-700 mb-3">Типы чисел</h4>
                <div className="flex gap-2 flex-wrap">
                  {NUMBER_TYPES.map((type) => {
                    const active = settings.number_types.includes(type.key);
                    return (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => toggleNumberType(type.key)}
                        className={
                          active
                            ? "h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 bg-accent text-white border-[1.5px] border-accent transition"
                            : "h-9 px-4 rounded-full text-sm font-medium inline-flex items-center gap-1.5 bg-white/60 text-ink-900 border-[1.5px] border-border hover:bg-white transition"
                        }
                      >
                        {type.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h4 className="label-mono text-ink-700 mb-2">Не изменять</h4>
              <TagInput
                value={settings.locked_parts}
                onChange={(next) =>
                  onSettingsChange({ ...settings, locked_parts: next })
                }
                placeholder="Например: 'формула Виета'"
              />
            </div>

            <div>
              <h4 className="label-mono text-ink-700 mb-2">Проверки</h4>
              <div className="flex flex-col gap-0.5">
                <Checkbox
                  label="Сохранять сложность"
                  hint="Не упрощать и не усложнять варианты"
                  checked={settings.preserve_difficulty}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      preserve_difficulty: e.currentTarget.checked,
                    })
                  }
                />
                <Checkbox
                  label="Проверять уникальность"
                  hint="Варианты одного задания не должны повторяться"
                  checked={settings.check_answer_uniqueness}
                  onChange={(e) =>
                    onSettingsChange({
                      ...settings,
                      check_answer_uniqueness: e.currentTarget.checked,
                    })
                  }
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
