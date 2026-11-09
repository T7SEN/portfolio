import { TextLink } from "@/components/site";
import { studyHref } from "@/content";
import type { Study } from "@/content/types";

import { InProgressLabel } from "./in-progress-label";

type StudyCardProps = {
  study: Study;
  /** h2 where the list sits under the page h1, h3 under a section h2. */
  headingLevel: "h2" | "h3";
};

export function StudyCard({ study, headingLevel: Heading }: StudyCardProps) {
  const isFull = study.kind === "full";

  return (
    <article className="h-full rounded-lg border border-raised bg-surface p-5 sm:p-6">
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
