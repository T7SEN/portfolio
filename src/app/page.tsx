import type { Metadata } from "next";

import {
  AboutSection,
  BloomSection,
  ContactSection,
  Hero,
  MakingOfSection,
  WorkSection,
} from "@/components/home";
import { StoryDriver } from "@/components/story";
import { pages } from "@/content/pages";

// The layout's title template does not apply to a page in its own segment,
// so the home title is set in full here.
export const metadata: Metadata = {
  title: { absolute: pages.home.title },
};

// Static HTML: the six chapters of the scroll story in order (REQ-SCR-01),
// the services inside the contact chapter (REQ-CNT-11). The story driver and
// the field arrive later and never hold back this text (REQ-CNT-01).
//
// Each chapter is as tall as its content and its own padding, so no screen
// of the page goes by without words: the hero is the first screen below the
// bar; work, making-of, about and contact are their words, rows and panels,
// with the room above the about heading where the field draws its strands
// as part of that content. Only the field chapter holds a stretch: one
// screen stays put (position sticky) with its label, tier readout and note
// while the T7 mark and then the T7SEN wordmark form behind it. Its room is
// the field's own timeline in screens of scroll (BLOOM_ROOM in
// src/engine/runtime/story.ts, 2 screens: 0.15 to gather the mark, 0.75
// holding it, 0.15 to morph, 0.8 holding the wordmark, 0.12 to let it go
// and 0.03 to spare, so each shape settles and can be read at a steady
// scroll), so the section's 200svh changes with it.
export default function HomePage() {
  return (
    <>
      <Hero />
      <BloomSection />
      <WorkSection />
      <MakingOfSection />
      <AboutSection />
      <ContactSection />
      <StoryDriver />
    </>
  );
}
