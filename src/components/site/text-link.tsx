import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "./class-names";

export type TextLinkVariant = "inline" | "footer";

type TextLinkProps = {
  href: string;
  children: ReactNode;
  variant?: TextLinkVariant;
  className?: string;
  /** Marks a link the scroll story measures its layout by (story-stage.ts). */
  "data-stage"?: string;
};

function isOnSite(href: string) {
  return (
    (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#")
  );
}

export function TextLink({
  href,
  children,
  variant = "inline",
  className,
  "data-stage": stage,
}: TextLinkProps) {
  const onSite = isOnSite(href);
  const isFooter = variant === "footer";
  const classes = cx(
    "group text-text transition-colors hover:text-glow focus-visible:text-glow",
    isFooter && "inline-flex min-h-11 items-center",
    className,
  );

  // The arrow is the non-colour cue that marks a link (WCAG 1.4.1), so there
  // is no resting underline. Footer links show it only on hover and focus
  // (decision D-010). It mirrors on right-to-left pages.
  const arrow = (
    <span
      aria-hidden="true"
      className={cx(
        "ms-1 inline-block text-glow rtl:-scale-x-100",
        isFooter &&
          "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
      )}
    >
      {onSite ? "→" : "↗"}
    </span>
  );

  if (href.startsWith("/") && onSite) {
    return (
      <Link href={href} className={classes} data-stage={stage}>
        {children}
        {arrow}
      </Link>
    );
  }

  return (
    <a href={href} className={classes} data-stage={stage}>
      {children}
      {arrow}
    </a>
  );
}
