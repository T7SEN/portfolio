import type { CalmStore } from "@/lib/calm-store";
import { loadLenis, loadScrollTrigger } from "@/lib/load-motion";

import { afterFirstContent } from "../engine/after-first-content";
import { shouldSmoothScroll } from "./should-smooth-scroll";

// GSAP's own lag smoothing defaults (gsap-core.js in gsap 3.15.1, lines 1271
// and 1272), put back when Lenis goes, so the story's tweens behave after a
// long frame as they would have without it.
const GSAP_LAG_THRESHOLD_MS = 500;
const GSAP_ADJUSTED_LAG_MS = 33;

type TickerCallback = (time: number) => void;

/** The parts of Lenis, GSAP and ScrollTrigger that the wiring uses. */
export type SmoothScrollModules = {
  Lenis: new (options: { stopInertiaOnNavigate: boolean }) => {
    on(event: "scroll", callback: () => void): unknown;
    raf(time: number): void;
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

/**
 * Smooth wheel scrolling for the life of the root layout. Lenis is created
 * after first content, only on a fine primary pointer with calm off, and is
 * destroyed the moment either stops being true (REQ-SCR-03, REQ-A11Y-03,
 * REQ-A11Y-04). Lenis moves the native scroll position, so the wheel's
 * distance, the keyboard and the scrollbar stay native (REQ-SCR-02).
 */
export function createSmoothScroll({
  calm,
  pointer,
  load = loadModules,
  schedule = afterFirstContent,
}: SmoothScrollOptions): SmoothScroll {
  let isDisposed = false;
  let hasContent = false;
  let isLoading = false;
  let modules: Promise<SmoothScrollModules> | null = null;
  let stopLenis: (() => void) | null = null;

  // A browser that cannot answer the pointer question keeps native scroll.
  const isWanted = () =>
    shouldSmoothScroll({
      coarsePointer: pointer === null || pointer.matches,
      calm: calm.getSnapshot().calm,
    });

  function stop() {
    stopLenis?.();
    stopLenis = null;
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
      const lenis = new Lenis({ stopInertiaOnNavigate: true });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      stopLenis = () => {
        gsap.ticker.remove(tick);
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
      pointer?.removeEventListener("change", sync);
      stop();
    },
  };
}
