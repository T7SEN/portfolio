import { studies } from "@/content";

import { cx } from "@/components/site/class-names";

import { StudyCard, type StudyCardVariant } from "./study-card";

type StudyListProps = {
  headingLevel: "h2" | "h3";
  /** Extra classes on each item, such as scroll room in the home story. */
  itemClassName?: string;
  cardVariant?: StudyCardVariant;
  /** Two columns from the lg breakpoint, as on /work. */
  columns?: 1 | 2;
};

// Every list of studies follows the content index order (REQ-CNT-07). Each
// item carries its place in that order, which the scroll story reads to form
// the matching shape in the field (REQ-SCR-01).
export function StudyList({
  headingLevel,
  itemClassName,
  cardVariant,
  columns = 1,
}: StudyListProps) {
  return (
    <ol className={cx("grid gap-4", columns === 2 && "lg:grid-cols-2")}>
      {studies.map((study, index) => (
        <li key={study.slug} data-work-step={index} className={itemClassName}>
          <StudyCard
            study={study}
            headingLevel={headingLevel}
            variant={cardVariant}
          />
        </li>
      ))}
    </ol>
  );
}
