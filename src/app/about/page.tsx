import type { Metadata } from "next";

import { Container, TextLink } from "@/components/site";
import { about } from "@/content/about";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.about.title,
};

// The CV is on request only: it carries the real name, so no file or download
// link ever ships (REQ-CNT-08).
export default function AboutPage() {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-title">{pages.about.title}</h1>
      <p className="mt-4 max-w-measure text-lead text-muted">
        {pages.about.intro}
      </p>

      <div className="mt-12 flex flex-col gap-12">
        <section aria-labelledby="streaming">
          <h2 id="streaming" className="text-heading">
            Streaming
          </h2>
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
          <p className="mt-4 max-w-measure">{about.threadText}</p>
        </section>

        <section aria-labelledby="skills">
          <h2 id="skills" className="text-heading">
            Skills
          </h2>
          <p className="mt-4 max-w-measure">{about.skills}</p>
        </section>

        <section aria-labelledby="cv">
          <h2 id="cv" className="text-heading">
            CV
          </h2>
          <p className="mt-4 max-w-measure">{about.cv.text}</p>
          <p className="mt-1">
            <TextLink
              href={about.cv.link.href}
              className="inline-flex min-h-11 items-center"
            >
              {about.cv.link.label}
            </TextLink>
          </p>
        </section>
      </div>
    </Container>
  );
}
