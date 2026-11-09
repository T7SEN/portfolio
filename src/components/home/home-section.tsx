import type { ReactNode } from "react";

import { Container } from "@/components/site";

type HomeSectionProps = {
  /** The heading's id; also the fragment other links can target. */
  id: string;
  title: string;
  children: ReactNode;
};

// Each chapter of the story is a section with its own heading.
export function HomeSection({ id, title, children }: HomeSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      <Container className="py-16 sm:py-20">
        <h2 id={`${id}-heading`} className="text-heading">
          {title}
        </h2>
        <div className="mt-6">{children}</div>
      </Container>
    </section>
  );
}
