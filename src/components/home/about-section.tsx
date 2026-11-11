import { TextLink } from "@/components/site";
import { about } from "@/content/about";
import { pages } from "@/content/pages";

import { HomeSection } from "./home-section";

// Room for the waveform the field becomes in this chapter, enough to start
// the contact chapter near its storyboard share of the scroll (REQ-SCR-01).
export function AboutSection() {
  return (
    <HomeSection
      id="about"
      title={pages.about.title}
      chapter="about"
      className="min-h-[140svh]"
    >
      <p className="max-w-measure text-lead" data-story-intro="">
        {pages.about.intro}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {about.thread.map((point) => (
          <li
            key={point}
            className="rounded-md bg-raised px-3 py-1 font-mono text-sm"
          >
            {point}
          </li>
        ))}
      </ul>
      <p className="mt-6">
        <TextLink href="/about" className="inline-flex min-h-11 items-center">
          More about T7SEN
        </TextLink>
      </p>
    </HomeSection>
  );
}
