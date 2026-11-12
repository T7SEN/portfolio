import { cx } from "@/components/site/class-names";
import { Container } from "@/components/site/container";
import { Label } from "@/components/site/label";
import { studyNumber } from "@/content";
import { studyPage } from "@/content/pages";
import type { FullStudy as FullStudyContent } from "@/content/types";

import { StudyBreadcrumb } from "./study-breadcrumb";
import { StudyContents, type ContentsPart } from "./study-contents";
import { StudyDiagram } from "./study-diagram";
import { StudyExcerpt } from "./study-excerpt";
import { StudyFacts } from "./study-facts";
import { StudyLinks } from "./study-links";
import { StudyNeighbours } from "./study-neighbours";
import { StudyPart } from "./study-part";
import { StudyQuotes } from "./study-quotes";
import { StudyResults } from "./study-results";
import { StudyScreenshot } from "./study-screenshot";

type FullStudyProps = {
  study: FullStudyContent;
};

const { parts } = studyPage;

/** The section id of each part, which the list of parts links to. */
export const PART_IDS = {
  summary: "summary",
  problem: "problem",
  approach: "approach",
  hardPart: "hard-part",
  results: "results",
  wouldChange: "would-change",
  links: "links",
} as const satisfies Record<keyof typeof parts, string>;

const CONTENTS: readonly ContentsPart[] = (
  Object.keys(PART_IDS) as (keyof typeof PART_IDS)[]
).map((key) => ({ id: PART_IDS[key], title: parts[key] }));

const TITLE_ID = "study-title";

/** Body text inside a part: muted, at the measure. */
const PROSE = "max-w-measure leading-[1.7] text-muted";

const SUBHEAD = "font-semibold text-text";

// The seven parts always run in this order: clients read a study as problem,
// work and outcome (REQ-CNT-03). The summary is the three lines under the
// title, the first in the text colour; its heading is for screen readers, so
// it still opens a part of its own.
export function FullStudy({ study }: FullStudyProps) {
  const links = study.links.repo
    ? [study.links.live, study.links.repo]
    : [study.links.live];
  const [lead, ...rest] = study.summary;

  return (
    <Container className="pt-1 pb-16 sm:pt-4 sm:pb-24 lg:pt-6">
      <StudyBreadcrumb title={study.title} />
      <article aria-labelledby={TITLE_ID} className="mt-2">
        <div>
          <Label
            parts={[
              `${studyPage.label.full} ${studyNumber(study.slug)}`,
              study.tag,
            ]}
          />
          <h1 id={TITLE_ID} className="mt-4 font-display text-title font-bold">
            {study.title}
          </h1>
          {study.notice && (
            <p className="mt-5 max-w-measure border-s-2 border-edge ps-4 text-sm text-text">
              {study.notice}
            </p>
          )}
          <section
            id={PART_IDS.summary}
            aria-labelledby={`${PART_IDS.summary}-heading`}
            className="mt-5 max-w-[47.5rem] scroll-mt-8"
          >
            <h2 id={`${PART_IDS.summary}-heading`} className="sr-only">
              {parts.summary}
            </h2>
            <div className="flex flex-col gap-1 text-lead">
              <p className="text-text">{lead}</p>
              {rest.map((line, index) => (
                <p key={index} className="text-muted">
                  {line}
                </p>
              ))}
            </div>
          </section>
          <StudyFacts study={study} className="mt-7" />
        </div>

        <StudyScreenshot
          screenshot={study.screenshot}
          className="mt-12 sm:mt-14"
        />

        <div className="mt-12 grid gap-10 sm:mt-14 lg:grid-cols-[minmax(0,13.75rem)_minmax(0,51.25rem)] lg:gap-x-18">
          <StudyContents label={studyPage.contents} parts={CONTENTS} />
          <div className="flex min-w-0 flex-col gap-14">
            <StudyPart id={PART_IDS.problem} title={parts.problem}>
              <p className={PROSE}>{study.problem.problem}</p>
              <div>
                <h3 className={SUBHEAD}>{studyPage.problem.constraints}</h3>
                <ul className={cx(PROSE, "mt-2 list-disc ps-5")}>
                  {study.problem.constraints.map((constraint, index) => (
                    <li key={index}>{constraint}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className={SUBHEAD}>{studyPage.problem.role}</h3>
                <p className={cx(PROSE, "mt-2")}>{study.problem.role}</p>
              </div>
            </StudyPart>

            <StudyPart id={PART_IDS.approach} title={parts.approach}>
              {study.approach.map((paragraph, index) => (
                <p key={index} className={PROSE}>
                  {paragraph}
                </p>
              ))}
              <StudyDiagram diagram={study.diagram} />
              <StudyExcerpt excerpt={study.excerpt} />
            </StudyPart>

            <StudyPart id={PART_IDS.hardPart} title={parts.hardPart}>
              <p className={PROSE}>{study.hardPart}</p>
            </StudyPart>

            <StudyPart id={PART_IDS.results} title={parts.results}>
              <StudyResults results={study.results} />
              {study.quotes !== undefined && (
                <StudyQuotes quotes={study.quotes} />
              )}
            </StudyPart>

            <StudyPart id={PART_IDS.wouldChange} title={parts.wouldChange}>
              {study.wouldChange.map((change, index) => (
                <p key={index} className={PROSE}>
                  {change}
                </p>
              ))}
            </StudyPart>

            <StudyPart id={PART_IDS.links} title={parts.links}>
              <StudyLinks links={links} layout="row" />
            </StudyPart>
          </div>
        </div>
      </article>
      <StudyNeighbours slug={study.slug} className="mt-16 sm:mt-20" />
    </Container>
  );
}
