import { TextLink } from "@/components/site";
import { cx } from "@/components/site/class-names";
import { studyHref } from "@/content";
import type { Study } from "@/content/types";

import { InProgressLabel } from "./in-progress-label";

export type StudyCardVariant = "filled" | "outline";

type StudyCardProps = {
  study: Study;
  /** h2 where the list sits under the page h1, h3 under a section h2. */
  headingLevel: "h2" | "h3";
  /**
   * filled sits on its own surface; outline lets the field show through, for
   * the home story, where each study's shape forms behind and beside its
   * card. The veil keeps outline text at 4.5 to 1 or better
   * (accessibility.md section 7).
   */
  variant?: StudyCardVariant;
};

export function StudyCard({
  study,
  headingLevel: Heading,
  variant = "filled",
}: StudyCardProps) {
  const isFull = study.kind === "full";

  return (
    <article
      className={cx(
        "h-full rounded-lg border p-5 sm:p-6",
        variant === "filled" ? "border-raised bg-surface" : "border-edge",
      )}
    >
      <Heading className="text-heading">
        <TextLink href={studyHref(study.slug)}>{study.title}</TextLink>
      </Heading>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-mono text-label text-muted">
          {isFull ? "Full study" : "Short study"}
        </p>
        {study.kind === "short" && study.inProgress && <InProgressLabel />}
      </div>
      <p className="mt-3 max-w-measure text-muted">
        {isFull ? study.leadAngle : study.what}
      </p>
    </article>
  );
}
