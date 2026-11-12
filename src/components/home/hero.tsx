import { ArrowIcon } from "@/components/site/arrow-icon";
import { CalmToggle } from "@/components/site/calm-toggle";
import { cx } from "@/components/site/class-names";
import { Container } from "@/components/site/container";
import { Label } from "@/components/site/label";
import { PillLink, pillClassName } from "@/components/site/pill";
import { SiteAnchor } from "@/components/site/site-anchor";
import { heroCopy, STATIC_TIER } from "@/content/hero";
import { site } from "@/content/site";

import { HeroHeadline } from "./hero-headline";
import { ScrollCue } from "./scroll-cue";
import { StoryScene } from "./story-scene";
import { TierReadout } from "./tier-readout";

// The hero fills the first screen below the bar, which keeps Skip intro in
// view from the first frame (REQ-NAV-01). The bar is 120 px (7.5rem) below
// 640 px, where it takes two rows, 68 px (4.25rem) from 640 px and 100 px
// (6.25rem) from 1024 px (site-header.tsx). svh is the height with the phone
// browser's bars showing. Phones under 40rem tall (a 375 by 667 phone with
// its bars showing is about 548 px) get tighter spacing and a smaller dot
// room: at 375 by 548 the hero then needs about 415 px of the 428 px below
// the bar, by the font metrics. At 320 px wide and short heights the content
// is taller than this minimum, so Skip intro can end below the fold there
// (D-063).
//
// Below the first screen the hero keeps some empty room, where the dot
// pulses alone before the field chapter: it puts the field chapter's start
// near its storyboard share of the scroll (app/page.tsx has the sums).
//
// The layout is one grid per breakpoint, so the links keep one order for
// the keyboard everywhere: See the work, Send a message, Skip intro, Calm.
// Below 640 px the blocks dissolve into one two-column grid (display:
// contents): the dot's place, the words, See the work across the width, the
// tier readout, then Send a message and Skip intro on one row. From 640 px
// the dot's place sits above the words and the foot carries Skip intro, the
// scroll cue and the Calm switch; from 1024 px the dot sits beside the
// sub-line and the actions at the inline end.
export function Hero() {
  const copy = heroCopy(STATIC_TIER);

  return (
    <section
      aria-label={site.names.intro}
      data-chapter="hero"
      className="pb-[46svh] lg:pb-[31svh]"
    >
      <Container
        width="full"
        className={cx(
          "grid min-h-[calc(100svh_-_7.5rem)] grid-cols-[minmax(0,1fr)_auto] grid-rows-[minmax(4rem,1fr)] gap-x-4 pt-2 pb-4 sm:min-h-[calc(100svh_-_4.25rem)] sm:grid-cols-1 sm:grid-rows-[1fr_auto] sm:gap-y-8 sm:pb-8 lg:min-h-[calc(100svh_-_6.25rem)]",
          "max-sm:[@media(max-height:40rem)]:grid-rows-[minmax(2.5rem,1fr)] max-sm:[@media(max-height:40rem)]:pt-1 max-sm:[@media(max-height:40rem)]:pb-2",
        )}
      >
        <div className="max-sm:contents sm:mx-auto sm:grid sm:w-full sm:max-w-[73rem] sm:grid-rows-[minmax(4rem,1fr)_auto_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:grid-rows-none lg:content-center lg:py-10">
          {/* The dot's place: the story measures this empty box, and the
              field draws the dot at its centre with its halo reaching its
              edges. Below 1024 px it is the room between the bar and the
              eyebrow, never over a word. */}
          <div
            aria-hidden="true"
            className="relative max-sm:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-3"
          >
            <div
              data-stage="dot"
              className="absolute inset-0 lg:m-auto lg:size-64"
            />
          </div>
          <div className="max-sm:contents lg:contents">
            <Label
              parts={[copy.eyebrow]}
              tone="violet"
              size="md"
              className={cx(
                "mt-2 max-sm:col-span-2 sm:mt-0 lg:col-span-2 lg:justify-self-start",
                "max-sm:[@media(max-height:40rem)]:mt-1",
              )}
            />
            {/* From 1024 px the eyebrow's and the headline's boxes are as
                wide as their words, not both columns: the plates behind
                text follow these boxes and merge, so a full width box would
                dim the dot beside them. */}
            <HeroHeadline
              id="hero-headline"
              className={cx(
                "mt-3 max-sm:col-span-2 sm:mt-6 lg:col-span-2 lg:justify-self-start",
                "max-sm:[@media(max-height:40rem)]:mt-2",
              )}
            />
            <p
              className={cx(
                "mt-4 max-w-[32.5rem] text-lead text-muted max-sm:col-span-2 sm:mt-7 lg:col-start-1",
                "max-sm:[@media(max-height:40rem)]:mt-2",
              )}
            >
              {copy.subLine}
            </p>
            <StoryScene chapter="hero" />
          </div>
          <div className="max-sm:contents sm:mt-10 sm:flex sm:flex-wrap sm:items-center sm:gap-3 lg:col-start-1">
            <PillLink
              href="/work"
              variant="primary"
              size="lg"
              className={cx(
                "mt-6 max-sm:col-span-2 sm:mt-0",
                "max-sm:[@media(max-height:40rem)]:mt-3 max-sm:[@media(max-height:40rem)]:min-h-11",
              )}
            >
              {copy.primaryAction}
            </PillLink>
            <TierReadout
              variant="hero"
              className={cx(
                "mt-2 max-sm:col-span-2 sm:hidden",
                "max-sm:[@media(max-height:40rem)]:mt-1",
              )}
            />
            {/* A text link with its arrow on phones, as the phone preview
                draws it; an outline pill from 640 px. */}
            <SiteAnchor
              href="/contact"
              className={cx(
                pillClassName({ variant: "outline", size: "lg" }),
                "mt-1 justify-self-start max-sm:min-h-11 max-sm:min-w-0 max-sm:border-0 max-sm:px-0 max-sm:py-0 sm:mt-0",
                "max-sm:[@media(max-height:40rem)]:mt-0",
              )}
            >
              {copy.secondaryAction}
              <ArrowIcon
                direction="forward"
                className="size-4 text-glow sm:hidden"
              />
            </SiteAnchor>
          </div>
        </div>
        <div className="max-sm:contents sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-end sm:gap-4">
          {/* id "work" is Skip intro's target (REQ-NAV-01). Its arrow comes
              before the words in the pill, after them on a phone's row. */}
          <SiteAnchor
            href="#work"
            className={cx(
              pillClassName({ variant: "quiet", size: "sm" }),
              "mt-1 justify-self-end max-sm:min-w-0 max-sm:border-0 max-sm:px-0 max-sm:py-0 max-sm:font-sans max-sm:text-[0.9375rem] max-sm:font-medium max-sm:tracking-normal sm:mt-0 sm:justify-self-start",
              "max-sm:[@media(max-height:40rem)]:mt-0",
            )}
          >
            <ArrowIcon direction="down" className="size-3.5 max-sm:hidden" />
            {copy.cornerControl}
            <ArrowIcon
              direction="down"
              className="size-4 text-glow sm:hidden"
            />
          </SiteAnchor>
          <ScrollCue label={copy.scrollCue} className="max-sm:hidden" />
          <CalmToggle
            variant="pill"
            className="justify-self-end max-sm:hidden"
          />
        </div>
      </Container>
    </section>
  );
}
