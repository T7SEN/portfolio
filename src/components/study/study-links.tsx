import { TextLink } from "@/components/site";
import { isMarker } from "@/content/markers";
import type { Link as StudyLink } from "@/content/types";

type StudyLinksProps = {
  links: readonly StudyLink[];
};

export function StudyLinks({ links }: StudyLinksProps) {
  return (
    <ul className="flex flex-col">
      {links.map((link) => (
        <li key={link.label}>
          {isMarker(link.href) ? (
            // An address that is not supplied yet stays visible text, never a
            // link to nowhere (REQ-CNT-05).
            <p className="py-2">
              {link.label} <span className="text-muted">{link.href}</span>
            </p>
          ) : (
            <TextLink
              href={link.href}
              className="inline-flex min-h-11 items-center"
            >
              {link.label}
            </TextLink>
          )}
        </li>
      ))}
    </ul>
  );
}
