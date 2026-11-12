import Link from "next/link";

import { site } from "@/content/site";

import { CalmToggle } from "./calm-toggle";
import { cx, LINK_HOVER } from "./class-names";
import { Container } from "./container";
import { Logo } from "./logo";
import { PillLink } from "./pill";
import { Wordmark } from "./wordmark";

const NAV_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

// Every control is one 44 px row, so the bar's height is set by its padding
// and its rows alone, and hero.tsx can allow for it exactly:
//   below 640 px: two rows (the mark and wordmark, then the controls), 120 px;
//   640 to 1023 px: one row, 68 px;
//   1024 px and up: one row, 100 px (the preview's 28 px padding).
// Below 640 px the controls' row needs about 275 px, so it stays one line
// from 307 px wide; anything wider (larger text, more spacing) wraps instead
// of scrolling sideways (WCAG 1.4.10). From 640 px the whole bar needs about
// 555 px against 592 px of room. A control added here changes these sums.
export function SiteHeader() {
  return (
    <header>
      <Container
        width="full"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 lg:py-7"
      >
        <Link
          href="/"
          aria-label={site.names.logoLink}
          className={cx(
            "inline-flex min-h-11 shrink-0 items-center gap-2.5 text-text sm:gap-3",
            LINK_HOVER,
          )}
        >
          <Logo variant="light" className="h-5 w-auto sm:h-6" />
          <Wordmark size="bar" />
        </Link>
        {/* P5 brings Sound, Ctrl K and Menu here; until then the links and
            Calm, so no control is shown before it works. */}
        <nav
          aria-label={site.names.siteControls}
          className="flex basis-full flex-wrap items-center justify-end gap-1 sm:basis-auto sm:gap-2.5"
        >
          <ul className="flex flex-wrap items-center justify-end gap-1 sm:gap-2.5">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href} className="flex">
                <PillLink href={href} variant="quiet" size="bar">
                  {label}
                </PillLink>
              </li>
            ))}
          </ul>
          <CalmToggle variant="header" />
        </nav>
      </Container>
    </header>
  );
}
