import { Badge } from "@/components/site/badge";
import { cx } from "@/components/site/class-names";
import { Panel } from "@/components/site/panel";
import { TextLink } from "@/components/site/text-link";
import { studyHref } from "@/content";
import type { ShortStudy } from "@/content/types";

import { DotJoined } from "./dot-joined";
import { SecondaryLink } from "./secondary-link";

type ShortCardProps = {
  study: ShortStudy;
  /** The study link's words ("Read the short study"). */
  readLabel: string;
};

// A short study on the home page: no shape, so a framed card with its own
// fill. Below 640 px it becomes a compact row, as the phone preview draws
// it: the name, then the kind and an arrow, the whole row one link. The same
// markup serves both, so the page holds each study link once.
export function ShortCard({ study, readLabel }: ShortCardProps) {
  const { listing, slug } = study;
  const headingId = `study-${slug}`;
  // The link's words are the same on every card, and on a phone they are
  // only the kind, so its name adds the title, as the /work table does. The
  // name holds the words shown at each width (WCAG 2.5.3): the study link's
  // words, and on a phone the kind, which "In progress" adds when it is not
  // already in them.
  const name = [
    `${readLabel}, ${study.title}`,
    readLabel.toLowerCase().includes(listing.studyLabel.toLowerCase())
      ? null
      : listing.studyLabel.toLowerCase(),
  ]
    .filter((part) => part !== null)
    .join(", ");

  return (
    <Panel
      as="article"
      padding="none"
      aria-labelledby={headingId}
      className="relative flex h-full flex-col p-6 max-sm:min-h-14 max-sm:flex-row max-sm:items-center max-sm:justify-between max-sm:gap-4 max-sm:rounded-xl max-sm:px-5 max-sm:py-1.5 sm:p-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 max-sm:contents">
        <h3
          id={headingId}
          className="font-display text-[1.375rem] leading-tight font-semibold max-sm:font-sans max-sm:text-base max-sm:font-medium"
        >
          {study.title}
        </h3>
        <Badge
          tone={study.inProgress ? "progress" : "plain"}
          className="max-sm:hidden"
        >
          {listing.kind}
        </Badge>
      </div>
      <p className="mt-4.5 leading-[1.6] text-muted max-sm:hidden">
        {listing.line}
      </p>
      <p className="mt-4 font-mono text-xs text-muted max-sm:hidden">
        <DotJoined parts={listing.stack} />
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-6 gap-y-1 pt-4 max-sm:mt-0 max-sm:pt-0">
        {/* On a phone the link's box covers the whole row (its ::after), so
            the row is one 56 px target; its words become the kind. */}
        <TextLink
          href={studyHref(slug)}
          aria-label={name}
          className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium max-sm:font-mono max-sm:text-xs max-sm:tracking-[0.08em] max-sm:uppercase max-sm:after:absolute max-sm:after:inset-0"
          wordsClassName="max-sm:no-underline"
        >
          <span className="max-sm:hidden">{readLabel}</span>
          <span
            className={cx(
              "sm:hidden",
              study.inProgress ? "text-violet" : "text-muted",
            )}
          >
            {listing.studyLabel}
          </span>
        </TextLink>
        {listing.secondary !== undefined && (
          <SecondaryLink link={listing.secondary} className="max-sm:hidden" />
        )}
      </div>
    </Panel>
  );
}
