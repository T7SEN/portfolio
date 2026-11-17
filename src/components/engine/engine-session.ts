import type {
  ChapterId,
  Engine,
  EngineEvent,
  EngineOptions,
} from "@/engine/types";
import { calmStore, type CalmStore } from "@/lib/calm-store";
import { loaderStore, type LoaderStore } from "@/lib/loader-store";
import {
  storyBridge,
  type StoryBridge,
  type StoryTarget,
} from "@/lib/story-bridge";
import {
  tierChoiceStore,
  type TierChoice,
  type TierChoiceStore,
} from "@/lib/tier-choice-store";
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
  /** The home page's loader, fed the loading steps. Replaced in unit tests. */
  loader?: Pick<LoaderStore, "engineLoaded" | "apply" | "reset">;
  /** The palette's tier choice (REQ-TIER-04). Replaced in unit tests. */
  choice?: Pick<TierChoiceStore, "getSnapshot" | "subscribe">;
};

/**
 * The field's fade, as engine-host.tsx draws it (duration-700): a tier the
 * palette asks for is built once the field on screen has faded out.
 */
export const FIELD_FADE_MS = 700;

function logFailure(code: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`engine: ${code}`, error);
  }
}

/**
 * One engine for the life of the root layout. Every event goes to the tier
 * store and is mirrored on the wrapper as data attributes, written straight
 * to the element so a frame rate report never renders React. The chapter the
 * page sends is mirrored too, as data-chapter, on every tier. The loader
 * hears the engine module load and every event but the frame rate; the
 * engine loads when it did before the loader, whether or not a cover shows.
 */
export function createEngineSession(
  wrapper: HTMLElement,
  host: HTMLElement,
  {
    calm = calmStore,
    bridge = storyBridge,
    loader = loaderStore,
    choice = tierChoiceStore,
  }: EngineSessionOptions = {},
): EngineSession {
  let engine: Engine | null = null;
  let hasBegun = false;
  let isDisposed = false;
  let cancelPending: (() => void) | null = null;
  let disposing: Promise<void> | null = null;
  let isCalm: boolean | null = null;
  let unsubscribeCalm: (() => void) | null = null;
  let tierChoice: TierChoice | null = null;
  let unsubscribeChoice: (() => void) | null = null;
  // Set while a tier the palette asked for waits for the field's fade.
  let choiceTimer: ReturnType<typeof setTimeout> | null = null;
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
    // While a new tier waits for the fade, the flow on screen is ending: its
    // last choice or ready would bring the field back for a moment.
    if (
      choiceTimer !== null &&
      (event.type === "tierChosen" || event.type === "ready")
    ) {
      return;
    }

    if (event.type === "frameRate") {
      wrapper.dataset.fps = String(event.fps);
      return;
    }

    loader.apply(event);
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
  // mirrored, so the wrapper says where the story is on every tier. An egg
  // sent then has no field to reach and is dropped; the bridge keeps the
  // latest sound levels and hands them to the engine once it connects.
  const mirrorOnly: StoryTarget = {
    setStory: (chapter) => mirrorChapter(chapter),
    setStage: () => undefined,
    setPasses: () => undefined,
    setSky: () => undefined,
    setPointer: () => undefined,
    playEgg: () => undefined,
    setAudio: () => undefined,
    setVeil,
  };

  // The engine keeps the latest story, stage, passes, sky and pointer itself,
  // tier 3 included, and hands them to a GPU tier that a later setTier
  // brings back. Tier 3 and calm ignore eggs and sound levels by themselves.
  function forwardTo(live: Engine): StoryTarget {
    return {
      setStory(chapter, progress) {
        mirrorChapter(chapter);
        live.setStory(chapter, progress);
      },
      setStage: (stages) => live.setStage(stages),
      setPasses: (cards) => live.setPasses(cards),
      setSky: (view) => live.setSky(view),
      setPointer: (x, y, active) => live.setPointer(x, y, active),
      playEgg: (egg) => live.playEgg(egg),
      setAudio: (levels) => live.setAudio(levels),
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

  // A forced tier from the palette, or null for Auto, which hands the choice
  // back to the decision table and the probe. The field on screen fades out
  // first, and the headline, the readout and the palette hear at once that
  // no tier is drawn (A14); the new tier is built after the fade, so the old
  // canvas never vanishes in view, and fades in at its own ready. A second
  // choice during the fade replaces the first.
  function onChoiceChange() {
    const next = choice.getSnapshot();
    if (next === tierChoice) return;
    tierChoice = next;
    const live = engine;
    if (live === null) return;
    tierStore.unready();
    wrapper.dataset.ready = "false";
    if (choiceTimer !== null) clearTimeout(choiceTimer);
    choiceTimer = setTimeout(() => {
      choiceTimer = null;
      if (isDisposed || tierChoice === null) return;
      live.setTier(tierChoice === "auto" ? null : tierChoice);
    }, FIELD_FADE_MS);
  }

  async function begin() {
    if (hasBegun || isDisposed) return;
    hasBegun = true;

    try {
      const { createEngine } = await loadEngine();
      if (isDisposed) return;
      loader.engineLoaded();

      // Subscribed before the read, so a change of the OS setting made while
      // nobody listened is already counted.
      unsubscribeCalm = calm.subscribe(onCalmChange);
      isCalm = calm.getSnapshot().calm;
      unsubscribeChoice = choice.subscribe(onChoiceChange);
      tierChoice = choice.getSnapshot();
      const options: EngineOptions = { calm: isCalm };
      // A tier chosen earlier in the visit holds from the first frame.
      if (tierChoice !== "auto") options.forcedTier = tierChoice;
      engine = createEngine(host, options);
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
    unsubscribeChoice?.();
    unsubscribeChoice = null;
    if (choiceTimer !== null) clearTimeout(choiceTimer);
    choiceTimer = null;
    // The bridge keeps its values: the page owns them, not the session.
    disconnectBridge();
    tierStore.reset();
    loader.reset();
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
