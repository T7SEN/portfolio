import { copyright, site } from "@/content/site";

import { CalmToggle } from "./calm-toggle";
import { cx, RULE } from "./class-names";
import { Container } from "./container";
import { TextLink } from "./text-link";
import { Wordmark } from "./wordmark";

const FOOTER_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/work/making-of", label: "Making-of" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/v1", label: "v1 archive" },
  site.github,
] as const;

type SiteFooterProps = {
  /** The copyright year. Every page is static, so by default it is the year of the build. */
  year?: number;
};

// P5 adds "Press Ctrl K for everything" and the Sound pill, P6 the Privacy
// link; until then nothing points at a control that does not exist yet.
export function SiteFooter({
  year = new Date().getFullYear(),
}: SiteFooterProps) {
  return (
    <footer className={cx("mt-16 border-t", RULE)}>
      <Container className="pt-14 pb-12">
        <div className="mb-10 flex flex-wrap items-start justify-between gap-x-8 gap-y-6">
          <div>
            <Wordmark as="p" className="mb-2.5 text-text" />
            <p className="text-sm text-muted">{site.tagline}</p>
          </div>
          <nav aria-label={site.names.footer}>
            <ul className="flex flex-wrap gap-x-7 text-sm">
              {FOOTER_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <TextLink href={href} variant="footer">
                    {label}
                  </TextLink>
                </li>
              ))}
            </ul>
          </nav>
          <CalmToggle variant="words" />
        </div>
        <div
          className={cx(
            "flex flex-wrap justify-between gap-4 border-t pt-6 font-mono text-xs text-muted",
            RULE,
          )}
        >
          <p>{copyright(year)}</p>
        </div>
      </Container>
    </footer>
  );
}
