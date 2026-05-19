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
        "h-10 px-3 w-full text-sm bg-white text-ink-900 placeholder:text-ink-500",
        "border rounded-lg transition outline-none",
        invalid
          ? "border-danger focus:shadow-[0_0_0_3px_rgba(230,55,87,0.18)]"
          : "border-border focus:border-sber-500 focus:shadow-focus",
        className
      )}
      {...rest}
    />
  );
});
