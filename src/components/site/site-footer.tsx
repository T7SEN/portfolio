import { Container } from "./container";
import { TextLink } from "./text-link";

const FOOTER_LINKS = [
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/v1", label: "v1 archive" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-raised">
      <Container className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 font-mono text-sm">
            {FOOTER_LINKS.map(({ href, label }) => (
              <li key={href}>
                <TextLink href={href} variant="footer">
                  {label}
                </TextLink>
              </li>
            ))}
          </ul>
        </nav>
        <p className="font-mono text-label text-muted">T7SEN</p>
      </Container>
    </footer>
  );
}
