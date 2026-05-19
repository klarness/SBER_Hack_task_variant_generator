import { type ChangeEvent } from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
}

export function Slider({
  value,
  onChange,
  min = 2,
  max = 10,
  step = 1,
  label,
  className,
}: Props) {
  const pct = ((value - min) / (max - min)) * 100;
  const handle = (e: ChangeEvent<HTMLInputElement>) =>
    onChange(Number(e.target.value));

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-ink-700">{label}</span>
          <span className="text-base font-semibold text-ink-900 tabular-nums">
            {value}
          </span>
        </div>
      )}
      <div className="relative h-2 rounded-full bg-surface-subtle">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-sber-gradient"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handle}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white shadow-md border-2 border-sber-500 pointer-events-none"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-ink-500 tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
