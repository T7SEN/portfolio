// Elements that are never part of what a visitor reads or reaches.
const UNSEEN = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NOSCRIPT"]);

/**
 * Holds the page still under the cover: every other child of the cover's
 * parent is inert (the skip link, the bar, main, the footer, the field), so
 * focus, pointers and screen readers reach only the cover; and the page
 * stays at the top with its scroll locked. The scrollbar's room is kept, so
 * nothing under the cover moves sideways when the lock comes or goes. A
 * scroll that still happens (the browser restoring a position, a script) is
 * taken back to the top. Returns the release, which leaves alone anything
 * that was inert before.
 */
export function holdPage(cover: HTMLElement): () => void {
  const doc = cover.ownerDocument;
  const win = doc.defaultView;
  const html = doc.documentElement;
  const made: Element[] = [];

  for (const element of cover.parentElement?.children ?? []) {
    if (element === cover || UNSEEN.has(element.tagName)) continue;
    if (element.hasAttribute("inert")) continue;
    element.setAttribute("inert", "");
    made.push(element);
  }

  const overflow = html.style.getPropertyValue("overflow");
  const gutter = html.style.getPropertyValue("scrollbar-gutter");
  const hasScrollbar = win !== null && win.innerWidth > html.clientWidth;
  html.style.setProperty("overflow", "hidden");
  if (hasScrollbar) html.style.setProperty("scrollbar-gutter", "stable");

  const toTop = () => {
    if (win !== null && (win.scrollY !== 0 || win.scrollX !== 0)) {
      win.scrollTo(0, 0);
    }
  };
  toTop();
  win?.addEventListener("scroll", toTop, { passive: true });

  return () => {
    for (const element of made) element.removeAttribute("inert");
    made.length = 0;
    win?.removeEventListener("scroll", toTop);
    if (overflow === "") html.style.removeProperty("overflow");
    else html.style.setProperty("overflow", overflow);
    if (gutter === "") html.style.removeProperty("scrollbar-gutter");
    else html.style.setProperty("scrollbar-gutter", gutter);
  };
}
