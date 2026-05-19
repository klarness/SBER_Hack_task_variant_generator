import { Slider } from "@/shared/ui/Slider";
import { Checkbox } from "@/shared/ui/Checkbox";
import { TagInput } from "@/shared/ui/TagInput";
import type {
  TaskSettings,
  VariationStrategy,
} from "@/shared/types/domain";

interface Props {
  variantCount: number;
  onVariantCountChange: (n: number) => void;
  settings: TaskSettings;
  onSettingsChange: (next: TaskSettings) => void;
}

const STRATEGIES: {
  key: VariationStrategy;
  label: string;
  hint: string;
}[] = [
  {
    key: "numeric",
    label: "Замена числовых данных",
    hint: "Меняются числа в условии при сохранении сложности",
  },
  {
    key: "synonyms",
    label: "Синонимическая замена",
    hint: "Переформулировка неключевых частей текста",
  },
  {
    key: "context",
    label: "Изменение контекста",
    hint: "Меняются примеры, имена, ситуации",
  },
  {
    key: "reorder",
    label: "Перестановка шагов",
    hint: "Меняется порядок пунктов в инструкции",
  },
];

export function SettingsPanel({
  variantCount,
  onVariantCountChange,
  settings,
  onSettingsChange,
}: Props) {
  const toggle = (key: VariationStrategy) => {
    const next = settings.variation_strategies.includes(key)
      ? settings.variation_strategies.filter((s) => s !== key)
      : [...settings.variation_strategies, key];
    onSettingsChange({ ...settings, variation_strategies: next });
  };

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
          Параметры мультипликации
        </h3>
        <Slider
          label="Количество вариантов"
          value={variantCount}
          onChange={onVariantCountChange}
          min={2}
          max={10}
        />
      </section>

      <section>
        <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
          Стратегии изменения
        </h3>
        <div className="flex flex-col gap-3">
          {STRATEGIES.map((s) => (
            <Checkbox
              key={s.key}
              label={s.label}
              hint={s.hint}
              checked={settings.variation_strategies.includes(s.key)}
              onChange={() => toggle(s.key)}
            />
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-3">
          Не изменять
        </h3>
        <TagInput
          value={settings.locked_phrases}
          onChange={(next) =>
            onSettingsChange({ ...settings, locked_phrases: next })
          }
          placeholder="Например: 'формула Виета', Enter для добавления"
        />
        <p className="mt-1.5 text-xs text-ink-500">
          Эти слова и фразы алгоритм не будет менять
        </p>
      </section>
    </div>
  );
}
