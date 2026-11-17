import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { paletteCopy } from "@/content/palette";
import type { EggId } from "@/engine/types";
import { createOverlayStore, overlayStore } from "@/lib/overlay-store";

import {
  createTypedEggs,
  InterfaceKeys,
  isPaletteShortcut,
  KEY_PAUSE_MS,
  startInterfaceKeys,
} from "./interface-keys";

const mocks = vi.hoisted(() => ({ requestEgg: vi.fn() }));
vi.mock("@/lib/eggs", () => ({ requestEgg: mocks.requestEgg }));

type KeyInit = KeyboardEventInit & { key: string };

function key(init: KeyInit): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe("typed eggs", () => {
  it("REQ-NAV-05 g g and f l i p spell their eggs, in either case", () => {
    let time = 0;
    const typed = createTypedEggs(() => time);
    const spell = (word: string) =>
      [...word].map((letter) => {
        time += 100;
        return typed.key(letter);
      });

    expect(spell("gg")).toEqual([null, "gg"]);
    expect(spell("flip")).toEqual([null, null, null, "flip"]);
    expect(spell("GG")).toEqual([null, "gg"]);
    expect(spell("ggg")).toEqual([null, "gg", null]);
    expect(spell("flap")).toEqual([null, null, null, null]);
  });

  it("REQ-NAV-05 a pause over 1 s between two keys starts the word again", () => {
    let time = 0;
    const typed = createTypedEggs(() => time);
    typed.key("g");
    time += KEY_PAUSE_MS + 1;
    expect(typed.key("g")).toBeNull();
    time += KEY_PAUSE_MS;
    expect(typed.key("g")).toBe("gg");
  });

  it("REQ-NAV-05 Shift between letters keeps the word; any other key breaks it", () => {
    let time = 0;
    const typed = createTypedEggs(() => (time += 50));
    typed.key("f");
    typed.key("Shift");
    typed.key("l");
    typed.key("i");
    expect(typed.key("p")).toBe("flip");

    typed.key("g");
    typed.key("Tab");
    expect(typed.key("g")).toBeNull();
    typed.reset();
    typed.key("g");
    typed.reset();
    expect(typed.key("g")).toBeNull();
  });
});

describe("the palette's key", () => {
  it.each([
    [{ key: "k", ctrlKey: true }, false, true],
    [{ key: "K", ctrlKey: true }, false, true],
    [{ key: "k", metaKey: true }, true, true],
    [{ key: "k", metaKey: true }, false, false],
    [{ key: "k", ctrlKey: true }, true, false],
    [{ key: "k", ctrlKey: true, shiftKey: true }, false, false],
    [{ key: "k", ctrlKey: true, altKey: true }, false, false],
    [{ key: "k", ctrlKey: true, metaKey: true }, false, false],
    [{ key: "k" }, false, false],
    [{ key: "ن", code: "KeyK", ctrlKey: true }, false, true],
    [{ key: "t", code: "KeyK", ctrlKey: true }, false, false],
  ])(
    "REQ-NAV-04 %j on an Apple platform %s is the shortcut: %s",
    (init, apple, expected) => {
      expect(isPaletteShortcut(key(init), apple)).toBe(expected);
    },
  );
});

describe("interface keys", () => {
  let stop: () => void;
  let overlay: ReturnType<typeof createOverlayStore>;
  let requestEgg: ReturnType<typeof vi.fn<(egg: EggId) => never>>;
  let time: number;
  let isCalm: boolean;
  let calmListeners: Set<() => void>;

  function setCalm(on: boolean) {
    isCalm = on;
    for (const listener of calmListeners) listener();
  }

  function press(init: KeyInit, target: EventTarget = document.body) {
    time += 100;
    const event = key(init);
    target.dispatchEvent(event);
    return event;
  }

  function type(word: string, target: EventTarget = document.body) {
    for (const letter of word) press({ key: letter }, target);
  }

  beforeEach(() => {
    time = 0;
    isCalm = false;
    calmListeners = new Set();
    overlay = createOverlayStore();
    requestEgg = vi.fn<(egg: EggId) => never>();
    stop = startInterfaceKeys(window, {
      overlay,
      requestEgg,
      calm: {
        getSnapshot: () => ({ calm: isCalm, system: false, chosen: isCalm }),
        subscribe: (listener) => {
          calmListeners.add(listener);
          return () => calmListeners.delete(listener);
        },
      },
      apple: false,
      now: () => time,
    });
  });

  afterEach(() => {
    stop();
    document.documentElement.removeAttribute("data-loader");
    document.body.replaceChildren();
  });

  it("REQ-NAV-04 Ctrl K opens the palette and stops the browser's own, and pressed again closes it", () => {
    const first = press({ key: "k", ctrlKey: true });
    expect(first.defaultPrevented).toBe(true);
    expect(overlay.getSnapshot()).toBe("palette");

    press({ key: "k", ctrlKey: true });
    expect(overlay.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-04 a held Ctrl K opens the palette once, and its repeats still keep the browser's own away", () => {
    press({ key: "k", ctrlKey: true });
    const repeat = press({ key: "k", ctrlKey: true, repeat: true });
    expect(repeat.defaultPrevented).toBe(true);
    expect(overlay.getSnapshot()).toBe("palette");
  });

  it("REQ-NAV-04 Ctrl K works inside a text field and inside the open menu, where it switches to the palette", () => {
    const input = document.createElement("input");
    document.body.append(input);
    press({ key: "k", ctrlKey: true }, input);
    expect(overlay.getSnapshot()).toBe("palette");
    overlay.close();

    overlay.open("menu");
    const link = document.createElement("a");
    link.href = "/work";
    document.body.append(link);
    press({ key: "k", ctrlKey: true }, link);
    expect(overlay.getSnapshot()).toBe("palette");
  });

  it("REQ-NAV-04 Ctrl K is heard before anything on the page can stop it", () => {
    const field = document.createElement("div");
    document.body.append(field);
    field.addEventListener("keydown", (event) => event.stopPropagation());
    press({ key: "k", ctrlKey: true }, field);
    expect(overlay.getSnapshot()).toBe("palette");
  });

  it("REQ-LOAD-01 while the loader's cover holds the page, Ctrl K is left to the browser", () => {
    document.documentElement.setAttribute("data-loader", "up");
    const event = press({ key: "k", ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    expect(overlay.getSnapshot()).toBeNull();

    document.documentElement.setAttribute("data-loader", "done");
    press({ key: "k", ctrlKey: true });
    expect(overlay.getSnapshot()).toBe("palette");
  });

  it("REQ-NAV-05 typing gg or flip on the page asks for that egg", () => {
    type("gg");
    type("flip");
    expect(requestEgg.mock.calls).toEqual([["gg"], ["flip"]]);
  });

  it.each(["input", "textarea", "select"])(
    "REQ-NAV-05 typed eggs never fire inside a %s",
    (tag) => {
      const field = document.createElement(tag);
      document.body.append(field);
      type("gg", field);
      type("flip", field);
      expect(requestEgg).not.toHaveBeenCalled();
    },
  );

  it("REQ-NAV-05 typed eggs never fire inside an editable region, but do in one switched off", () => {
    const region = document.createElement("div");
    region.setAttribute("contenteditable", "");
    const inner = document.createElement("span");
    region.append(inner);
    const off = document.createElement("div");
    off.setAttribute("contenteditable", "false");
    document.body.append(region, off);

    type("gg", inner);
    expect(requestEgg).not.toHaveBeenCalled();
    type("gg", off);
    expect(requestEgg).toHaveBeenCalledExactlyOnceWith("gg");
  });

  it.each(["ctrlKey", "altKey", "metaKey"] as const)(
    "REQ-NAV-05 a letter typed with %s held breaks the word",
    (modifier) => {
      press({ key: "g" });
      press({ key: "g", [modifier]: true });
      press({ key: "g" });
      expect(requestEgg).not.toHaveBeenCalled();
    },
  );

  it("REQ-NAV-05 a key the page took, a repeat or a pause over 1 s never makes a word", () => {
    const taker = document.createElement("div");
    document.body.append(taker);
    taker.addEventListener("keydown", (event) => event.preventDefault());
    press({ key: "g" });
    press({ key: "g" }, taker);
    expect(requestEgg).not.toHaveBeenCalled();

    press({ key: "g", repeat: true });
    expect(requestEgg).not.toHaveBeenCalled();

    time += KEY_PAUSE_MS;
    press({ key: "g" });
    expect(requestEgg).not.toHaveBeenCalled();
    press({ key: "g" });
    expect(requestEgg).toHaveBeenCalledExactlyOnceWith("gg");
  });

  it("REQ-NAV-05 with an overlay open the field is covered, so typing asks for nothing", () => {
    overlay.open("menu");
    type("gg");
    overlay.close();
    press({ key: "g" });
    expect(requestEgg).not.toHaveBeenCalled();
  });

  it("REQ-NAV-05 REQ-A11Y-04 calm mode turns the typed eggs off: letters ask for nothing, so nothing is said, and a word does not carry over (WCAG 2.1.4)", () => {
    setCalm(true);
    type("gg");
    type("flip");
    press({ key: "g" });
    setCalm(false);
    press({ key: "g" });
    expect(requestEgg).not.toHaveBeenCalled();
    press({ key: "g" });
    expect(requestEgg).toHaveBeenCalledExactlyOnceWith("gg");
  });

  it("REQ-NAV-05 REQ-A11Y-04 a letter typed before calm went on and off, with no key between, never joins one typed after (D-180)", () => {
    press({ key: "g" });
    setCalm(true);
    setCalm(false);
    press({ key: "g" });
    expect(requestEgg).not.toHaveBeenCalled();
    press({ key: "g" });
    expect(requestEgg).toHaveBeenCalledExactlyOnceWith("gg");
  });

  it("REQ-NAV-04 calm mode leaves Ctrl K alone", () => {
    isCalm = true;
    press({ key: "k", ctrlKey: true });
    expect(overlay.getSnapshot()).toBe("palette");
  });

  it("REQ-NAV-04 the teardown removes both listeners and stops listening to calm", () => {
    expect(calmListeners.size).toBe(1);
    stop();
    expect(calmListeners.size).toBe(0);
    press({ key: "k", ctrlKey: true });
    type("gg");
    expect(overlay.getSnapshot()).toBeNull();
    expect(requestEgg).not.toHaveBeenCalled();
  });
});

describe("InterfaceKeys", () => {
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.requestEgg.mockReset();
  });

  afterEach(() => {
    overlayStore.close();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("REQ-NAV-04 REQ-NAV-05 renders only an empty polite status, listens while mounted and stops on unmount", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<InterfaceKeys />);
    });
    const status = container.querySelector('[role="status"]');
    expect(container.childNodes).toHaveLength(1);
    expect(status?.className).toBe("sr-only");
    expect(status?.textContent).toBe("");

    document.body.dispatchEvent(key({ key: "k", ctrlKey: true }));
    expect(overlayStore.getSnapshot()).toBe("palette");
    overlayStore.close();
    mocks.requestEgg.mockReturnValue({ played: true });
    for (const letter of "gg") {
      document.body.dispatchEvent(key({ key: letter }));
    }
    expect(mocks.requestEgg).toHaveBeenCalledExactlyOnceWith("gg");
    expect(status?.textContent).toBe("");

    // A typed egg that cannot play says why there, as the palette would.
    mocks.requestEgg.mockReturnValue({ played: false, reason: "no-field" });
    await act(async () => {
      for (const letter of "flip") {
        document.body.dispatchEvent(key({ key: letter }));
      }
    });
    // jsdom sits on "/", a field page whose field has not drawn.
    expect(status?.textContent).toBe(paletteCopy.eggRefusals["no-field-yet"]);

    await act(async () => {
      root.unmount();
    });
    document.body.dispatchEvent(key({ key: "k", ctrlKey: true }));
    expect(overlayStore.getSnapshot()).toBeNull();
  });
});
