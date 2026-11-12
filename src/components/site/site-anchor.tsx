import Link from "next/link";
import type { AnchorHTMLAttributes } from "react";

import type { ArrowDirection } from "./arrow-icon";

/** A page or fragment of this site; anything else leaves it. */
export function isOnSite(href: string) {
  return (
    (href.startsWith("/") && !href.startsWith("//")) || href.startsWith("#")
  );
}

/** The arrow a link carries: forward inside the site, out of it otherwise. */
export function arrowFor(href: string): ArrowDirection {
  return isOnSite(href) ? "forward" : "out";
}

export type SiteAnchorProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
> & {
  href: string;
};

// Pages of this site go through next/link, so moving between them keeps the
// one canvas alive (REQ-ENG-01). Fragments and other sites are plain anchors
// in the same tab.
export function SiteAnchor({ href, ...rest }: SiteAnchorProps) {
  if (href.startsWith("/") && !href.startsWith("//")) {
    return <Link href={href} {...rest} />;
  }
  return <a href={href} {...rest} />;
}
