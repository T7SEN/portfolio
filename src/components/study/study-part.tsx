import type { ReactNode } from "react";

import { cx, MONO_CAPS } from "@/components/site/class-names";

type StudyPartProps = {
  /** The part's place on the page: the list of parts links to it. */
  id: string;
  title: string;
  /** "compact" keeps a short study on one screen (REQ-CNT-04). */
  variant?: "full" | "compact";
  children: ReactNode;
  className?: string;
};

// Each part of the outline is a section under its own heading, so a screen
// reader can jump between parts (REQ-CNT-03).
export function StudyPart({
  id,
  title,
  variant = "full",
  children,
  className,
}: StudyPartProps) {
  const isCompact = variant === "compact";
  const headingId = `${id}-heading`;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cx("scroll-mt-8", className)}
    >
      <h2
        id={headingId}
        className={
          isCompact
            ? cx(
                MONO_CAPS,
                "text-xs leading-[1.4] tracking-[0.14em] text-muted",
              )
            : "text-heading text-text"
        }
      >
        {title}
      </h2>
      <div className={isCompact ? "mt-1.5" : "mt-4 flex flex-col gap-5"}>
        {children}
      </div>
    </section>
  );
}
