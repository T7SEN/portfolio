import { cx, TextLink } from "@/components/site";
import { isMarker } from "@/content/markers";
import type { Link } from "@/content/types";

type ElsewhereListProps = {
  links: readonly Link[];
  /** The CV line: sent on request only, so its link goes to /contact. */
  cv: { text: string; link: Link };
  className?: string;
};

// GitHub, the stream and the CV on request. An address not supplied yet stays
// visible text with its marker, never a link to nowhere (REQ-CNT-05); the CV
// is never a file (REQ-CNT-08).
export function ElsewhereList({ links, cv, className }: ElsewhereListProps) {
  return (
    <ul className={cx("flex flex-col gap-1 text-base font-medium", className)}>
      {links.map((link) => (
        <li key={link.label}>
          {isMarker(link.href) ? (
            <p className="py-2.5">
              {link.label}{" "}
              <span className="font-normal text-muted">{link.href}</span>
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
      <li className="pt-2.5">
        <p className="font-normal text-muted">{cv.text}</p>
        <TextLink
          href={cv.link.href}
          className="inline-flex min-h-11 items-center"
        >
          {cv.link.label}
        </TextLink>
      </li>
    </ul>
  );
}
