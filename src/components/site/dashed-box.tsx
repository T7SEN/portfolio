import type { ReactNode } from "react";

import { cx, HAIRLINE_STRONG } from "./class-names";

type DashedBoxProps = {
  children: ReactNode;
  className?: string;
};

// A dashed hairline box that holds the place of something a later phase
// brings (the form's spam check). Its words say what will be there.
export function DashedBox({ children, className }: DashedBoxProps) {
  return (
    <div
      className={cx(
        "flex min-h-12 items-center gap-2.5 rounded-xl border border-dashed px-4 font-mono text-xs text-muted",
        HAIRLINE_STRONG,
        className,
      )}
    >
      {children}
    </div>
  );
}
