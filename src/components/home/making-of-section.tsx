import { Container } from "@/components/site/container";
import { TextLink } from "@/components/site/text-link";
import { pages } from "@/content/pages";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { StoryScene } from "./story-scene";

// The words sit at the top, as the preview has them; P4 puts the pass viewer
// under them. Until then the room below is the field alone, flattened into
// its sheet, and it keeps the chapters after the work near their storyboard
// starts (app/page.tsx has the sums).
export function MakingOfSection() {
  const { makingOf } = pages.home;

  return (
    <HomeSection
      id="making-of"
      chapter="making-of"
      className="min-h-[210svh] lg:min-h-[180svh]"
    >
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
        <p className="mt-5">
          <TextLink
            href={makingOf.link.href}
            className="inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
          >
            {makingOf.link.label}
          </TextLink>
        </p>
      </Container>
    </HomeSection>
  );
}
