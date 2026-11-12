import type { ReactNode } from "react";

import { cx, HAIRLINE } from "./class-names";

type ChipProps = {
  children: ReactNode;
  /** li inside a list of chips (a study's stack), span anywhere else. */
  as?: "span" | "li";
  className?: string;
};

// A small mono pill with a hairline border: one item of a stack. It is not a
// control, so it needs no target size.
export function Chip({ children, as: Tag = "span", className }: ChipProps) {
  return (
    <Tag
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1.5 font-mono text-xs leading-none text-muted",
        HAIRLINE,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
