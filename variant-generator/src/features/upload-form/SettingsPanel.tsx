import { Slider } from "@/shared/ui/Slider";
import { Checkbox } from "@/shared/ui/Checkbox";
import { TagInput } from "@/shared/ui/TagInput";
import type {
  NumberType,
  TaskSettings,
  VariationType,
} from "@/shared/types/domain";

interface Props {
  variantCount: number;
  onVariantCountChange: (n: number) => void;
  settings: TaskSettings;
  onSettingsChange: (next: TaskSettings) => void;
}

const STRATEGIES: {
  key: VariationType;
  label: string;
  hint: string;
}[] = [
  {
    key: "replace_numbers",
    label: "Замена числовых данных",
    hint: "Меняются числа в условии с учетом диапазона и типа чисел",
  },
  {
    key: "reorder_enumeration",
    label: "Изменение порядка перечисления",
    hint: "Меняется порядок условий, объектов или действий",
  },
  {
    key: "synonymize_non_key_wording",
    label: "Синонимическая замена",
    hint: "Переформулировка неключевых частей текста",
  },
  {
    key: "replace_context",
    label: "Изменение контекста",
    hint: "Меняются ситуации или примеры при сохранении логики",
  },
  {
    key: "change_names",
    label: "Изменение имен и названий",
    hint: "Меняются имена, названия, обозначения",
  },
  {
    key: "change_units",
    label: "Изменение единиц измерения",
    hint: "Единицы меняются без изменения сложности",
  },
  {
    key: "reorder_steps",
    label: "Перестановка шагов",
    hint: "Меняется порядок шагов в многошаговой инструкции",
  },
];

const NUMBER_TYPES: {
  key: NumberType;
  label: string;
}[] = [
  { key: "integers", label: "Целые" },
  { key: "decimals", label: "Десятичные" },
  { key: "fractions", label: "Дроби" },
];

export function SettingsPanel({
  variantCount,
  onVariantCountChange,
  settings,
  onSettingsChange,
}: Props) {
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
    <>
      <section className="glass-card p-[22px]">
        <h3 className="label-mono text-ink-700">Параметры генерации</h3>
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

      <section className="glass-card p-[22px]">
        <h3 className="label-mono text-ink-700 mb-3">Изменения</h3>
        <div className="flex flex-col gap-0.5">
          {STRATEGIES.map((s) => (
            <Checkbox
              key={s.key}
              label={s.label}
              hint={s.hint}
              checked={settings.variation_types.includes(s.key)}
              onChange={() => toggleVariation(s.key)}
            />
          ))}
        </div>
      </section>

      <section className="glass-card p-[22px]">
        <h3 className="label-mono text-ink-700 mb-3.5">Типы чисел</h3>
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
                {active ? (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m4 12 5 5L20 6" />
                  </svg>
                ) : null}
                {type.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="glass-card p-[22px]">
        <h3 className="label-mono text-ink-700 mb-3">Не изменять</h3>
        <TagInput
          value={settings.locked_parts}
          onChange={(next) =>
            onSettingsChange({ ...settings, locked_parts: next })
          }
          placeholder="Например: 'формула Виета'"
        />
        <p className="mt-2.5 text-[12.5px] text-ink-500 leading-relaxed">
          Эти слова и фразы алгоритм не будет менять
        </p>
      </section>

      <section className="glass-card p-[22px]">
        <h3 className="label-mono text-ink-700 mb-3">Проверки</h3>
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
            label="Проверять совпадение ответов"
            hint="Модель должна избегать одинаковых ответов между вариантами"
            checked={settings.check_answer_uniqueness}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                check_answer_uniqueness: e.currentTarget.checked,
              })
            }
          />
        </div>
      </section>
    </>
  );
}
