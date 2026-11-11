import { StudyList } from "@/components/study";
import { pages } from "@/content/pages";

import { HomeSection } from "./home-section";

// id "work" is the target of Skip intro (REQ-NAV-01). The field forms one
// shape per card in view (REQ-SCR-01), so each card gets some scroll room
// below it, and on wide screens the cards keep to the inline start column,
// which leaves the other half of the frame to the shape beside them.
export function WorkSection() {
  return (
    <HomeSection id="work" title={pages.work.title} chapter="work">
      <p className="max-w-measure text-muted">{pages.work.intro}</p>
      <div className="mt-6 lg:max-w-xl">
        <StudyList headingLevel="h3" itemClassName="pb-[20svh]" />
      </div>
    </HomeSection>
  );
}
