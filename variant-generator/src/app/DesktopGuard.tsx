import { Monitor } from "lucide-react";
import { type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

export function DesktopGuard({ children }: Props) {
  return (
    <>
      <div className="hidden lg:contents">{children}</div>

      <div className="lg:hidden fixed inset-0 grid place-items-center bg-surface-base p-8 text-center">
        <div className="max-w-xs">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-sber-gradient grid place-items-center text-white mb-5">
            <Monitor size={26} strokeWidth={1.5} />
          </div>
          <h1 className="text-xl font-bold font-display text-ink-900">
            Откройте с компьютера
          </h1>
          <p className="mt-2 text-sm text-ink-700">
            На телефоне работать с вариантами неудобно. 
            Откройте сайт на ноутбуке.
          </p>
        </div>
      </div>
    </>
  );
}
