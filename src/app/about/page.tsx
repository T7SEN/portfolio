import type { Metadata } from "next";

import {
  ElsewhereList,
  MarkPanel,
  OfferCards,
  PageTitle,
  SkillGroups,
} from "@/components/pages";
import { Container, PillLink, TextLink } from "@/components/site";
import { about } from "@/content/about";
import { pages } from "@/content/pages";
import { services } from "@/content/services";

export const metadata: Metadata = {
  title: pages.about.title,
};

// The CV is on request only: it carries the real name, so no file or download
// link ever ships (REQ-CNT-08).
export default function AboutPage() {
  const { sections } = pages.about;

  return (
    <Container className="flex flex-col gap-16 py-12 sm:gap-18 sm:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-18">
        <div className="flex flex-col gap-5">
          <PageTitle label={pages.about.label} id="page-heading">
            {pages.about.heading}
          </PageTitle>
          {about.paragraphs.map((paragraph) => (
            <p key={paragraph} className="max-w-measure text-lead text-muted">
              {paragraph}
            </p>
          ))}
          <div className="mt-2 flex flex-wrap items-center gap-x-7 gap-y-3">
            <PillLink
              href={pages.about.action.href}
              variant="primary"
              size="lg"
            >
              {pages.about.action.label}
            </PillLink>
            <TextLink
              href={about.cv.ask.href}
              className="inline-flex min-h-11 items-center font-medium"
            >
              {about.cv.ask.label}
            </TextLink>
          </div>
        </div>
        {/* After the words in the source, so phones reach the heading first;
            from 1024 px it takes the start column, as the artboard has it. */}
        <MarkPanel className="h-56 sm:h-72 lg:order-first lg:h-[32.5rem]" />
      </div>

      <section aria-labelledby="offers-heading" className="flex flex-col gap-6">
        <h2 id="offers-heading" className="text-heading">
          {sections.offers}
        </h2>
        <OfferCards offers={services.offers} label={pages.about.offerLabel} />
        <p className="text-base text-muted">{services.also}</p>
      </section>

      <div className="grid gap-16 lg:grid-cols-2 lg:gap-18">
        <section
          aria-labelledby="skills-heading"
          className="flex flex-col gap-5"
        >
          <h2 id="skills-heading" className="text-heading">
            {sections.skills}
          </h2>
          <SkillGroups groups={about.skills} />
        </section>
        <section
          aria-labelledby="elsewhere-heading"
          className="flex flex-col gap-3"
        >
          <h2 id="elsewhere-heading" className="text-heading">
            {sections.elsewhere}
          </h2>
          <ElsewhereList links={about.elsewhere} cv={about.cv} />
        </section>
      </div>
      {/* TODO(REQ-SND-03): the waveform panel arrives here with Sound at P5;
          its caption speaks of sound, so it waits for sound to exist. */}
    </Container>
  );
}
