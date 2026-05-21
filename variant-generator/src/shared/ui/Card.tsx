import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/shared/lib/cn";

interface Props extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  flat?: boolean;
}

export const Card = forwardRef<HTMLDivElement, Props>(function Card(
  { className, hoverable, flat, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        flat
          ? "bg-white border border-border-legacy rounded-xl2 shadow-card"
          : "glass-card",
        hoverable && "transition-shadow hover:shadow-glassHover",
        className
      )}
      {...rest}
    />
  );
});
