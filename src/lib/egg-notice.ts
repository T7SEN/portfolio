/** The latest refusal said aloud, a new id each time so a repeat is heard. */
export type EggNoticeSnapshot = { id: number; text: string } | null;

export type EggNotice = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): EggNoticeSnapshot;
  getServerSnapshot(): null;
  say(text: string): void;
};

// A plain store with no React import: the keys, the logo's long press and
// the status region that reads it never import each other.
export function createEggNotice(): EggNotice {
  const listeners = new Set<() => void>();
  let snapshot: EggNoticeSnapshot = null;
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => null,
    say(text) {
      snapshot = { id: (snapshot?.id ?? 0) + 1, text };
      for (const listener of [...listeners]) listener();
    },
  };
}

export const eggNotice = createEggNotice();
