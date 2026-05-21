import { type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/shared/lib/cn";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hint?: string;
}

export function Checkbox({ label, hint, className, checked, ...rest }: Props) {
  return (
    <label
      className={cn(
        "group/check flex items-start gap-3 cursor-pointer select-none",
        "px-3.5 py-3 rounded-xl border transition",
        checked
          ? "bg-[rgba(212,239,176,0.55)] border-[rgba(31,138,45,0.22)]"
          : "border-transparent hover:bg-white/60",
        className
      )}
    >
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          className="peer sr-only"
          {...rest}
        />
        <span
          className={cn(
            "w-[22px] h-[22px] rounded-[7px] transition grid place-items-center",
            checked
              ? "bg-accent border-[1.5px] border-accent"
              : "bg-transparent border-[1.5px] border-border"
          )}
        >
          <Check
            className={cn(
              "w-3.5 h-3.5 text-white transition",
              checked ? "opacity-100" : "opacity-0"
            )}
            strokeWidth={3}
          />
        </span>
      </span>
      <span className="flex flex-col gap-1 leading-snug min-w-0">
        <span className="text-[14px] font-semibold text-ink-900">{label}</span>
        {hint && (
          <span className="text-[12.5px] text-ink-700 leading-relaxed">
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}
