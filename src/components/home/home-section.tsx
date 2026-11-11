import type { ReactNode } from "react";

import { Container } from "@/components/site";
import { cx } from "@/components/site/class-names";
import type { ChapterId } from "@/engine/types";

import { StoryScene } from "./story-scene";

type HomeSectionProps = {
  /** The heading's id; also the fragment other links can target. */
  id: string;
  title: string;
  /** Makes the section a chapter of the scroll story (REQ-SCR-01). */
  chapter?: ChapterId;
  /** Extra classes on the inner container, such as a chapter's scroll room. */
  className?: string;
  children: ReactNode;
};

// Each block of the home page is a section with its own heading. A chapter
// also carries its scene description, and its title is the one the story
// reveals when it scrolls into view.
export function HomeSection({
  id,
  title,
  chapter,
  className,
  children,
}: HomeSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} data-chapter={chapter}>
      <Container className={cx("py-16 sm:py-20", className)}>
        <h2
          id={`${id}-heading`}
          className="text-heading"
          data-story-title={chapter === undefined ? undefined : ""}
        >
          {title}
        </h2>
        {chapter !== undefined && <StoryScene chapter={chapter} />}
        <div className="mt-6">{children}</div>
      </Container>
    </section>
  );
}
