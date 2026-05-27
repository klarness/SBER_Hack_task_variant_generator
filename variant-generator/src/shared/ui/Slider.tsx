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
          <span className="text-[15px] text-ink-900">{label}</span>
          <span className="text-3xl font-bold text-ink-900 tabular-nums tracking-tighter2 leading-none">
            {value}
          </span>
        </div>
      )}
      <div className="relative h-[44px]">
        {/* floating value bubble above the thumb */}
        <div
          className="absolute -translate-x-1/2 pointer-events-none top-0"
          style={{ left: `${pct}%` }}
        >
          <div className="px-2.5 py-0.5 rounded-full bg-accent text-white text-xs font-bold tabular-nums shadow-soft">
            {value}
          </div>
        </div>

        {/* track + filled */}
        <div className="absolute left-0 right-0 top-[31px] h-1 rounded-full bg-[rgba(20,30,10,0.08)]" />
        <div
          className="absolute left-0 top-[31px] h-1 rounded-full"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #D4EFB0, #23A038)",
          }}
        />

        {/* native range input on top for interaction */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handle}
          className="absolute left-0 right-0 bottom-0 w-full h-[22px] opacity-0 cursor-pointer"
        />

        {/* visual thumb */}
        <div
          className="absolute top-[22px] w-[22px] h-[22px] rounded-full bg-white border-[2.5px] border-accent pointer-events-none"
          style={{
            left: `calc(${pct}% - 11px)`,
            boxShadow: "0 6px 14px -4px rgba(35,160,56,0.45)",
          }}
        />
      </div>
      <div className="flex justify-between text-xs text-ink-500 tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
