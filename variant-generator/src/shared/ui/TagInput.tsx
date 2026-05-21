import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function TagInput({
  value,
  onChange,
  placeholder = "Введите фразу и Enter",
}: Props) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="min-h-11 px-2.5 py-2 w-full bg-glass-input backdrop-blur-sm border-[1.5px] border-border rounded-xl flex flex-wrap items-center gap-1.5 focus-within:border-accent focus-within:shadow-focus transition">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 h-7 pl-3 pr-1 rounded-full bg-accent-soft text-accent-ink text-xs font-semibold"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full hover:bg-accent/15"
            aria-label={`Удалить ${tag}`}
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="flex-1 min-w-[120px] h-7 px-1 outline-none bg-transparent text-sm placeholder:text-ink-500"
      />
    </div>
  );
}
