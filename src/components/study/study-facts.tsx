import { cx } from "@/components/site/class-names";
import { Label } from "@/components/site/label";
import { TextLink } from "@/components/site/text-link";
import { isMarker } from "@/content/markers";
import { studyPage } from "@/content/pages";
import type { FullStudy, Link } from "@/content/types";

type StudyFactsProps = {
  study: FullStudy;
  className?: string;
};

/** An address as it reads on the page: no scheme and no closing slash. */
export function readableAddress(href: string) {
  return href.replace(/^(?:https:\/\/|mailto:)/, "").replace(/\/$/, "");
}

function FactLink({ link }: { link: Link }) {
  // An address not supplied yet stays visible text, never a link to nowhere
  // (REQ-CNT-05).
  if (isMarker(link.href)) {
    return <span className="text-muted">{link.href}</span>;
  }

  // The target is 44 px tall; the negative margin keeps its words on the
  // same line as the facts beside it.
  return (
    <TextLink
      href={link.href}
      className="-my-3 inline-flex min-h-11 items-center wrap-anywhere"
    >
      {readableAddress(link.href)}
    </TextLink>
  );
}

// Role, Built with, Live and Code under the summary, as mono labels over
// their values. A study whose repository is not public says its code is on
// request.
export function StudyFacts({ study, className }: StudyFactsProps) {
  const { facts } = studyPage;
  const rows = [
    { label: facts.role, value: study.roleLine },
    { label: facts.builtWith, value: study.listing.builtWith },
    { label: facts.live, value: <FactLink link={study.links.live} /> },
    {
      label: facts.code,
      value:
        study.links.repo === undefined ? (
          facts.codeOnRequest
        ) : (
          <FactLink link={study.links.repo} />
        ),
    },
  ];

  return (
    <dl
      className={cx(
        "grid max-w-[62.5rem] grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 flex-col gap-1.5">
          <Label as="dt" parts={[row.label]} />
          <dd className="text-base wrap-anywhere text-text">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
