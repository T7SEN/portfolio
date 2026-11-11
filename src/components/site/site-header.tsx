import Link from "next/link";

import { CalmToggle } from "./calm-toggle";
import { Container } from "./container";
import { Logo } from "./logo";

const NAV_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  return (
    <header>
      <Container className="flex items-center justify-between gap-4 py-3">
        <Link
          href="/"
          aria-label="T7SEN, home"
          className="-ms-2 inline-flex size-11 shrink-0 items-center justify-center text-text transition-colors hover:text-glow focus-visible:text-glow"
        >
          <Logo variant="light" className="h-7 w-auto" />
        </Link>
        {/* Wraps only where the bar cannot hold every control on one line,
            so a 320 px screen never scrolls sideways (WCAG 1.4.10). Today
            that is below 22rem, which hero.tsx allows for in the hero's
            height; a control added here moves that width. */}
        <div className="-me-3 flex flex-wrap items-center justify-end">
          <nav aria-label="Primary">
            <ul className="flex items-center">
              {NAV_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center px-3 font-mono text-sm text-text transition-colors hover:text-glow focus-visible:text-glow"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <CalmToggle />
        </div>
      </Container>
    </header>
  );
}
