import type { ReactNode } from "react";

import { cx, HAIRLINE, MONO_CAPS } from "./class-names";
import { isOnSite, SiteAnchor } from "./site-anchor";

type BoxedLinkProps = {
  href: string;
  /** The link's words, in the text colour with the arrow after them. */
  children: ReactNode;
  /** The muted mono line under them, in sentence case ("No 3D · Static HTML"). */
  note: ReactNode;
  className?: string;
};

// A hairline rounded box holding a link over a muted mono line, such as the
// work chapter's way to the full index. The whole box is the target, and the
// note is part of the link's name.
export function BoxedLink({ href, children, note, className }: BoxedLinkProps) {
  return (
    <SiteAnchor
      href={href}
      className={cx(
        "group inline-flex min-h-11 flex-col justify-center gap-1 rounded-[14px] border px-5 py-3.5 transition-colors hover:border-edge",
        HAIRLINE,
        className,
      )}
    >
      <span className="text-[0.9375rem] font-medium text-text transition-colors group-hover:text-paper group-focus-visible:text-paper">
        {children}
        <span
          aria-hidden="true"
          className="ms-1 inline-block text-glow rtl:-scale-x-100"
        >
          {isOnSite(href) ? "→" : "↗"}
        </span>
      </span>
      {/* The two lines are separate boxes on screen; this keeps them apart in
          the link's name too. */}
      <span className="sr-only">, </span>
      <span
        className={cx(
          "text-[0.6875rem] leading-[1.4] tracking-[0.08em] text-muted",
          MONO_CAPS,
        )}
      >
        {note}
      </span>
    </SiteAnchor>
  );
}
