import type { ReactNode } from "react";

import { cx, HAIRLINE, MONO_CAPS } from "./class-names";

/**
 * plain: a muted mono pill ("Short-form"). progress: violet with an open
 * circle before the words ("In progress"), so the state shows in shape as
 * well as in colour.
 */
export type BadgeTone = "plain" | "progress";

type BadgeProps = {
  /** In sentence case; the badge sets the capitals. */
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
};

export function Badge({ children, tone = "plain", className }: BadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1.25 text-[0.6875rem] leading-none tracking-[0.08em]",
        MONO_CAPS,
        HAIRLINE,
        tone === "progress" ? "text-violet" : "text-muted",
        className,
      )}
    >
      {tone === "progress" && (
        <span
          aria-hidden="true"
          className="size-[7px] rounded-full border-[1.5px] border-current"
        />
      )}
      {children}
    </span>
  );
}
