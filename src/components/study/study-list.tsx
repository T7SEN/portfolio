import { studies } from "@/content";

import { StudyCard } from "./study-card";

type StudyListProps = {
  headingLevel: "h2" | "h3";
};

// Every list of studies follows the content index order (REQ-CNT-07).
export function StudyList({ headingLevel }: StudyListProps) {
  return (
    <ol className="grid gap-4">
      {studies.map((study) => (
        <li key={study.slug}>
          <StudyCard study={study} headingLevel={headingLevel} />
        </li>
      ))}
    </ol>
  );
}
