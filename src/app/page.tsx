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
// The storyboard starts the chapters at 0, 10, 30, 55, 75 and 90 per cent of
// the scroll, where a section's top reaches the middle of the viewport, and
// the gate allows 5 points either way. The work chapter's length is its
// content, estimated from the font metrics at about 2,600 px at 1280 by 800
// and 3,100 px at 375 by 812, near 30 per cent of the scroll, so the other
// rooms are sized round it (phone value in brackets): the hero's empty room
// after its first screen 31svh (46svh), the field 220svh (260svh), the
// making-of 180svh (210svh), the about 160svh (190svh) and the contact 135svh
// (130svh). Estimated starts: 7.4, 27.6, 57.4, 74.0 and 88.6 per cent at 1280
// by 800, 7.5, 27.7, 57.6, 73.9 and 88.7 at 375 by 812. If a measured start
// drifts, those rooms and the gaps between the work rows are the levers.
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
