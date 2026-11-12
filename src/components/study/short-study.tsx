import { Container } from "@/components/site/container";
import { Label } from "@/components/site/label";
import { studyNumber } from "@/content";
import { studyPage } from "@/content/pages";
import type { ShortStudy as ShortStudyContent } from "@/content/types";

import { DotJoined } from "./dot-joined";
import { InProgressLabel } from "./in-progress-label";
import { StudyBreadcrumb } from "./study-breadcrumb";
import { StudyLinks } from "./study-links";
import { StudyNeighbours } from "./study-neighbours";
import { StudyPart } from "./study-part";

type ShortStudyProps = {
  study: ShortStudyContent;
};

const TITLE_ID = "study-title";

// A full study's language, shorter: what, why, stack and links on one screen
// at 1280 by 800 and 375 by 812 (REQ-CNT-04). Below 640 px the bar takes two
// rows (120 px), so the spacing there is tight, and the stack is one mono
// line joined by middle dots, as on the short cards, rather than chips. The
// previous and next cards sit after the article, below that screen.
export function ShortStudy({ study }: ShortStudyProps) {
  const { shortParts } = studyPage;

  return (
    <Container className="pt-1 pb-16 sm:pt-4 sm:pb-24 lg:pt-6">
      <StudyBreadcrumb title={study.title} />
      <article aria-labelledby={TITLE_ID} className="mt-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Label
            parts={[
              `${studyPage.label.short} ${studyNumber(study.slug)}`,
              study.tag,
            ]}
          />
          {study.inProgress && <InProgressLabel />}
        </div>
        <h1 id={TITLE_ID} className="mt-3 font-display text-title font-bold">
          {study.title}
        </h1>
        {study.inProgress && (
          <p className="mt-2 max-w-measure text-muted">{study.status}</p>
        )}

        <div className="mt-5 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2 lg:gap-x-14">
          <StudyPart id="what" title={shortParts.what} variant="compact">
            <p className="max-w-measure text-text">{study.what}</p>
          </StudyPart>
          <StudyPart id="why" title={shortParts.why} variant="compact">
            <p className="max-w-measure text-muted">{study.why}</p>
          </StudyPart>
          <StudyPart id="stack" title={shortParts.stack} variant="compact">
            <p className="font-mono text-xs leading-[1.7] text-muted">
              <DotJoined parts={study.stack} />
            </p>
          </StudyPart>
          {/* A study in progress may have nothing to link to yet. */}
          {study.links.length > 0 && (
            <StudyPart id="links" title={shortParts.links} variant="compact">
              <StudyLinks links={study.links} layout="row" />
            </StudyPart>
          )}
        </div>
      </article>
      <StudyNeighbours slug={study.slug} className="mt-12 sm:mt-16" />
    </Container>
  );
}
