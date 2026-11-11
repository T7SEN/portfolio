import { Container } from "@/components/site";
import { story } from "@/content/story";

import { BloomLine } from "./bloom-line";
import { ChapterHeading } from "./chapter-heading";
import { StoryScene } from "./story-scene";

// A scene chapter: the field is the content. About one and three quarter
// screens of scroll give the dot, the bloom and the T7SEN mark a third each
// (REQ-SCR-07); the section heights of the home page put each chapter near
// the share of the scroll the storyboard gives it (REQ-SCR-01). The words sit
// at the bottom start, clear of the mark that forms in the middle of the
// frame.
export function BloomSection() {
  const { label, lines } = story.bloom;

  return (
    <section id="bloom" aria-labelledby="bloom-heading" data-chapter="bloom">
      <Container className="flex min-h-[175svh] flex-col justify-end py-16 sm:py-20">
        <ChapterHeading id="bloom-heading" label={label} />
        <StoryScene chapter="bloom" />
        <BloomLine lines={lines} />
      </Container>
    </section>
  );
}
