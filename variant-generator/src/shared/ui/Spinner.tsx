import { cn } from "@/shared/lib/cn";

interface Props {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className }: Props) {
  return (
    <span
      className={cn(
        "inline-block border-2 border-ink-300 border-t-sber-500 rounded-full animate-spin",
        className
      )}
      style={{ width: size, height: size }}
    />
  );
}
