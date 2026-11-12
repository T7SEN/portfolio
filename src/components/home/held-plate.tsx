import type { ReactNode } from "react";

import { cx } from "@/components/site/class-names";

type HeldPlateProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Text that holds on screen while the page scrolls (position sticky) and
 * brings its own plate. The veil's plates are laid in page coordinates and
 * scroll with the page, so they cannot follow it; the story leaves text
 * marked data-plate="own" out of them (story-stage.ts), and this plate, the
 * same void at the same strength and soft edge (globals.css, the held
 * plate), moves with the words, so they keep the measured veil behind them
 * over the formed wordmark (REQ-A11Y-06). Its parent must make a stacking
 * context (isolate), so the plate sits over the field and under the words.
 * A plate behind an empty line (the readout and the note before the tier is
 * ready) is not drawn.
 */
export function HeldPlate({ children, className }: HeldPlateProps) {
  return (
    <div data-plate="own" className={cx("relative", className)}>
      <span
        aria-hidden="true"
        data-part="own-plate"
        className="pointer-events-none absolute -inset-4 -z-10 [&:has(+p:empty)]:hidden"
      />
      {children}
    </div>
  );
}
