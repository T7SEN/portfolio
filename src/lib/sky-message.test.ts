import { describe, expect, it, vi } from "vitest";

import { countWords, createSkyMessage } from "./sky-message";

describe("the contact sky's message (D-146)", () => {
  it("D-146 counts words, and the letters of the word being typed", () => {
    expect(countWords("We need a site")).toEqual({ words: 4, letters: 4 });
    expect(countWords("We need ")).toEqual({ words: 2, letters: 0 });
    expect(countWords("   ")).toEqual({ words: 0, letters: 0 });
    expect(countWords("Hi,\nthere")).toEqual({ words: 2, letters: 5 });
  });

  it("D-146 holds the words and when Send was pressed, telling listeners only of a change", () => {
    let clock = 100;
    const store = createSkyMessage(() => clock);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setText("A new");
    expect(store.getSnapshot()).toEqual({ words: 2, letters: 3, sentAt: null });
    store.setText("A new");
    expect(listener).toHaveBeenCalledTimes(1);

    clock = 250;
    store.send();
    expect(store.getSnapshot().sentAt).toBe(250);

    store.reset();
    expect(store.getSnapshot()).toEqual({ words: 0, letters: 0, sentAt: null });
    unsubscribe();
    store.setText("more words here");
    expect(listener).toHaveBeenCalledTimes(3);
  });
});
