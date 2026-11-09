import Link from "next/link";

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
        <nav aria-label="Primary">
          <ul className="-me-3 flex items-center">
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
      </Container>
    </header>
  );
}
