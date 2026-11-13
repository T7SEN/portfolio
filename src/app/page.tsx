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
// as part of that content. Two stretches are held. In the field chapter one
// screen stays put (position sticky) with its label, tier readout and note
// while the T7 mark and then the T7SEN wordmark form behind it. Its room,
// 260svh on phones and 220svh from lg (BLOOM_ROOMS in
// src/engine/runtime/story.ts), gives the field's timeline the pace it had
// before P4, so the mark forms well after the chapter arrives (D-118). In
// the making-of the pass cards slide sideways through a held screen of
// their own once the page's script runs, on a screen with room for a card
// and with calm off (home/pass-viewer.tsx, D-119); otherwise they lie still
// in a grid, as tall as its content.
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
