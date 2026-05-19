import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "min-h-[120px] p-3 w-full text-sm bg-white text-ink-900 placeholder:text-ink-500",
        "border border-border rounded-lg outline-none resize-y",
        "focus:border-sber-500 focus:shadow-focus transition",
        className
      )}
      {...rest}
    />
  );
});
