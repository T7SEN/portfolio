import { studies } from "@/content";

import { StudyCard } from "./study-card";

type StudyListProps = {
  headingLevel: "h2" | "h3";
  /** Extra classes on each item, such as scroll room in the home story. */
  itemClassName?: string;
};

// Every list of studies follows the content index order (REQ-CNT-07). Each
// item carries its place in that order, which the scroll story reads to form
// the matching shape in the field (REQ-SCR-01).
export function StudyList({ headingLevel, itemClassName }: StudyListProps) {
  return (
    <ol className="grid gap-4">
      {studies.map((study, index) => (
        <li key={study.slug} data-work-step={index} className={itemClassName}>
          <StudyCard study={study} headingLevel={headingLevel} />
        </li>
      ))}
    </ol>
  );
}
