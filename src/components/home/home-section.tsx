import type { ReactNode } from "react";

import { cx, RULE } from "@/components/site/class-names";
import type { ChapterId } from "@/engine/types";

type HomeSectionProps = {
  /** The section's id, the fragment other links can target. */
  id: string;
  /** Makes the section a chapter of the scroll story (REQ-SCR-01). */
  chapter: ChapterId;
  /**
   * The section's name when it has no heading of its own to name it; by
   * default the chapter's h2, whose id is the section's id plus "-heading".
   */
  name?: string;
  /** Classes on the section, such as the chapter's scroll room. */
  className?: string;
  children: ReactNode;
};

// A chapter of the home page after the hero. A hairline rule across the
// whole window opens it; the hero has none above it, and the footer draws
// its own after the last chapter.
export function HomeSection({
  id,
  chapter,
  name,
  className,
  children,
}: HomeSectionProps) {
  return (
    <section
      id={id}
      aria-label={name}
      aria-labelledby={name === undefined ? `${id}-heading` : undefined}
      data-chapter={chapter}
      className={cx("border-t", RULE, className)}
    >
      {children}
    </section>
  );
}
