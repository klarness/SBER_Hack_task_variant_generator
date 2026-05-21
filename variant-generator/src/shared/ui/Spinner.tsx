import { cn } from "@/shared/lib/cn";

interface Props {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className }: Props) {
  return (
    <span
      className={cn(
        "inline-block border-2 border-[rgba(31,138,45,0.18)] border-t-accent rounded-full animate-spin",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
