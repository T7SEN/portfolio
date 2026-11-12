import { Container } from "@/components/site";
import type { ShortStudy as ShortStudyContent } from "@/content/types";

import { InProgressLabel } from "./in-progress-label";
import { StudyLinks } from "./study-links";
import { StudyPart } from "./study-part";

type ShortStudyProps = {
  study: ShortStudyContent;
};

// One screen at 1280 by 800 and 375 by 812: what, why, stack and links
// (REQ-CNT-04). Below 640 px the bar takes two rows (120 px) since P3.5, so
// the spacing there is tighter to keep the links on the first screen.
export function ShortStudy({ study }: ShortStudyProps) {
  return (
    <Container className="pt-3 pb-8 sm:py-12">
      <article>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="font-mono text-label text-muted">Short study</p>
            {study.inProgress && <InProgressLabel />}
          </div>
          <h1 className="mt-3 font-display text-title">{study.title}</h1>
          {study.inProgress && (
            <p className="mt-3 max-w-measure text-muted">{study.status}</p>
          )}
        </div>

        <div className="mt-4 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2 lg:gap-x-12">
          <StudyPart id="what" title="What it is" variant="compact">
            <p className="max-w-measure">{study.what}</p>
          </StudyPart>
          <StudyPart id="why" title="Why it exists" variant="compact">
            <p className="max-w-measure">{study.why}</p>
          </StudyPart>
          <StudyPart id="stack" title="Stack" variant="compact">
            <ul className="flex flex-wrap gap-2">
              {study.stack.map((item) => (
                <li
                  key={item}
                  className="rounded-md bg-raised px-2.5 py-1 text-sm"
                >
                  {item}
                </li>
              ))}
            </ul>
          </StudyPart>
          <StudyPart id="links" title="Links" variant="compact">
            <StudyLinks links={study.links} />
          </StudyPart>
        </div>
      </article>
    </Container>
  );
}
