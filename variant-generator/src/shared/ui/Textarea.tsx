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
        "min-h-[140px] p-4 w-full text-[14.5px] leading-relaxed bg-glass-input backdrop-blur-sm text-ink-900 placeholder:text-ink-500",
        "border-[1.5px] border-border rounded-xl outline-none resize-y",
        "focus:border-accent focus:shadow-focus transition",
        className
      )}
      {...rest}
    />
  );
});
