import type { CalmStore } from "@/lib/calm-store";
import { loadLenis, loadScrollTrigger } from "@/lib/load-motion";
import type { OverlayStore } from "@/lib/overlay-store";
import { wheelSteps } from "@/lib/wheel-steps";

import { afterFirstContent } from "../engine/after-first-content";
import type { SectionScroller } from "./scroll-to-section";
import { shouldSmoothScroll } from "./should-smooth-scroll";

// GSAP's own lag smoothing defaults (gsap-core.js in gsap 3.15.1, lines 1271
// and 1272), put back when Lenis goes, so the story's tweens behave after a
// long frame as they would have without it.
const GSAP_LAG_THRESHOLD_MS = 500;
const GSAP_ADJUSTED_LAG_MS = 33;

type TickerCallback = (time: number) => void;

/** One input as Lenis hands it to its virtualScroll option. */
export type LenisInput = {
  deltaX: number;
  deltaY: number;
  event: WheelEvent | TouchEvent;
};

/** The parts of Lenis, GSAP and ScrollTrigger that the wiring uses. */
export type SmoothScrollModules = {
  Lenis: new (options: {
    stopInertiaOnNavigate: boolean;
    virtualScroll: (data: LenisInput) => boolean;
    prevent: (node: HTMLElement) => boolean;
  }) => {
    readonly isSmooth: boolean;
    /** The position Lenis last wrote while it glides. */
    readonly animatedScroll: number;
    /** Where Lenis's glide is heading. */
    readonly targetScroll: number;
    /** What the running glide was started with (scrollTo's userData). */
    readonly userData: Record<string, unknown>;
    on(event: "scroll", callback: () => void): unknown;
    raf(time: number): void;
    scrollTo(
      target: HTMLElement,
      options: { userData: Record<string, unknown> },
    ): void;
    stop(): void;
    start(): void;
    destroy(): void;
  };
  gsap: {
    ticker: {
      add(callback: TickerCallback): unknown;
      remove(callback: TickerCallback): void;
      lagSmoothing(threshold: number, adjustedLag?: number): void;
    };
  };
  ScrollTrigger: { update(): void };
};

type PointerQuery = Pick<
  MediaQueryList,
  "matches" | "addEventListener" | "removeEventListener"
>;

export type SmoothScrollOptions = {
  calm: Pick<CalmStore, "getSnapshot" | "subscribe">;
  /** The coarse pointer query, or null where the browser cannot answer it. */
  pointer: PointerQuery | null;
  /** The menu and the palette: Lenis holds still while one is open. */
  overlay: Pick<OverlayStore, "getSnapshot" | "subscribe">;
  /** Where the palette's scroll to a home chapter finds Lenis's glide. */
  sections: Pick<SectionScroller, "setGlide">;
  /** Replaced by fakes in unit tests. */
  load?: () => Promise<SmoothScrollModules>;
  schedule?: (run: () => void) => () => void;
};

export type SmoothScroll = {
  /** Destroys Lenis and removes every listener. Safe to call twice. */
  dispose(): void;
};

async function loadModules(): Promise<SmoothScrollModules> {
  const [Lenis, { gsap, ScrollTrigger }] = await Promise.all([
    loadLenis(),
    loadScrollTrigger(),
  ]);
  return { Lenis, gsap, ScrollTrigger };
}

function logFailure(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("smooth scroll: no-lenis", error);
  }
}

/** The keys with which the browser scrolls the page itself. */
const SCROLL_KEYS = new Set([
  " ",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

/**
 * A link to a place on this page, which the browser jumps to. Lenis stops
 * the glide itself for a link to another path (lenis 1.3.27,
 * dist/lenis.mjs lines 558 to 562).
 */
function isSamePageJump(target: EventTarget | null): boolean {
  const link = target instanceof Element ? target.closest("a[href]") : null;
  if (!(link instanceof HTMLAnchorElement)) return false;
  const to = new URL(link.href);
  const here = new URL(window.location.href);
  // A bare "#" has an empty hash and still jumps, to the top.
  return (
    to.href.includes("#") &&
    to.origin === here.origin &&
    to.pathname === here.pathname
  );
}

// A glide writes positions to the page that are fractions of a pixel; the
// browser may round them. A position further than this from Lenis's own was
// written by something else.
const STRAY_PX = 2;

// In a form field these keys act on the field, not the page.
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

// What the palette's scroll to a chapter marks its glide with.
const SECTION_GLIDE = "section";

/**
 * While a wheel glide runs, Lenis writes the scroll position on every frame
 * and follows a native scroll only once no glide runs (lenis 1.3.27,
 * dist/lenis.mjs lines 664 and 834 to 840). A jump to a hash on this page,
 * a scroll key or the scroll that brings a focused element into view would
 * be undone. Each of them ends the glide first, in the capture phase, before
 * the browser moves the page. So does a step back or forward through the
 * history, whose page the glide would go on scrolling: Lenis 1.3.27 has no
 * popstate listener, and its stopInertiaOnNavigate covers link clicks only
 * (lines 558 to 562). Nothing here acts while an overlay holds Lenis still.
 * Returns the teardown.
 */
function stopGlideBeforeNativeScroll(
  lenis: InstanceType<SmoothScrollModules["Lenis"]>,
  isHeld: () => boolean,
): () => void {
  // Lenis's reset() ends a glide and leaves Lenis at the native position
  // (lines 680 to 686), but its types make it private. stop() and start()
  // run it and leave Lenis as it was (lines 698 to 720).
  const endGlide = () => {
    if (!lenis.isSmooth || isHeld()) return;
    lenis.stop();
    lenis.start();
  };
  // The palette's glide to a chapter goes on when the closing palette gives
  // focus back: that focus scrolls nothing (Radix focuses with
  // preventScroll), and a focus that does scroll is a scroll Lenis did not
  // write, which ends the glide in onScroll below.
  const onFocusIn = () => {
    if (lenis.isSmooth && lenis.userData[SECTION_GLIDE] === true) return;
    endGlide();
  };
  const onClick = (event: MouseEvent) => {
    if (isSamePageJump(event.target)) endGlide();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key) && !isEditable(event.target)) endGlide();
  };
  // A drag of the scrollbar, find in page or a script moves the page with
  // no key, click or focus first. Lenis would write its own position back
  // on its next frame; a position it did not write ends the glide instead,
  // and Lenis follows the native scroll from there (lines 655 to 678).
  const onScroll = () => {
    if (!lenis.isSmooth) return;
    if (Math.abs(window.scrollY - lenis.animatedScroll) > STRAY_PX) endGlide();
  };
  window.addEventListener("click", onClick, true);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("focusin", onFocusIn, true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("popstate", endGlide);
  return () => {
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("focusin", onFocusIn, true);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("popstate", endGlide);
  };
}

/**
 * Lenis's hook for each input, before it moves the page (lenis 1.3.27,
 * dist/lenis.mjs lines 582 to 584 and 630): a wheel input that the page's
 * wheel step sends somewhere else has its delta set so that Lenis's target
 * lands there, and Lenis's own glide carries the page (D-132); one that
 * holds the page still is taken here and goes no further. Touch, a zoom
 * (Ctrl and the wheel) and every input with no step pass through as they
 * came.
 */
export function stepWheel(
  lenis: { readonly targetScroll: number },
  data: LenisInput,
): boolean {
  const { event } = data;
  if (!event.type.includes("wheel") || event.ctrlKey) return true;
  const to = wheelSteps.target(lenis.targetScroll, data.deltaY);
  if (to === null) return true;
  const move = to - lenis.targetScroll;
  if (Math.abs(move) < 0.5) {
    if (event.cancelable) event.preventDefault();
    return false;
  }
  data.deltaY = move;
  return true;
}

/**
 * A dialog (the menu, the palette, the loader's cover) scrolls by itself:
 * Lenis returns before it touches the event (lenis.mjs line 613), and the
 * browser scrolls the panel under the pointer. Without it a held Lenis would
 * cancel every wheel over a panel that lacks data-lenis-prevent (lines 617
 * to 619).
 */
export function scrollsNatively(node: HTMLElement): boolean {
  return node.getAttribute("role") === "dialog";
}

/**
 * Smooth wheel scrolling for the life of the root layout. Lenis is created
 * after first content, only on a fine primary pointer with calm off, and is
 * destroyed the moment either stops being true (REQ-SCR-03, REQ-A11Y-03,
 * REQ-A11Y-04). Lenis moves the native scroll position, so the wheel keeps
 * its distance (REQ-SCR-02). The keyboard, a link to a place on the page
 * and a focus change stay native even during a glide, because each one
 * stops the glide before the browser scrolls (REQ-SCR-02, REQ-NAV-01). A
 * scroll that Lenis did not write, such as a drag of the scrollbar, ends the
 * glide as it happens, so it is never overridden. While the menu or the
 * palette is open Lenis holds still and the dialog scrolls natively
 * (REQ-NAV-03, REQ-NAV-04).
 */
export function createSmoothScroll({
  calm,
  pointer,
  overlay,
  sections,
  load = loadModules,
  schedule = afterFirstContent,
}: SmoothScrollOptions): SmoothScroll {
  let isDisposed = false;
  let hasContent = false;
  let isLoading = false;
  let modules: Promise<SmoothScrollModules> | null = null;
  let stopLenis: (() => void) | null = null;
  // Holds the live Lenis still while an overlay is open, and lets it go.
  let holdLenis: (() => void) | null = null;

  // A browser that cannot answer the pointer question keeps native scroll.
  const isWanted = () =>
    shouldSmoothScroll({
      coarsePointer: pointer === null || pointer.matches,
      calm: calm.getSnapshot().calm,
    });

  function stop() {
    stopLenis?.();
    stopLenis = null;
    holdLenis = null;
  }

  async function start() {
    if (stopLenis !== null || isLoading) return;
    isLoading = true;
    try {
      modules ??= load();
      const { Lenis, gsap, ScrollTrigger } = await modules;
      // Calm or a coarse pointer may have arrived while the modules loaded.
      if (isDisposed || !isWanted()) return;

      // The Lenis 1.3.27 README's GSAP wiring: GSAP's ticker drives Lenis and
      // each Lenis scroll updates ScrollTrigger, so no third loop is added.
      // Every other option keeps its default, so the wheel keeps its distance
      // and touch is never smoothed. A click on a link to another page stops
      // the wheel's inertia: without it Lenis went on scrolling the new
      // page after the router had put it at the top, and a visitor who
      // clicked a study while scrolling landed at the bottom of the study.
      // Each wheel input is offered to the page's wheel step first, so a
      // notch in the making-of slide glides straight to the next card;
      // while an overlay is open every input passes as it came, since it
      // belongs to a dialog's panel, never to the slide behind it. A
      // dialog's panel scrolls natively (scrollsNatively).
      let isHeld = false;
      const lenis: InstanceType<SmoothScrollModules["Lenis"]> = new Lenis({
        stopInertiaOnNavigate: true,
        virtualScroll: (data: LenisInput): boolean =>
          isHeld || stepWheel(lenis, data),
        prevent: scrollsNatively,
      });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
      const removeGlideStops = stopGlideBeforeNativeScroll(lenis, () => isHeld);

      // While the menu or the palette is open, Lenis is stopped: stopping
      // ends any glide (lenis.mjs lines 707 to 720), it writes nothing, and
      // a wheel outside a dialog moves nothing (lines 617 to 619). What the
      // palette does to the page, router.push to another page included,
      // happens while it holds, so no inertia carries over; start takes up
      // the page where it then is (lines 690 to 704). The palette's glide
      // to a chapter is marked, so a focus given back does not end it
      // (scrollTo keeps userData until the glide ends, line 808).
      const hold = () => {
        const isOpen = overlay.getSnapshot() !== null;
        if (isOpen === isHeld) return;
        isHeld = isOpen;
        if (isOpen) lenis.stop();
        else lenis.start();
      };
      hold();
      holdLenis = hold;
      const releaseGlide = sections.setGlide((target) => {
        lenis.scrollTo(target, { userData: { [SECTION_GLIDE]: true } });
      });

      stopLenis = () => {
        gsap.ticker.remove(tick);
        removeGlideStops();
        releaseGlide();
        gsap.ticker.lagSmoothing(GSAP_LAG_THRESHOLD_MS, GSAP_ADJUSTED_LAG_MS);
        lenis.destroy();
      };
    } catch (error) {
      // Native scroll is already in place, so the visitor sees no change.
      // The next change of calm or pointer tries the import again.
      modules = null;
      logFailure(error);
    } finally {
      isLoading = false;
    }
  }

  function sync() {
    if (isDisposed || !hasContent) return;
    if (isWanted()) void start();
    else stop();
  }

  const unsubscribeCalm = calm.subscribe(sync);
  const unsubscribeOverlay = overlay.subscribe(() => holdLenis?.());
  pointer?.addEventListener("change", sync);
  const cancelWait = schedule(() => {
    hasContent = true;
    sync();
  });

  return {
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      cancelWait();
      unsubscribeCalm();
      unsubscribeOverlay();
      pointer?.removeEventListener("change", sync);
      stop();
    },
  };
}
