/**
 * Which sound panel is open: the id of the pill that owns it (the bar's,
 * the menu's or the footer's), or null. Only one is ever open, so opening
 * one closes another.
 */
export type SoundPanelStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): string | null;
  getServerSnapshot(): null;
  open(id: string): void;
  /** Closes that pill's panel when it is the one open. */
  close(id: string): void;
};

// A plain store with no React import, like the overlay store: the pills,
// the hint and the tick listener all read it, so none imports another.
export function createSoundPanelStore(): SoundPanelStore {
  const listeners = new Set<() => void>();
  let open: string | null = null;

  function set(next: string | null) {
    if (next === open) return;
    open = next;
    for (const listener of [...listeners]) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => open,
    getServerSnapshot: () => null,
    open: (id) => set(id),
    close(id) {
      if (open === id) set(null);
    },
  };
}

export const soundPanelStore = createSoundPanelStore();
