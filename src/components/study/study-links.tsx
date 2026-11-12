import { cx } from "@/components/site/class-names";
import { TextLink } from "@/components/site/text-link";
import { isMarker } from "@/content/markers";
import type { Link as StudyLink } from "@/content/types";

type StudyLinksProps = {
  links: readonly StudyLink[];
  /** column: one link a line. row: side by side, wrapping on a phone. */
  layout?: "column" | "row";
};

export function StudyLinks({ links, layout = "column" }: StudyLinksProps) {
  return (
    <ul
      className={cx(
        "flex",
        layout === "row" ? "flex-wrap gap-x-7" : "flex-col",
      )}
    >
      {links.map((link) => (
        <li key={link.label}>
          {isMarker(link.href) ? (
            // An address that is not supplied yet stays visible text, never a
            // link to nowhere (REQ-CNT-05).
            <p className="py-2.5">
              {link.label} <span className="text-muted">{link.href}</span>
            </p>
          ) : (
            <TextLink
              href={link.href}
              className="inline-flex min-h-11 items-center font-medium"
            >
              {link.label}
            </TextLink>
          )}
        </li>
      ))}
    </ul>
  );
}
