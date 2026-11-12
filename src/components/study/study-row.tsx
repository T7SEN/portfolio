import { Chip } from "@/components/site/chip";
import { Label } from "@/components/site/label";
import { TextLink } from "@/components/site/text-link";
import { studyHref, studyNumber } from "@/content";
import type { FullStudy } from "@/content/types";

import { RowQuote } from "./row-quote";
import { SecondaryLink } from "./secondary-link";
import { StudyFrame } from "./study-frame";

type StudyRowProps = {
  study: FullStudy;
  /** The study link's words ("Read the case study"). */
  readLabel: string;
};

// A full study on the home page: its frame on the inline start side, where
// the field forms the study's shape, and its details on the end side. Below
// 1024 px the frame sits above the details.
export function StudyRow({ study, readLabel }: StudyRowProps) {
  const { listing, slug } = study;
  const headingId = `study-${slug}`;

  return (
    <article
      aria-labelledby={headingId}
      className="grid items-center gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14"
    >
      <StudyFrame slug={slug} />
      <div>
        <Label parts={[studyNumber(slug), listing.kind]} />
        <h3
          id={headingId}
          className="mt-3.5 font-display text-2xl leading-tight font-semibold tracking-[-0.01em] lg:text-[2rem]"
        >
          {study.title}
        </h3>
        <p className="mt-4 leading-[1.6] text-muted">{listing.line}</p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {listing.stack.map((item) => (
            <Chip as="li" key={item}>
              {item}
            </Chip>
          ))}
        </ul>
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
          {listing.metrics.map((metric) => (
            <div key={metric.label}>
              <Label as="dt" size="xs" parts={[metric.label]} />
              <dd className="mt-1.5 text-[0.9375rem] text-text">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
        {listing.quote !== undefined && <RowQuote quote={listing.quote} />}
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1">
          <TextLink
            href={studyHref(slug)}
            className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
          >
            {readLabel}
          </TextLink>
          {listing.secondary !== undefined && (
            <SecondaryLink link={listing.secondary} />
          )}
        </div>
      </div>
    </article>
  );
}
