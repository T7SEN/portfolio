import { TextLink } from "@/components/site";
import { about } from "@/content/about";
import { pages } from "@/content/pages";

import { HomeSection } from "./home-section";

export function AboutSection() {
  return (
    <HomeSection id="about" title={pages.about.title}>
      <p className="max-w-measure text-lead">{pages.about.intro}</p>
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
