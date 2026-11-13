import type { ReactNode } from "react";

import { cx, LINK_HOVER, LINK_UNDERLINE } from "./class-names";
import { isOnSite, SiteAnchor } from "./site-anchor";

/**
 * inline: the main link, in the text colour, underlined, with a glow arrow.
 * muted: the lighter link beside it, muted and underlined ("arche-lab.tech").
 * footer: no underline; an arrow to another site shows at rest, an arrow to a
 * page of this site only on hover and focus (decision D-010).
 */
export type TextLinkVariant = "inline" | "muted" | "footer";

type TextLinkProps = {
  href: string;
  children: ReactNode;
  variant?: TextLinkVariant;
  className?: string;
  /**
   * A name for assistive technology when the words alone repeat down a list.
   * It must hold the visible words (WCAG 2.5.3, label in name).
   */
  "aria-label"?: string;
  /** Classes for the words' own box, which carries the underline. */
  wordsClassName?: string;
};

const VARIANTS: Record<TextLinkVariant, string> = {
  inline: "text-text",
  muted: "text-muted",
  footer: "inline-flex min-h-11 items-center text-text",
};

export function TextLink({
  href,
  children,
  variant = "inline",
  className,
  "aria-label": name,
  wordsClassName,
}: TextLinkProps) {
  const onSite = isOnSite(href);
  const hideAtRest = variant === "footer" && onSite;

  // The arrow tells where the link goes, inside the site or out of it, and
  // it mirrors on right-to-left pages. It sits beside the words' box, so the
  // underline stops at the words (LINK_UNDERLINE).
  const arrow = (
    <span
      aria-hidden="true"
      className={cx(
        "ms-1 inline-block rtl:-scale-x-100",
        variant !== "muted" && "text-glow",
        hideAtRest &&
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
      )}
    >
      {onSite ? "→" : "↗"}
    </span>
  );

  return (
    <SiteAnchor
      href={href}
      className={cx("group", VARIANTS[variant], LINK_HOVER, className)}
      aria-label={name}
    >
      <span
        data-part="link-words"
        className={cx(variant !== "footer" && LINK_UNDERLINE, wordsClassName)}
      >
        {children}
      </span>
      {arrow}
    </SiteAnchor>
  );
}
