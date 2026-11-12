import { TextLink } from "@/components/site/text-link";
import { cx } from "@/components/site/class-names";
import { isMarker } from "@/content/markers";
import type { Link } from "@/content/types";

type SecondaryLinkProps = {
  link: Link;
  className?: string;
};

// The lighter link beside a study link: muted and underlined ("Repo ↗"). An
// address not supplied yet stays visible text, never a link to nowhere
// (REQ-CNT-05).
export function SecondaryLink({ link, className }: SecondaryLinkProps) {
  if (isMarker(link.href)) {
    return (
      <p className={cx("py-2 text-[0.9375rem] text-muted", className)}>
        {link.label} <span>{link.href}</span>
      </p>
    );
  }

  return (
    <TextLink
      href={link.href}
      variant="muted"
      className={cx(
        "inline-flex min-h-11 items-center text-[0.9375rem]",
        className,
      )}
    >
      {link.label}
    </TextLink>
  );
}
