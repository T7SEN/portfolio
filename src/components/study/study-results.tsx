import { cx } from "@/components/site/class-names";
import { Panel } from "@/components/site/panel";
import { isMarker } from "@/content/markers";
import { studyPage } from "@/content/pages";
import type { NonEmpty, ResultRow } from "@/content/types";

type StudyResultsProps = {
  results: NonEmpty<ResultRow>;
};

// One card per result: the figure in Unbounded glow, its label, then its
// source, so a reader can trace each number (REQ-CNT-05). A list keeps the
// label before the figure for a screen reader; the figure is drawn first. A
// figure still to come is set smaller, so its marker reads as a note.
export function StudyResults({ results }: StudyResultsProps) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((row, index) => (
        <Panel
          key={index}
          padding="none"
          className="flex flex-col gap-2 p-5 sm:p-6"
        >
          <dt className="order-2 text-[0.9375rem] text-text">{row.label}</dt>
          <dd
            className={cx(
              "order-1 font-display font-bold text-glow",
              isMarker(row.value)
                ? "text-base leading-snug"
                : "text-[1.875rem] leading-tight",
            )}
          >
            {row.value}
          </dd>
          <dd className="order-3 text-[0.8125rem] text-muted">
            {`${studyPage.source}: ${row.source}`}
          </dd>
        </Panel>
      ))}
    </dl>
  );
}
