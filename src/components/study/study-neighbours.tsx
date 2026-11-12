import { cx, HAIRLINE_STRONG, RULE } from "@/components/site/class-names";
import { Label } from "@/components/site/label";
import { SiteAnchor } from "@/components/site/site-anchor";
import { studies, studyHref, studySlugs } from "@/content";
import { studyPage } from "@/content/pages";
import type { Study, StudySlug } from "@/content/types";

type StudyNeighboursProps = {
  slug: StudySlug;
  className?: string;
};

type Direction = "previous" | "next";

function NeighbourCard({
  study,
  direction,
  className,
}: {
  study: Study;
  direction: Direction;
  className?: string;
}) {
  const isNext = direction === "next";
  // The arrows point out of the page, toward the study they lead to, and
  // mirror on right-to-left pages.
  const arrow = (
    <span
      aria-hidden="true"
      className="inline-block text-glow rtl:-scale-x-100"
    >
      {isNext ? "→" : "←"}
    </span>
  );

  return (
    <SiteAnchor
      href={studyHref(study.slug)}
      rel={isNext ? "next" : "prev"}
      className={cx(
        "group flex min-h-11 flex-col gap-2 rounded-2xl border bg-surface p-6",
        RULE,
        isNext && "items-end text-end",
        className,
      )}
    >
      <Label
        as="span"
        parts={[isNext ? studyPage.more.next : studyPage.more.previous]}
      />{" "}
      <span className="text-xl font-semibold text-text transition-colors group-hover:text-paper group-focus-visible:text-paper">
        {isNext ? (
          <>
            {study.title} {arrow}
          </>
        ) : (
          <>
            {arrow} {study.title}
          </>
        )}
      </span>
    </SiteAnchor>
  );
}

// The studies before and after this one in the study order (REQ-CNT-07), as
// two raised cards. The first study has no previous card and the last no
// next card; a lone next card keeps to the end column.
export function StudyNeighbours({ slug, className }: StudyNeighboursProps) {
  const index = studySlugs.indexOf(slug);
  const previous = studies[index - 1];
  const next = studies[index + 1];
  if (previous === undefined && next === undefined) return null;

  return (
    <nav
      aria-label={studyPage.more.name}
      className={cx(
        "grid gap-4 border-t pt-10 sm:grid-cols-2 sm:gap-5",
        HAIRLINE_STRONG,
        className,
      )}
    >
      {previous !== undefined && (
        <NeighbourCard study={previous} direction="previous" />
      )}
      {next !== undefined && (
        <NeighbourCard
          study={next}
          direction="next"
          className={previous === undefined ? "sm:col-start-2" : undefined}
        />
      )}
    </nav>
  );
}
