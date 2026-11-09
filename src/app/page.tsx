import type { Metadata } from "next";

import {
  AboutSection,
  ContactSection,
  Hero,
  ServicesSection,
  WorkSection,
} from "@/components/home";
import { pages } from "@/content/pages";

// The layout's title template does not apply to a page in its own segment,
// so the home title is set in full here.
export const metadata: Metadata = {
  title: { absolute: pages.home.title },
};

// Static HTML: the hero, the services (REQ-CNT-11), then work, about and
// contact in the story's chapter order. The scroll story and the field arrive
// later and never hold back this text (REQ-CNT-01).
export default function HomePage() {
  return (
    <>
      <Hero />
      <ServicesSection />
      <WorkSection />
      <AboutSection />
      <ContactSection />
    </>
  );
}
