// What the visitor has written in the contact form, for the contact sky's
// trace (D-146): how many words, how far into the one being typed, and when
// Send was pressed. The form arrives at P6 and calls setText and send; until
// then nothing writes here and the sky traces nothing. Plain numbers, no
// engine code, so the form can import it at no cost.

export type SkyMessage = {
  /** Words written, the one being typed among them. */
  words: number;
  /** Letters of the word being typed; 0 after a space. */
  letters: number;
  /** When Send was last pressed, on the performance clock; null before. */
  sentAt: number | null;
};

export type SkyMessageStore = {
  getSnapshot(): SkyMessage;
  /** The text of the fields the trace counts (the name and the message). */
  setText(text: string): void;
  /** Send was pressed. */
  send(): void;
  reset(): void;
  subscribe(listener: () => void): () => void;
};

/** Words in a text, and the letters of the word being typed (0 after a space). */
export function countWords(text: string): { words: number; letters: number } {
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;
  const last = /(\S+)$/.exec(text);
  return { words, letters: last ? (last[1]?.length ?? 0) : 0 };
}

const EMPTY: SkyMessage = { words: 0, letters: 0, sentAt: null };

export function createSkyMessage(
  now: () => number = () => performance.now(),
): SkyMessageStore {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();
  const set = (next: SkyMessage) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    setText(text) {
      const { words, letters } = countWords(text);
      if (words === snapshot.words && letters === snapshot.letters) return;
      set({ ...snapshot, words, letters });
    },
    send() {
      set({ ...snapshot, sentAt: now() });
    },
    reset() {
      set(EMPTY);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const skyMessage = createSkyMessage();
