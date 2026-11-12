import type { ChapterId, Engine, EngineEvent } from "@/engine/types";
import { calmStore, type CalmStore } from "@/lib/calm-store";
import {
  storyBridge,
  type StoryBridge,
  type StoryTarget,
} from "@/lib/story-bridge";
import { tierStore } from "@/lib/tier-store";

import { afterFirstContent } from "./after-first-content";
import { loadEngine } from "./load-engine";

export type EngineSession = {
  /**
   * Asks for the field: the engine loads and starts once, after first
   * content. The returned cancel stops only a load that has not begun.
   */
  request(): () => void;
  /** Never rejects. Safe to call twice and while the engine is loading. */
  dispose(): Promise<void>;
};

export type EngineSessionOptions = {
  /** Calm mode or OS reduced motion. Replaced by a fake in unit tests. */
  calm?: Pick<CalmStore, "getSnapshot" | "subscribe">;
  /** Where the page's story and pointer arrive. Replaced in unit tests. */
  bridge?: Pick<StoryBridge, "connect">;
};

function logFailure(code: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`engine: ${code}`, error);
  }
}

/**
 * One engine for the life of the root layout. Every event goes to the tier
 * store and is mirrored on the wrapper as data attributes, written straight
 * to the element so a frame rate report never renders React. The chapter the
 * page sends is mirrored too, as data-chapter, on every tier.
 */
export function createEngineSession(
  wrapper: HTMLElement,
  host: HTMLElement,
  { calm = calmStore, bridge = storyBridge }: EngineSessionOptions = {},
): EngineSession {
  let engine: Engine | null = null;
  let hasBegun = false;
  let isDisposed = false;
  let cancelPending: (() => void) | null = null;
  let disposing: Promise<void> | null = null;
  let isCalm: boolean | null = null;
  let unsubscribeCalm: (() => void) | null = null;
  // The veil the page asks for (story-veil.ts), null for the wrapper's own.
  let pageVeil: number | null = null;

  // Only a live field takes the page's veil. Tier 3's still is one picture
  // behind every chapter and keeps the wrapper's own measured veil (0.75
  // on tier 3, engine-host.tsx).
  function applyVeil() {
    const tier = wrapper.dataset.tier;
    if (!isDisposed && pageVeil !== null && (tier === "1" || tier === "2")) {
      wrapper.style.setProperty("--field-veil", String(pageVeil));
    } else {
      wrapper.style.removeProperty("--field-veil");
    }
  }

  function setVeil(veil: number | null) {
    if (veil === pageVeil) return;
    pageVeil = veil;
    applyVeil();
  }

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
      applyVeil();
    }
    const { ready, look } = tierStore.getSnapshot();
    wrapper.dataset.ready = String(ready);
    // How the live field draws, once it has; none on tier 3.
    if (look === null) delete wrapper.dataset.look;
    else wrapper.dataset.look = look;
  }

  // Story progress arrives on every scrolled frame, so the attribute is
  // written only when the chapter changes.
  function mirrorChapter(chapter: ChapterId) {
    if (!isDisposed && wrapper.dataset.chapter !== chapter) {
      wrapper.dataset.chapter = chapter;
    }
  }

  // Before the engine exists, and when it cannot load, the chapter is still
  // mirrored, so the wrapper says where the story is on every tier.
  const mirrorOnly: StoryTarget = {
    setStory: (chapter) => mirrorChapter(chapter),
    setStage: () => undefined,
    setPasses: () => undefined,
    setPointer: () => undefined,
    setVeil,
  };

  // The engine keeps the latest story, stage, passes and pointer itself,
  // tier 3 included, and hands them to a GPU tier that a later setTier
  // brings back.
  function forwardTo(live: Engine): StoryTarget {
    return {
      setStory(chapter, progress) {
        mirrorChapter(chapter);
        live.setStory(chapter, progress);
      },
      setStage: (stages) => live.setStage(stages),
      setPasses: (cards) => live.setPasses(cards),
      setPointer: (x, y, active) => live.setPointer(x, y, active),
      setVeil,
    };
  }

  let disconnectBridge = bridge.connect(mirrorOnly);

  function connect(target: StoryTarget) {
    disconnectBridge();
    disconnectBridge = bridge.connect(target);
  }

  // The store tells listeners about any change of its three values; the
  // engine hears only a change of calm itself.
  function onCalmChange() {
    const next = calm.getSnapshot().calm;
    if (next === isCalm) return;
    isCalm = next;
    engine?.setCalm(next);
  }

  async function begin() {
    if (hasBegun || isDisposed) return;
    hasBegun = true;

    try {
      const { createEngine } = await loadEngine();
      if (isDisposed) return;

      // Subscribed before the read, so a change of the OS setting made while
      // nobody listened is already counted.
      unsubscribeCalm = calm.subscribe(onCalmChange);
      isCalm = calm.getSnapshot().calm;
      engine = createEngine(host, { calm: isCalm });
      engine.on(report);
      // The latest story, stage, passes and pointer reach the engine before
      // it starts.
      connect(forwardTo(engine));
      await engine.start();
    } catch (error) {
      // A field that cannot load is tier 3, shown as itself (REQ-ENG-08).
      logFailure("no-backend", error);
      report({ type: "tierChosen", tier: 3, reason: "no-backend" });
      report({ type: "ready", tier: 3, particles: 0 });
      if (!isDisposed) connect(mirrorOnly);
    }
  }

  async function teardown() {
    isDisposed = true;
    cancelPending?.();
    unsubscribeCalm?.();
    unsubscribeCalm = null;
    // The bridge keeps its values: the page owns them, not the session.
    disconnectBridge();
    tierStore.reset();
    delete wrapper.dataset.tier;
    delete wrapper.dataset.tierReason;
    delete wrapper.dataset.ready;
    delete wrapper.dataset.look;
    delete wrapper.dataset.fps;
    delete wrapper.dataset.chapter;
    wrapper.style.removeProperty("--field-veil");

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
