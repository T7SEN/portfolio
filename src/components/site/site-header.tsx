"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { MenuButton } from "@/components/interface/menu-button";
import { PaletteButton } from "@/components/interface/palette-button";
import { SoundToggle } from "@/components/sound/sound-toggle";
import { site } from "@/content/site";
import { requestEggAloud } from "@/components/interface/egg-refusal";
import { bindLongPress } from "@/lib/eggs";

import { cx, LINK_HOVER } from "./class-names";
import { Container } from "./container";
import { Logo } from "./logo";
import { Wordmark } from "./wordmark";

type HomeLinkProps = {
  /** The long press that plays the logo egg; off in the menu, which covers the field. */
  egg?: boolean;
  className?: string;
};

/**
 * The bar's home link: the mark and the wordmark. A long press plays the
 * logo egg, the field re-forming into the T7 mark (REQ-NAV-05), and the click
 * after it is swallowed; a normal click still goes home.
 */
export function HomeLink({ egg = true, className }: HomeLinkProps) {
  const pathname = usePathname();
  const link = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const element = link.current;
    if (!egg || element === null) return;
    return bindLongPress(element, () => {
      requestEggAloud("mark");
    });
  }, [egg]);

  return (
    <Link
      ref={link}
      href="/"
      aria-label={site.names.logoLink}
      aria-current={pathname === "/" ? "page" : undefined}
      // iOS opens a link's preview on a long press; the callout off keeps
      // the press for the logo egg.
      className={cx(
        "inline-flex min-h-11 shrink-0 items-center gap-1.5 text-text [-webkit-touch-callout:none] sm:gap-3",
        LINK_HOVER,
        className,
      )}
    >
      <Logo variant="light" className="h-5 w-auto sm:h-6" />
      <Wordmark size="bar" />
    </Link>
  );
}

// Every control is one 44 px row on every width, so the bar's height is set
// by its padding alone and hero.tsx allows for it exactly: 68 px below
// 1024 px, 100 px from 1024 px (the preview's 28 px padding). Below 640 px
// the sound and palette controls are 44 px squares and Menu keeps its word:
// 277 px with the logo (measured at 320 px on 14 Nov 2026, 11 px to spare
// of the 288 px between the gutters), so the row holds there; anything wider
// (larger text, more spacing) wraps instead of scrolling sideways (WCAG
// 1.4.10). Not sticky. With scripts off, sound and the palette are hidden,
// since neither can work, and Menu becomes a link to the footer's links.
// The sound toggle's one-time hint is laid over the page under its pill, so
// it never changes these heights.
export function SiteHeader() {
  return (
    <header>
      <Container
        width="full"
        className="flex flex-wrap items-center justify-between gap-x-1 gap-y-2 py-3 sm:gap-x-4 lg:py-7"
      >
        <HomeLink />
        <nav aria-label={site.names.siteControls}>
          <ul className="flex flex-wrap items-center justify-end gap-1 sm:gap-2.5">
            <li className="relative flex noscript:hidden">
              <SoundToggle variant="bar" />
            </li>
            <li className="flex noscript:hidden">
              <PaletteButton />
            </li>
            <li className="flex">
              <MenuButton />
            </li>
          </ul>
        </nav>
      </Container>
    </header>
  );
}
