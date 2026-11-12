import { Container } from "@/components/site/container";
import { TextLink } from "@/components/site/text-link";
import { pages } from "@/content/pages";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { PassTiers } from "./pass-tiers";
import { PassViewer } from "./pass-viewer";
import { StoryScene } from "./story-scene";

// The words, then the pass viewer: a card for each pass of the field's
// frame, and under them the chosen pass's breakdown with the link to the
// full study and the tier table (REQ-ENG-09). The chapter is as tall as
// these and its padding; the field's sheet sits behind them.
export function MakingOfSection() {
  const { makingOf } = pages.home;

  return (
    <HomeSection id="making-of" chapter="making-of">
      <Container className="py-20 lg:py-32">
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
        <PassViewer
          link={
            <TextLink
              href={makingOf.link.href}
              className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
            >
              {makingOf.link.label}
            </TextLink>
          }
          tiers={<PassTiers />}
        />
      </Container>
    </HomeSection>
  );
}
