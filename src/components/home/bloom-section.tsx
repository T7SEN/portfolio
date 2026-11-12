import { Container } from "@/components/site/container";
import { site } from "@/content/site";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { FieldNote } from "./field-note";
import { FieldStill } from "./field-still";
import { HeldPlate } from "./held-plate";
import { HomeSection } from "./home-section";
import { PointerRing } from "./pointer-ring";
import { StoryScene } from "./story-scene";
import { TierReadout } from "./tier-readout";

// The field chapter (its id stays "bloom"): the field is the content, from
// the dot's bloom through the T7SEN mark and the wordmark to the flow lines.
// One screen holds on screen through the whole chapter (position sticky), as
// the preview shows the label, the tier and the note with the wordmark: the
// label at the top start, the tier at the top end and the note at the bottom
// start, clear of the formation in the middle. Each brings its own plate,
// since the veil's plates scroll with the page (held-plate.tsx). The
// chapter is the one with a held stretch: its room is the field's timeline,
// BLOOM_ROOM screens in src/engine/runtime/story.ts (200svh for 2), in
// which the mark gathers as the chapter arrives, holds whole while this
// screen fills the view, and turns into the wordmark, which holds on as the
// work chapter comes up under it. The two change
// together; a test holds them equal. On tier 3 the screen shows the
// wordmark's still.
export function BloomSection() {
  return (
    <HomeSection
      id="bloom"
      chapter="bloom"
      name={site.names.field}
      className="relative min-h-[200svh]"
    >
      <div data-part="field-screen" className="sticky top-0 isolate h-svh">
        <FieldStill />
        <Container
          width="full"
          className="flex h-full flex-col justify-between gap-8 py-8 lg:py-10"
        >
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <HeldPlate>
              <ChapterHeading id="bloom-heading" label={story.labels.bloom} />
            </HeldPlate>
            <HeldPlate>
              <TierReadout variant="field" />
            </HeldPlate>
          </div>
          <StoryScene chapter="bloom" />
          {/* As wide as its words, so the plate behind it stays at the start
              and the field's lines run on beside it. */}
          <HeldPlate className="self-start">
            <FieldNote />
          </HeldPlate>
        </Container>
      </div>
      <PointerRing />
    </HomeSection>
  );
}
