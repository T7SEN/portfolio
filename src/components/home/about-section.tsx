import { cx, HAIRLINE_STRONG } from "@/components/site/class-names";
import { Container } from "@/components/site/container";
import { Label } from "@/components/site/label";
import { PillLink } from "@/components/site/pill";
import { DotJoined } from "@/components/study/dot-joined";
import { about } from "@/content/about";
import { isMarker } from "@/content/markers";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { StoryScene } from "./story-scene";

// The field draws its three thin strands across the upper part of the
// screen in this chapter, so the words start about half a screen down and
// sit under them when the chapter fills the view. After the words the
// chapter ends with its padding, as tall as its content.
export function AboutSection() {
  return (
    <HomeSection id="about" chapter="about">
      <Container className="grid gap-12 pt-[45svh] pb-20 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-16 lg:pb-32">
        <div>
          <ChapterHeading
            id="about-heading"
            label={story.labels.about}
            title={about.heading}
          />
          <StoryScene chapter="about" />
          <div
            data-story-intro=""
            className="mt-6 flex max-w-[37.5rem] flex-col gap-4.5 text-lg leading-[1.65] text-muted"
          >
            {about.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <ul className="mt-7 flex flex-wrap gap-3">
            {about.links.map((link) => (
              <li key={link.label}>
                {isMarker(link.href) ? (
                  // An address not supplied yet: a dashed pill, the shape of
                  // what is still to come, holding the label and its marker
                  // as text, never a link to nowhere (REQ-CNT-05).
                  <span
                    className={cx(
                      "inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed px-4 text-sm text-muted",
                      HAIRLINE_STRONG,
                    )}
                  >
                    <span className="text-text">{link.label}</span> {link.href}
                  </span>
                ) : (
                  <PillLink href={link.href} arrow="auto">
                    {link.label}
                  </PillLink>
                )}
              </li>
            ))}
            <li>
              <PillLink href={about.cv.ask.href} arrow="auto">
                {about.cv.ask.label}
              </PillLink>
            </li>
          </ul>
        </div>
        <dl className="flex flex-col gap-6 lg:mt-10">
          {about.skills.map((group) => (
            <div key={group.label}>
              <Label as="dt" size="xs" parts={[group.label]} />
              <dd className="mt-2 text-text">
                <DotJoined parts={group.items} />
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </HomeSection>
  );
}
