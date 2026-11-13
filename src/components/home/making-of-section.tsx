import { Container } from "@/components/site/container";
import { Panel } from "@/components/site/panel";
import { TextLink } from "@/components/site/text-link";
import { pages } from "@/content/pages";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { PassTiers } from "./pass-tiers";
import { PassViewer } from "./pass-viewer";
import { StoryScene } from "./story-scene";

// The words, then the pass viewer across the whole width: a card for each
// pass of the field's frame with its breakdown, which slides sideways
// through a held screen as the page scrolls (pass-viewer.tsx), then the
// link to the full study and what a frame costs on each tier (REQ-ENG-09).
// The chapter is as tall as these and its padding, with the viewer's held
// stretch the one room of its own.
export function MakingOfSection() {
  const { makingOf } = pages.home;

  return (
    <HomeSection id="making-of" chapter="making-of">
      <Container className="pt-20 lg:pt-32">
        <ChapterHeading
          id="making-of-heading"
          label={story.labels["making-of"]}
          title={makingOf.title}
        />
        <StoryScene chapter="making-of" />
        <p
          data-story-intro=""
          className="mt-4 max-w-[35rem] leading-[1.55] text-muted"
        >
          {makingOf.intro}
        </p>
      </Container>
      <PassViewer />
      <Container className="pt-10 pb-20 lg:pt-14 lg:pb-32">
        <Panel className="flex flex-wrap items-center gap-x-10 gap-y-4">
          <p className="min-w-0 flex-[3_1_20rem]">
            <TextLink
              href={makingOf.link.href}
              className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
            >
              {makingOf.link.label}
            </TextLink>
          </p>
          <PassTiers />
        </Panel>
      </Container>
    </HomeSection>
  );
}
