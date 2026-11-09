import { Container, TextLink } from "@/components/site";
import { heroCopy, STATIC_TIER } from "@/content/hero";

import { ActionLink } from "./action-link";
import { HeroHeadline } from "./hero-headline";

// The hero fills the first screen below the bar (py-3 around the 44 px home
// link, so 4.25rem), which keeps Skip intro in view from the first frame
// (REQ-NAV-01). svh is the height with the phone browser's bars showing.
// Short screens (a 375 by 667 phone with its bars is about 548 px tall) get
// tighter spacing so Skip intro stays above the fold.
export function Hero() {
  const copy = heroCopy(STATIC_TIER);

  return (
    <section aria-labelledby="hero-headline">
      <Container className="flex min-h-[calc(100svh_-_4.25rem)] flex-col pb-4">
        <div className="flex flex-1 flex-col justify-center gap-6 py-10 [@media(max-height:40rem)]:gap-4 [@media(max-height:40rem)]:py-4">
          <p className="font-mono text-label text-muted">{copy.eyebrow}</p>
          <HeroHeadline id="hero-headline" text={copy.headline} />
          <p className="max-w-measure text-lead text-muted">{copy.subLine}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <ActionLink href="/work">{copy.primaryAction}</ActionLink>
            <ActionLink href="/contact" variant="secondary">
              {copy.secondaryAction}
            </ActionLink>
          </div>
        </div>
        <TextLink
          href="#work"
          className="inline-flex min-h-11 items-center self-start font-mono text-sm"
        >
          {copy.cornerControl}
        </TextLink>
      </Container>
    </section>
  );
}
