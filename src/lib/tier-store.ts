import type { EngineEvent, FieldLook, Tier, TierReason } from "@/engine/types";

export type TierSnapshot = {
  /** Null until the engine has chosen a tier. */
  tier: Tier | null;
  reason: TierReason | null;
  /** The chosen tier has drawn its first frame, or shows its still. */
  ready: boolean;
  /** Particles the live field draws, from its ready event; null until then. */
  particles: number | null;
  /**
   * How the live field draws, from its ready event; null until then and on
   * tier 3. The making-of draws its live passes only on the halftone.
   */
  look: FieldLook | null;
};

export type TierStore = {
  getSnapshot(): TierSnapshot;
  getServerSnapshot(): TierSnapshot;
  subscribe(listener: () => void): () => void;
  apply(event: EngineEvent): void;
  reset(): void;
};

// What the static HTML assumes: no engine has reported, so every component
// renders its tier 3 state (REQ-CNT-10).
const INITIAL: TierSnapshot = Object.freeze({
  tier: null,
  reason: null,
  ready: false,
  particles: null,
  look: null,
});

// A plain store with no React import, read through useSyncExternalStore. The
// snapshot object changes only when a value does, as that hook requires.
export function createTierStore(): TierStore {
  let snapshot = INITIAL;
  const listeners = new Set<() => void>();

  function set(next: TierSnapshot) {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    apply(event) {
      switch (event.type) {
        case "tierChosen":
          // A tier is not ready until its own ready event arrives, so a
          // change of tier takes the field out of view until the new one has
          // drawn.
          set({
            tier: event.tier,
            reason: event.reason,
            ready: false,
            particles: null,
            look: null,
          });
          return;
        case "ready":
          if (snapshot.ready) return;
          set({
            ...snapshot,
            ready: true,
            particles: event.particles,
            look: event.look ?? null,
          });
          return;
        // The frame rate and the two loading signals (REQ-LOAD-01) say
        // nothing about the tier, so they make no new snapshot and wake no
        // listener.
        case "frameRate":
        case "rendererStarted":
        case "probeStarted":
          return;
        default: {
          // A new event type fails to compile here until it is sorted into
          // one of the cases above.
          const unsorted: never = event;
          return unsorted;
        }
      }
    },

    reset() {
      if (snapshot !== INITIAL) set(INITIAL);
    },
  };
}

export const tierStore = createTierStore();
