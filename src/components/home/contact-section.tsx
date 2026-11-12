import { Container } from "@/components/site/container";
import { DashedBox } from "@/components/site/dashed-box";
import { Panel } from "@/components/site/panel";
import { PillLink } from "@/components/site/pill";
import { pages } from "@/content/pages";
import { story } from "@/content/story";

import { ChapterHeading } from "./chapter-heading";
import { HomeSection } from "./home-section";
import { ServicesSection } from "./services-section";
import { StoryScene } from "./story-scene";

// The last chapter is as tall as its words, with no room above them. The
// services sit at the start; at the end, the framed panel the field's rings
// centre on (data-stage="contact"), measured where the panel comes to rest
// at the page's end, so the rings draw behind it. The form fills that panel
// at P6; until then it leads to /contact, and a dashed box holds the form's
// place, with no fields that do nothing.
export function ContactSection() {
  const { contact } = pages.home;

  return (
    <HomeSection id="contact" chapter="contact">
      <Container className="py-20 lg:py-32">
        <ChapterHeading
          id="contact-heading"
          label={story.labels.contact}
          title={contact.title}
        />
        <StoryScene chapter="contact" />
        <div className="mt-10 grid items-start gap-12 lg:mt-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <ServicesSection />
          <div data-stage="contact">
            <Panel>
              <p className="max-w-measure text-lead">{contact.panel.text}</p>
              <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
                <DashedBox>{pages.contact.form}</DashedBox>
                <PillLink
                  href={contact.panel.action.href}
                  variant="primary"
                  size="lg"
                >
                  {contact.panel.action.label}
                </PillLink>
              </div>
            </Panel>
          </div>
        </div>
      </Container>
    </HomeSection>
  );
}
