import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/shared/lib/cn";

interface Props extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { className, hoverable, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "bg-surface-card border border-border-subtle rounded-xl2 shadow-card",
        hoverable && "hover:shadow-cardHover transition-shadow",
        className
      )}
      {...rest}
    />
  );
});
