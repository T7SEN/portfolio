import { BoxedLink } from "@/components/site/boxed-link";
import { Container } from "@/components/site/container";
import { TextLink } from "@/components/site/text-link";
import { DotJoined } from "@/components/study/dot-joined";
import { ShortCard } from "@/components/study/short-card";
import { StudyRow } from "@/components/study/study-row";
import { fullStudies, shortStudies } from "@/content";
import { pages } from "@/content/pages";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { StoryScene } from "./story-scene";

// id "work" is the target of Skip intro (REQ-NAV-01). Each full study is a
// row with a frame the field forms its shape in, and each row is a step of
// the work chapter in study order (data-work-step), so the shape on screen
// belongs to the row at the middle of the viewport (REQ-SCR-01). The short
// studies have no shape, so they are cards after the rows, not steps. The
// chapter's length is its content: the other chapters are sized round it
// (app/page.tsx).
export function WorkSection() {
  const { work } = pages.home;

  return (
    <HomeSection id="work" chapter="work">
      <Container className="py-20 lg:py-32">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <ChapterHeading
              id="work-heading"
              label={story.labels.work}
              title={work.title}
            />
            <StoryScene chapter="work" />
            <p
              data-story-intro=""
              className="mt-4 max-w-[32.5rem] leading-[1.55] text-muted"
            >
              {work.intro}
            </p>
          </div>
          <BoxedLink
            href={work.index.href}
            note={<DotJoined parts={work.index.note} />}
          >
            {work.index.label}
          </BoxedLink>
        </div>
        <ol className="mt-12 flex flex-col gap-16 lg:mt-20 lg:gap-28">
          {fullStudies.map((study, index) => (
            <li key={study.slug} data-work-step={index}>
              <StudyRow study={study} readLabel={work.readFull} />
            </li>
          ))}
        </ol>
        <ul className="mt-16 grid gap-3 sm:grid-cols-2 sm:gap-6 lg:mt-28">
          {shortStudies.map((study) => (
            <li key={study.slug}>
              <ShortCard study={study} readLabel={work.readShort} />
            </li>
          ))}
        </ul>
        <p className="mt-8 text-[0.9375rem] text-muted">
          {work.archive.lead}{" "}
          <TextLink href={work.archive.link.href}>
            {work.archive.link.label}
          </TextLink>
        </p>
      </Container>
    </HomeSection>
  );
}
