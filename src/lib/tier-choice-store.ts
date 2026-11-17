/**
 * The visitor's tier from the command palette (REQ-TIER-04, REQ-NAV-04):
 * auto leaves it to the decision table and the probe; 1, 2 or 3 forces it.
 */
export type TierChoice = "auto" | 1 | 2 | 3;

// Kept for the tab, like the calm toggle (calm-store.ts): session storage,
// which no server ever reads.
const STORAGE_KEY = "portfolio:tier";

export type TierChoiceStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): TierChoice;
  getServerSnapshot(): "auto";
  /** Anything that is not a choice is ignored. */
  set(choice: TierChoice): void;
};

function isTierChoice(value: unknown): value is TierChoice {
  return value === "auto" || value === 1 || value === 2 || value === 3;
}

function readChoice(storage: Storage | null): TierChoice {
  try {
    const value = Number(storage?.getItem(STORAGE_KEY));
    return value === 1 || value === 2 || value === 3 ? value : "auto";
  } catch {
    return "auto";
  }
}

function writeChoice(storage: Storage | null, choice: TierChoice) {
  try {
    if (choice === "auto") storage?.removeItem(STORAGE_KEY);
    else storage?.setItem(STORAGE_KEY, String(choice));
  } catch {
    // Storage can be blocked; the choice then lasts until the page reloads.
  }
}

function sessionStorageOf(win: Window | undefined): Storage | null {
  try {
    return win?.sessionStorage ?? null;
  } catch {
    return null;
  }
}

// A plain store with no React import, read through useSyncExternalStore by
// the palette and subscribed to by the engine session, which applies it.
export function createTierChoiceStore(
  win: Window | undefined = typeof window === "undefined" ? undefined : window,
): TierChoiceStore {
  const storage = sessionStorageOf(win);
  const listeners = new Set<() => void>();
  // Read on first use, so the server and the static HTML never touch it.
  let choice: TierChoice | null = null;

  function current(): TierChoice {
    choice ??= win === undefined ? "auto" : readChoice(storage);
    return choice;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: current,
    getServerSnapshot: () => "auto",
    set(next) {
      if (!isTierChoice(next) || next === current()) return;
      choice = next;
      writeChoice(storage, next);
      for (const listener of [...listeners]) listener();
    },
  };
}

export const tierChoiceStore = createTierChoiceStore();
