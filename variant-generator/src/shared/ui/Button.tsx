import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-sber-gradient hover:bg-sber-gradient-hover text-white shadow-sm " +
    "active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "bg-white text-ink-900 border border-border hover:border-ink-300 " +
    "active:scale-[0.98] transition disabled:opacity-50",
  ghost:
    "bg-transparent text-ink-700 hover:bg-surface-subtle " +
    "active:scale-[0.98] transition disabled:opacity-50",
  danger:
    "bg-white text-danger border border-border hover:bg-red-50 hover:border-danger/30 " +
    "active:scale-[0.98] transition disabled:opacity-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2 font-semibold",
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
        "inline-flex items-center justify-center font-medium select-none",
        "focus:outline-none focus-visible:shadow-focus",
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
