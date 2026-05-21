import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { className, invalid, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 px-4 w-full text-[15px] bg-glass-input backdrop-blur-sm text-ink-900 placeholder:text-ink-500",
        "border-[1.5px] rounded-xl transition outline-none",
        invalid
          ? "border-danger focus:shadow-[0_0_0_4px_rgba(208,58,26,0.18)]"
          : "border-border focus:border-accent focus:shadow-focus",
        className
      )}
      {...rest}
    />
  );
});
