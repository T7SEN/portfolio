import type { Engine, EngineEvent } from "@/engine/types";
import { tierStore } from "@/lib/tier-store";

import { afterFirstContent } from "./after-first-content";
import { loadEngine } from "./load-engine";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export type EngineSession = {
  /**
   * Asks for the field: the engine loads and starts once, after first
   * content. The returned cancel stops only a load that has not begun.
   */
  request(): () => void;
  /** Never rejects. Safe to call twice and while the engine is loading. */
  dispose(): Promise<void>;
};

function logFailure(code: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`engine: ${code}`, error);
  }
}

/**
 * One engine for the life of the root layout. Every event goes to the tier
 * store and is mirrored on the wrapper as data attributes, written straight
 * to the element so a frame rate report never renders React.
 */
export function createEngineSession(
  wrapper: HTMLElement,
  host: HTMLElement,
): EngineSession {
  const motion = window.matchMedia(REDUCED_MOTION);
  let engine: Engine | null = null;
  let hasBegun = false;
  let isDisposed = false;
  let cancelPending: (() => void) | null = null;
  let disposing: Promise<void> | null = null;

  function report(event: EngineEvent) {
    if (isDisposed) return;

    if (event.type === "frameRate") {
      wrapper.dataset.fps = String(event.fps);
      return;
    }

    tierStore.apply(event);
    if (event.type === "tierChosen") {
      wrapper.dataset.tier = String(event.tier);
      wrapper.dataset.tierReason = event.reason;
    }
    wrapper.dataset.ready = String(tierStore.getSnapshot().ready);
  }

  const onMotionChange = () => engine?.setCalm(motion.matches);

  async function begin() {
    if (hasBegun || isDisposed) return;
    hasBegun = true;

    try {
      const { createEngine } = await loadEngine();
      if (isDisposed) return;

      engine = createEngine(host, { calm: motion.matches });
      engine.on(report);
      motion.addEventListener("change", onMotionChange);
      await engine.start();
    } catch (error) {
      // A field that cannot load is tier 3, shown as itself (REQ-ENG-08).
      logFailure("no-backend", error);
      report({ type: "tierChosen", tier: 3, reason: "no-backend" });
      report({ type: "ready", tier: 3 });
    }
  }

  async function teardown() {
    isDisposed = true;
    cancelPending?.();
    motion.removeEventListener("change", onMotionChange);
    tierStore.reset();
    delete wrapper.dataset.tier;
    delete wrapper.dataset.tierReason;
    delete wrapper.dataset.ready;
    delete wrapper.dataset.fps;

    try {
      await engine?.dispose();
    } catch (error) {
      logFailure("dispose", error);
    }
  }

  return {
    request() {
      if (hasBegun || isDisposed) return () => undefined;

      cancelPending?.();
      const cancel = afterFirstContent(() => void begin());
      cancelPending = cancel;
      return cancel;
    },

    dispose() {
      disposing ??= teardown();
      return disposing;
    },
  };
}
