import { StudyList } from "@/components/study";
import { pages } from "@/content/pages";

import { HomeSection } from "./home-section";

// id "work" is the target of Skip intro (REQ-NAV-01).
export function WorkSection() {
  return (
    <HomeSection id="work" title={pages.work.title}>
      <p className="max-w-measure text-muted">{pages.work.intro}</p>
      <div className="mt-6">
        <StudyList headingLevel="h3" />
      </div>
    </HomeSection>
  );
}
