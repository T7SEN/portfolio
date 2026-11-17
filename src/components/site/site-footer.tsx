import { PaletteInvite } from "@/components/interface/palette-button";
import { SoundToggle } from "@/components/sound/sound-toggle";
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

// As the preview's footer: the links in the middle, the Sound and Calm pills
// at the end, and the copyright row with the way into the palette in its
// middle. P6 adds the Privacy link at the row's end. The links carry the id
// the bar's Menu links to with scripts off; the controls that need a script
// are hidden then.
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
          <nav id={site.siteLinksId} aria-label={site.names.footer}>
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
          {/* Top aligned: the Sound panel opens in place under its pill, and
              the Calm pill stays level with the Sound pill beside it. */}
          <div className="flex flex-wrap items-start gap-2.5">
            <span className="contents noscript:hidden">
              <SoundToggle variant="footer" />
            </span>
            <CalmToggle variant="words" />
          </div>
        </div>
        <div
          className={cx(
            "grid items-center gap-x-4 gap-y-2 border-t pt-4 font-mono text-xs text-muted sm:grid-cols-[1fr_auto_1fr]",
            RULE,
          )}
        >
          <p>{copyright(year)}</p>
          <PaletteInvite className="justify-self-start sm:justify-self-center" />
        </div>
      </Container>
    </footer>
  );
}
