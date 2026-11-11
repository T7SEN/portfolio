import { Container, TextLink } from "@/components/site";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { StoryScene } from "./story-scene";

// A scene chapter: almost two screens of scroll while the field lies flat as
// a sheet facing the camera, which keeps the chapters after the work near
// their storyboard shares of the scroll (REQ-SCR-01). The words sit at the
// bottom start of the section.
export function MakingOfSection() {
  const { label, line, link } = story.makingOf;

  return (
    <section
      id="making-of"
      aria-labelledby="making-of-heading"
      data-chapter="making-of"
    >
      <Container className="flex min-h-[185svh] flex-col justify-end py-16 sm:py-20">
        <ChapterHeading id="making-of-heading" label={label} />
        <StoryScene chapter="making-of" />
        <p className="mt-3 max-w-measure text-lead">{line}</p>
        <p className="mt-4">
          <TextLink
            href={link.href}
            className="inline-flex min-h-11 items-center"
          >
            {link.label}
          </TextLink>
        </p>
      </Container>
    </section>
  );
}
