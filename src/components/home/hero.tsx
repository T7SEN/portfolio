import { Container, TextLink } from "@/components/site";
import { heroCopy, STATIC_TIER } from "@/content/hero";

import { ActionLink } from "./action-link";
import { HeroHeadline } from "./hero-headline";
import { StoryScene } from "./story-scene";

// The hero fills the first screen below the bar, which keeps Skip intro in
// view from the first frame (REQ-NAV-01). The bar is py-3 around one 44 px
// row, so 4.25rem. Below 22rem (352 px) its links and the Calm toggle no
// longer fit on one row and it wraps to two, so 7rem. svh is the height with
// the phone browser's bars showing. Short screens (a 375 by 667 phone with
// its bars is about 548 px tall) get tighter spacing so Skip intro stays
// above the fold. Below 22rem and under about 559 px tall the content is
// taller than this minimum, so Skip intro still ends below the fold (D-063).
// The empty band between the actions and Skip intro is where the field's
// dot sits (story-stage.ts), clear of every word.
export function Hero() {
  const copy = heroCopy(STATIC_TIER);

  return (
    <section aria-labelledby="hero-headline" data-chapter="hero">
      <Container className="flex min-h-[calc(100svh_-_4.25rem)] flex-col pb-4 max-[22rem]:min-h-[calc(100svh_-_7rem)]">
        <div className="flex flex-1 flex-col justify-center gap-6 py-10 [@media(max-height:40rem)]:gap-4 [@media(max-height:40rem)]:py-4">
          <p className="font-mono text-label text-muted">{copy.eyebrow}</p>
          <HeroHeadline id="hero-headline" text={copy.headline} />
          <StoryScene chapter="hero" />
          <p className="max-w-measure text-lead text-muted">{copy.subLine}</p>
          <div className="flex flex-wrap gap-3 pt-2" data-stage="dot-above">
            <ActionLink href="/work">{copy.primaryAction}</ActionLink>
            <ActionLink href="/contact" variant="secondary">
              {copy.secondaryAction}
            </ActionLink>
          </div>
        </div>
        <TextLink
          href="#work"
          className="inline-flex min-h-11 items-center self-start font-mono text-sm"
          data-stage="dot-below"
        >
          {copy.cornerControl}
        </TextLink>
      </Container>
    </section>
  );
}
