import type { Metadata } from "next";

import {
  AboutSection,
  BloomSection,
  ContactSection,
  Hero,
  MakingOfSection,
  ServicesSection,
  WorkSection,
} from "@/components/home";
import { StoryDriver } from "@/components/story";
import { pages } from "@/content/pages";

// The layout's title template does not apply to a page in its own segment,
// so the home title is set in full here.
export const metadata: Metadata = {
  title: { absolute: pages.home.title },
};

// Static HTML: the six chapters of the scroll story in order, with the
// services block (REQ-CNT-11) between the hero and the bloom as a plain
// section, not a chapter (REQ-SCR-01). The story driver and the field arrive
// later and never hold back this text (REQ-CNT-01).
export default function HomePage() {
  return (
    <>
      <Hero />
      <ServicesSection />
      <BloomSection />
      <WorkSection />
      <MakingOfSection />
      <AboutSection />
      <ContactSection />
      <StoryDriver />
    </>
  );
}
