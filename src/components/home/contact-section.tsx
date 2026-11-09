import { heroCopy, STATIC_TIER } from "@/content/hero";
import { pages } from "@/content/pages";

import { ActionLink } from "./action-link";
import { HomeSection } from "./home-section";

export function ContactSection() {
  return (
    <HomeSection id="contact" title="Contact">
      <p className="max-w-measure text-lead">{pages.contact.intro}</p>
      <div className="mt-6">
        <ActionLink href="/contact" variant="secondary">
          {heroCopy(STATIC_TIER).secondaryAction}
        </ActionLink>
      </div>
    </HomeSection>
  );
}
