import { calmStore, type CalmStore } from "@/lib/calm-store";
import { overlayStore, type OverlayStore } from "@/lib/overlay-store";

/** Carries the page to a part of it: the live Lenis's own glide. */
export type SectionGlide = (target: HTMLElement) => void;

/**
 * Sent on the window as a glide to a part of the page starts (not a jump),
 * so the making-of's slide lets it pass through instead of settling it on a
 * card when its scroll stalls (pass-viewer.tsx, D-180).
 */
export const SECTION_GLIDE_EVENT = "section-glide";

export type SectionScroller = {
  /**
   * Scrolls the page to the element with this id ("work" or "#work"), the
   * way a wheel glide would: through Lenis while it lives, otherwise the
   * browser's own smooth scroll, and a jump under calm or reduced motion
   * (REQ-A11Y-03, REQ-A11Y-04). While the menu or the palette is open it
   * waits for it to close. False when no such element is on this page, so
   * the caller can go to the page that has it.
   */
  scrollToSection(id: string): boolean;
  /**
   * The smooth scroll hands over its Lenis's glide while Lenis lives.
   * Returns the release, which leaves a newer glide alone.
   */
  setGlide(glide: SectionGlide): () => void;
};

export type SectionScrollerOptions = {
  doc?: () => Document | undefined;
  overlay?: Pick<OverlayStore, "getSnapshot" | "subscribe">;
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
};

export function createSectionScroller({
  doc = () => (typeof document === "undefined" ? undefined : document),
  overlay = overlayStore,
  calm = calmStore,
}: SectionScrollerOptions = {}): SectionScroller {
  let glide: SectionGlide | null = null;
  // Each call takes a new number; a scroll still waiting for an overlay to
  // close gives way to a later call.
  let latest = 0;
  let stopWaiting: (() => void) | null = null;

  function isCalm(): boolean {
    // The calm store refreshes the OS setting for its first subscriber, so
    // code outside React subscribes before it reads (calm-store.ts).
    const unsubscribe = calm.subscribe(() => undefined);
    const { calm: on } = calm.getSnapshot();
    unsubscribe();
    return on;
  }

  function run(page: Document, id: string, ticket: number) {
    if (ticket !== latest) return;
    const target = page.getElementById(id);
    if (target === null) return;
    const view = page.defaultView;
    if (glide !== null) {
      view?.dispatchEvent(new Event(SECTION_GLIDE_EVENT));
      glide(target);
      return;
    }
    const calm = isCalm();
    if (!calm) view?.dispatchEvent(new Event(SECTION_GLIDE_EVENT));
    target.scrollIntoView({
      block: "start",
      behavior: calm ? "instant" : "smooth",
    });
  }

  return {
    scrollToSection(id) {
      const page = doc();
      const name = id.startsWith("#") ? id.slice(1) : id;
      if (page === undefined || name === "") return false;
      if (page.getElementById(name) === null) return false;

      latest += 1;
      const ticket = latest;
      stopWaiting?.();
      stopWaiting = null;
      if (overlay.getSnapshot() === null) {
        run(page, name, ticket);
        return true;
      }

      // Lenis holds still while an overlay is open and starts again when it
      // closes; the scroll runs after every listener of that close.
      const unsubscribe = overlay.subscribe(() => {
        if (overlay.getSnapshot() !== null) return;
        unsubscribe();
        stopWaiting = null;
        queueMicrotask(() => run(page, name, ticket));
      });
      stopWaiting = unsubscribe;
      return true;
    },

    setGlide(next) {
      glide = next;
      return () => {
        if (glide === next) glide = null;
      };
    },
  };
}

const scroller = createSectionScroller();

/**
 * Scrolls the page to one of its parts by id: the palette's way to a home
 * chapter while the visitor is on the home page. False when the part is not
 * on this page. See SectionScroller.
 */
export function scrollToSection(id: string): boolean {
  return scroller.scrollToSection(id);
}

/** The smooth scroll's own seat for its Lenis glide (smooth-scroll.tsx). */
export const sectionGlides: Pick<SectionScroller, "setGlide"> = {
  setGlide: (glide) => scroller.setGlide(glide),
};
