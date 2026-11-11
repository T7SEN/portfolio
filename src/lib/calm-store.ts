const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
// Remembered for the visit (accessibility.md section 6): the tab's session
// storage, which no server ever reads.
const STORAGE_KEY = "portfolio:calm";

export type CalmSnapshot = {
  /** What every motion decision reads: system or chosen. */
  calm: boolean;
  /** The OS asks for reduced motion (REQ-A11Y-03). */
  system: boolean;
  /** The visitor turned calm mode on with the toggle (REQ-A11Y-04). */
  chosen: boolean;
};

export type CalmStore = {
  getSnapshot(): CalmSnapshot;
  getServerSnapshot(): CalmSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * The toggle. It can only add calm: while the system asks for reduced
   * motion, calm stays on whatever the toggle says.
   */
  setChosen(on: boolean): void;
};

// What the static HTML assumes before any script runs: motion allowed,
// because CSS already honours the OS setting by itself (globals.css).
const INITIAL: CalmSnapshot = Object.freeze({
  calm: false,
  system: false,
  chosen: false,
});

function readChosen(storage: Storage | null): boolean {
  try {
    return storage?.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeChosen(storage: Storage | null, on: boolean) {
  try {
    if (on) storage?.setItem(STORAGE_KEY, "on");
    else storage?.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

function sessionStorageOf(win: Window): Storage | null {
  try {
    return win.sessionStorage;
  } catch {
    return null;
  }
}

// A plain store with no React import, read through useSyncExternalStore like
// the tier store. The media query is watched only while someone listens.
export function createCalmStore(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): CalmStore {
  const query = win?.matchMedia?.(REDUCED_MOTION) ?? null;
  const storage = win === undefined ? null : sessionStorageOf(win);
  const listeners = new Set<() => void>();
  let snapshot: CalmSnapshot | null = null;

  function compute(chosen: boolean): CalmSnapshot {
    const system = query?.matches ?? false;
    return { calm: system || chosen, system, chosen };
  }

  function current(): CalmSnapshot {
    snapshot ??= win === undefined ? INITIAL : compute(readChosen(storage));
    return snapshot;
  }

  function update(next: CalmSnapshot) {
    const previous = current();
    if (
      previous.calm === next.calm &&
      previous.system === next.system &&
      previous.chosen === next.chosen
    ) {
      return;
    }
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  const onSystemChange = () => update(compute(current().chosen));

  return {
    getSnapshot: current,
    getServerSnapshot: () => INITIAL,

    subscribe(listener) {
      if (listeners.size === 0) {
        query?.addEventListener("change", onSystemChange);
        // The setting may have changed while nobody listened.
        onSystemChange();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          query?.removeEventListener("change", onSystemChange);
        }
      };
    },

    setChosen(on) {
      writeChosen(storage, on);
      update(compute(on));
    },
  };
}

export const calmStore = createCalmStore();
