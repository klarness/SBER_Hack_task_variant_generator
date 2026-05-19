import { type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, className, ...rest }: Props) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer group select-none",
        className
      )}
    >
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input type="checkbox" className="peer sr-only" {...rest} />
        <span
          className={cn(
            "w-5 h-5 rounded-md border border-border bg-white transition",
            "peer-checked:bg-sber-gradient peer-checked:border-transparent",
            "peer-focus-visible:shadow-focus"
          )}
        />
        <Check
          className="absolute inset-0 m-auto w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition"
          strokeWidth={3}
        />
      </span>
      <span className="flex flex-col gap-0.5 leading-snug">
        <span className="text-sm text-ink-900">{label}</span>
        {hint && <span className="text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  );
}
