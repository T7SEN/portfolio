import { describe, expect, it, vi } from "vitest";

import { createTierChoiceStore, type TierChoice } from "./tier-choice-store";

/** A window whose session storage the test holds, or one that throws. */
function fakeWindow(initial: Record<string, string> = {}, blocked = false) {
  const stored = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => {
      if (blocked) throw new Error("blocked");
      return stored.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (blocked) throw new Error("blocked");
      stored.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      if (blocked) throw new Error("blocked");
      stored.delete(key);
    }),
  };
  return { win: { sessionStorage: storage } as unknown as Window, stored };
}

describe("tier choice store", () => {
  it("REQ-TIER-04 starts on auto, on the server too", () => {
    const store = createTierChoiceStore(fakeWindow().win);
    expect(store.getSnapshot()).toBe("auto");
    expect(store.getServerSnapshot()).toBe("auto");
  });

  it.each([
    ["1", 1],
    ["2", 2],
    ["3", 3],
    ["4", "auto"],
    ["auto", "auto"],
    ["", "auto"],
  ])("REQ-TIER-04 a stored %j is read as %j", (stored, expected) => {
    const store = createTierChoiceStore(
      fakeWindow({ "portfolio:tier": stored }).win,
    );
    expect(store.getSnapshot()).toBe(expected);
  });

  it("REQ-TIER-04 a choice is kept for the tab under portfolio:tier, and auto removes it", () => {
    const { win, stored } = fakeWindow();
    const store = createTierChoiceStore(win);

    store.set(2);
    expect(store.getSnapshot()).toBe(2);
    expect(stored.get("portfolio:tier")).toBe("2");

    store.set("auto");
    expect(store.getSnapshot()).toBe("auto");
    expect(stored.has("portfolio:tier")).toBe(false);

    store.set(3);
    expect(createTierChoiceStore(win).getSnapshot()).toBe(3);
  });

  it("REQ-TIER-04 tells listeners of each change only, and an unsubscribe stops them", () => {
    const store = createTierChoiceStore(fakeWindow().win);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.set(1);
    store.set(1);
    store.set("auto");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.set(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("REQ-TIER-04 anything that is not a choice is ignored", () => {
    const store = createTierChoiceStore(fakeWindow().win);
    const listener = vi.fn();
    store.subscribe(listener);
    for (const value of [0, 4, "1", null, Number.NaN]) {
      store.set(value as unknown as TierChoice);
    }
    expect(store.getSnapshot()).toBe("auto");
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-TIER-04 with storage blocked, the choice still holds until the page reloads", () => {
    const { win } = fakeWindow({}, true);
    const store = createTierChoiceStore(win);
    expect(store.getSnapshot()).toBe("auto");
    store.set(2);
    expect(store.getSnapshot()).toBe(2);
  });

  it("REQ-TIER-04 a window whose session storage throws on access still works", () => {
    const win = {
      get sessionStorage(): Storage {
        throw new Error("denied");
      },
    } as unknown as Window;
    const store = createTierChoiceStore(win);
    store.set(1);
    expect(store.getSnapshot()).toBe(1);
  });
});
