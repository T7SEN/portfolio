import { Container } from "@/components/site";
import type { FullStudy as FullStudyContent } from "@/content/types";

import { StudyLinks } from "./study-links";
import { StudyPart } from "./study-part";
import { StudyResults } from "./study-results";

type FullStudyProps = {
  study: FullStudyContent;
};

// The seven parts always run in this order: clients read a study as problem,
// work and outcome (REQ-CNT-03).
export function FullStudy({ study }: FullStudyProps) {
  const links = study.links.repo
    ? [study.links.live, study.links.repo]
    : [study.links.live];

  return (
    <Container className="py-12 sm:py-16">
      <article className="max-w-3xl">
        <div>
          <p className="font-mono text-label text-muted">Full study</p>
          <h1 className="mt-3 font-display text-title">{study.title}</h1>
          <p className="mt-4 max-w-measure text-lead text-muted">
            {study.leadAngle}
          </p>
          {study.notice && (
            <p className="mt-6 max-w-measure border-s-2 border-edge ps-4">
              {study.notice}
            </p>
          )}
        </div>

        <div className="mt-12 flex flex-col gap-12">
          <StudyPart id="summary" title="Summary">
            <div className="flex max-w-measure flex-col gap-2 text-lead">
              {study.summary.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </StudyPart>

          <StudyPart id="problem" title="The problem">
            <div className="max-w-measure">
              <p>{study.problem.problem}</p>
              <h3 className="mt-6 font-mono text-label text-muted">
                Constraints
              </h3>
              <ul className="mt-2 list-disc ps-5">
                {study.problem.constraints.map((constraint, index) => (
                  <li key={index}>{constraint}</li>
                ))}
              </ul>
              <h3 className="mt-6 font-mono text-label text-muted">Role</h3>
              <p className="mt-2">{study.problem.role}</p>
            </div>
          </StudyPart>

          <StudyPart id="approach" title="Approach and architecture">
            <div className="flex max-w-measure flex-col gap-4">
              {study.approach.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </StudyPart>

          <StudyPart id="hard-part" title="The hard part">
            <p className="max-w-measure">{study.hardPart}</p>
          </StudyPart>

          <StudyPart id="results" title="Results">
            <StudyResults results={study.results} quotes={study.quotes} />
          </StudyPart>

          <StudyPart id="would-change" title="What I would change">
            <ul className="max-w-measure list-disc ps-5">
              {study.wouldChange.map((change, index) => (
                <li key={index}>{change}</li>
              ))}
            </ul>
          </StudyPart>

          <StudyPart id="links" title="Links">
            <StudyLinks links={links} />
          </StudyPart>
        </div>
      </article>
    </Container>
  );
}
