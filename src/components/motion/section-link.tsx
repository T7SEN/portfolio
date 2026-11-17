"use client";

import type {
  AnchorHTMLAttributes,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";

import { scrollToSection } from "./scroll-to-section";

type SectionLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "onClick"
> & {
  /** A part of this page, as "#id". */
  href: `#${string}`;
  children: ReactNode;
};

/**
 * Makes an element focusable for this one move, focuses it without a scroll
 * of its own, and lets it go again once focus leaves: a part that stayed
 * focusable would take focus from every click on its text, and a focus ends
 * a wheel glide (smooth-scroll-session.ts). One that is focusable already
 * (main) keeps its own tabindex.
 */
function takeFocus(target: HTMLElement) {
  if (!target.hasAttribute("tabindex")) {
    target.setAttribute("tabindex", "-1");
    target.addEventListener("blur", () => target.removeAttribute("tabindex"), {
      once: true,
    });
  }
  target.focus({ preventScroll: true });
}

/**
 * A click on a link to a part of this page: the page scrolls there rather
 * than jumping [T7SEN, 16 Nov 2026] (D-176), the way the palette's move to a
 * chapter does (scroll-to-section.ts): through Lenis on a desktop, the
 * browser's own smooth scroll on touch, and a jump only under calm mode or
 * reduced motion (REQ-A11Y-03, REQ-A11Y-04). Focus goes to the part first,
 * as the jump would take it, so the next Tab goes on from there; it scrolls
 * nothing, so the glide is never cut short. A click with a modifier, or one
 * the page already took, is the browser's, and so is a link whose part is
 * not on this page. Before the page's script runs the link jumps, as any
 * link to a part of the page does.
 */
export function glideToPart(event: ReactMouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  const id = decodeURIComponent(
    new URL(event.currentTarget.href).hash.slice(1),
  );
  const target = id === "" ? null : document.getElementById(id);
  if (target === null) return;
  event.preventDefault();
  takeFocus(target);
  scrollToSection(id);
}

/**
 * A link to a part of this page that scrolls there (glideToPart): every
 * skip link on the site, Skip to content, the hero's Skip intro and the
 * making-of's Skip to About [T7SEN, 16 Nov 2026].
 */
export function SectionLink({ href, children, ...rest }: SectionLinkProps) {
  return (
    <a href={href} onClick={glideToPart} {...rest}>
      {children}
    </a>
  );
}
