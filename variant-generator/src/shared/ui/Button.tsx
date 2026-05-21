import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white border-[1.5px] border-accent shadow-soft " +
    "hover:bg-soft-hover hover:text-accent-ink hover:shadow-softHover " +
    "active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed",
  soft:
    "bg-accent-soft text-accent-ink border-[1.5px] border-transparent " +
    "hover:bg-accent hover:text-white hover:border-accent " +
    "active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "bg-white/70 backdrop-blur text-ink-900 border-[1.5px] border-border " +
    "hover:bg-white hover:border-accent/60 " +
    "active:scale-[0.98] transition disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-700 border-[1.5px] border-transparent " +
    "hover:bg-white/60 hover:text-ink-900 " +
    "active:scale-[0.98] transition disabled:opacity-50",
  danger:
    "bg-white text-danger border-[1.5px] border-danger/40 " +
    "hover:bg-warn-bg hover:border-danger " +
    "active:scale-[0.98] transition disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px] rounded-full gap-2 font-semibold",
  md: "h-10 px-[18px] text-sm rounded-full gap-2 font-semibold",
  lg: "h-12 px-6 text-base rounded-full gap-2.5 font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", className, loading, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center select-none whitespace-nowrap",
        "focus:outline-none focus-visible:shadow-focus tracking-[-0.005em]",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
});
