import { heroCopy, STATIC_TIER } from "@/content/hero";
import { pages } from "@/content/pages";

import { ActionLink } from "./action-link";
import { HomeSection } from "./home-section";

// The last chapter takes about the last tenth of the scroll (REQ-SCR-01), so
// its top passes the middle of the viewport well before the page ends. The
// words sit at the bottom of the room, so the last screen still shows them
// above the footer.
export function ContactSection() {
  return (
    <HomeSection
      id="contact"
      title="Contact"
      chapter="contact"
      className="flex min-h-[120svh] flex-col justify-end"
    >
      <p className="max-w-measure text-lead" data-story-intro="">
        {pages.contact.intro}
      </p>
      <div className="mt-6">
        <ActionLink href="/contact" variant="secondary">
          {heroCopy(STATIC_TIER).secondaryAction}
        </ActionLink>
      </div>
    </HomeSection>
  );
}
