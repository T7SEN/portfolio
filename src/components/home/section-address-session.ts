import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";

/**
 * The reading line: a band 1% of the screen tall just above its middle. The
 * chapter across it names the address. A band, not a line of no height,
 * which an observer may not count as crossing in every browser.
 */
export const ADDRESS_LINE = "-49% 0px -50% 0px";

/** The band's lower edge, as a share of the screen's height from its top. */
export const LINE_SHARE = 0.5;

/** The home page's chapters, the hero first (it has no id) (D-170). */
const CHAPTERS = "main section[data-chapter]";

export type SectionAddressOptions = {
  doc?: Document;
};

/**
 * Keeps the home page's address on the chapter being read (REQ-NAV-06,
 * D-170): "/#field", "/#work", "/#making-of", "/#about" or "/#contact" for
 * the chapter across the reading line, the plain "/" on the hero, and the
 * last chapter's once the footer comes up. The address is replaced, never
 * pushed, so no step joins the history and Back still leaves the page in
 * one press; replacing it scrolls nothing. An observer reports the chapters
 * crossing the line, so nothing runs on a scroll frame; each report then
 * reads where the chapters are, since a chapter a jump carries from below
 * the line to above it in one frame gets no report of its own (End from the
 * top with the footer over the line).
 *
 * Nothing is written until the page has scrolled with the loader's cover
 * gone. Under the cover the page is held at the top, and a link into the
 * page ("/#about") must keep its address until the page has gone to its
 * part (cover-session.ts); the same holds for the browser's own jump to a
 * part on a load with no cover. Returns the teardown.
 */
export function startSectionAddress({
  doc = document,
}: SectionAddressOptions = {}): () => void {
  const view = doc.defaultView;
  if (view === null || typeof view.IntersectionObserver !== "function") {
    return () => undefined;
  }
  // Narrowed once, for the functions below.
  const win = view;
  const chapters = Array.from(doc.querySelectorAll<HTMLElement>(CHAPTERS));
  if (chapters.length === 0) return () => undefined;

  const path = win.location.pathname;
  let armed = false;
  let frame = 0;

  const isCovered = () =>
    doc.documentElement.getAttribute(LOADER_ATTRIBUTE) === "up";

  // The last chapter in page order whose top has reached the line: the one
  // across it, or with the footer over the line, the last chapter. Chapters
  // follow each other with no gap, so no later one can be across instead.
  // Null while every chapter is below the line.
  function reading(): string | null {
    const line = win.innerHeight * LINE_SHARE;
    for (let i = chapters.length - 1; i >= 0; i -= 1) {
      const chapter = chapters[i];
      if (
        chapter !== undefined &&
        chapter.getBoundingClientRect().top <= line
      ) {
        return chapter.id;
      }
    }
    return null;
  }

  function write() {
    if (!armed) return;
    // A cover brought back by a move to the page holds it at the top again.
    if (isCovered()) {
      armed = false;
      return;
    }
    // A move away has already changed the address; it is not this page's.
    if (win.location.pathname !== path) return;
    const id = reading();
    if (id === null) return;
    const hash = id === "" ? "" : `#${id}`;
    if (win.location.hash === hash) return;
    const url = new URL(win.location.href);
    url.hash = hash;
    try {
      // The documented way to change the address in Next.js 16: the router
      // copies its own state into the entry and keeps its address in step
      // (node_modules/next/dist/docs/01-app/01-getting-started/
      // 04-linking-and-navigating.md, "Native History API").
      win.history.replaceState(null, "", url);
    } catch {
      // A browser that limits how often the address changes keeps the last
      // one; the next chapter tries again.
    }
  }

  // Any chapter crossing the line is the moment to read them all.
  const observer = new win.IntersectionObserver(() => write(), {
    rootMargin: ADDRESS_LINE,
  });
  for (const chapter of chapters) observer.observe(chapter);

  const onScroll = () => {
    if (armed || isCovered()) return;
    armed = true;
    // The observer reports a chapter this scroll moved across the line after
    // the frame; two frames on, a scroll that moved none is written too.
    win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(() => {
      frame = win.requestAnimationFrame(write);
    });
  };
  win.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    observer.disconnect();
    win.removeEventListener("scroll", onScroll);
    win.cancelAnimationFrame(frame);
  };
}
