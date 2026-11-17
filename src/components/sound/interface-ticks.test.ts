import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOverlayStore } from "@/lib/overlay-store";
import { createSoundPanelStore } from "@/lib/sound-panel-store";
import { createSoundStore } from "@/lib/sound-store";

import {
  HOVER_GAP_MS,
  PRESS_MS,
  SCROLL_QUIET_MS,
  startInterfaceTicks,
} from "./interface-ticks";
import type { SoundSession } from "./sound-session";

// The store as the listener sees it: each tick asked for, in order, and the
// count of press ticks it keeps.
function fakeSound() {
  const heard: string[] = [];
  let asked = 0;
  return {
    heard,
    sound: {
      tick: vi.fn((kind: string) => {
        if (kind !== "hover") asked += 1;
        heard.push(kind);
      }),
      ticksAsked: () => asked,
    },
  };
}

let stop: (() => void) | null = null;
const clock = { at: 10_000 };

function start(sound = fakeSound()) {
  const overlay = createOverlayStore(() => document);
  const panel = createSoundPanelStore();
  stop = startInterfaceTicks(window, {
    sound: sound.sound,
    overlay,
    panel,
    now: () => clock.at,
  });
  return { ...sound, overlay, panel };
}

function add<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  parent: HTMLElement = document.body,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  parent.append(element);
  return element;
}

function pointer(
  type: string,
  target: EventTarget,
  pointerType = "mouse",
  init: MouseEventInit = {},
) {
  const event = new MouseEvent(type, { bubbles: true, ...init });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  target.dispatchEvent(event);
}

// A whole press as a browser sends it: pointerdown, then the click.
function press(target: EventTarget) {
  pointer("pointerdown", target);
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function hover(target: EventTarget, pointerType = "mouse") {
  pointer("pointerover", target, pointerType);
}

beforeEach(() => {
  vi.useFakeTimers();
  clock.at = 10_000;
});

afterEach(() => {
  stop?.();
  stop = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("interface ticks, presses", () => {
  it("REQ-SND-03 a click on a link, a button or anything inside one ticks select", () => {
    const { heard } = start();
    const link = add("a", { href: "/work" });
    const button = add("button");
    const words = add("span", {}, button);
    press(link);
    press(button);
    press(words);
    expect(heard).toEqual(["select", "select", "select"]);
  });

  it("REQ-SND-03 switches, options, tabs, a summary, checkboxes and radios tick; plain text, a text field and a disabled control do not", () => {
    const { heard } = start();
    for (const target of [
      add("div", { role: "switch" }),
      add("div", { role: "option" }),
      add("div", { role: "tab" }),
      add("summary"),
      add("input", { type: "checkbox" }),
      add("input", { type: "radio" }),
    ]) {
      press(target);
    }
    expect(heard).toHaveLength(6);
    press(add("p"));
    press(add("input", { type: "text" }));
    press(add("a"));
    press(add("button", { disabled: "" }));
    press(add("div", { role: "button", "aria-disabled": "true" }));
    expect(heard).toHaveLength(6);
  });

  it("REQ-SND-03 REQ-A11Y-02 Enter or Space on a focused control, which arrives as a click, ticks once", () => {
    const { heard } = start();
    const button = add("button");
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // A screen reader's click, with no key or pointer before it.
    clock.at += PRESS_MS + 1;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(heard).toEqual(["select", "select"]);
  });

  it("REQ-SND-03 a click that opens a dialog plays open only, and one that closes it close only", () => {
    const { heard, overlay } = start();
    const menu = add("button");
    menu.addEventListener("click", () => overlay.open("menu"));
    press(menu);
    expect(heard).toEqual(["open"]);
    vi.advanceTimersByTime(0);

    const row = add("a", { href: "/work/coup-online" });
    row.addEventListener("click", () => overlay.close());
    press(row);
    expect(heard).toEqual(["open", "close"]);
  });

  it("REQ-SND-03 a press outside a sound panel that lands on a link plays the close alone", () => {
    const { heard, panel } = start();
    panel.open("pill");
    vi.advanceTimersByTime(0);
    heard.length = 0;
    const link = add("a", { href: "/about" });
    // The panel closes on the pointerdown, the link's click follows.
    document.addEventListener("pointerdown", () => panel.close("pill"));
    press(link);
    expect(heard).toEqual(["close"]);
  });

  it("REQ-SND-03 one press, one tick: Menu pressed outside an open sound panel plays the menu's open alone, though the panel closed at the pointerdown", () => {
    const { heard, overlay, panel } = start();
    panel.open("bar");
    vi.advanceTimersByTime(0);
    heard.length = 0;
    const menu = add("button");
    menu.addEventListener("click", () => overlay.open("menu"));
    const closeOutside = () => panel.close("bar");
    document.addEventListener("pointerdown", closeOutside);
    pointer("pointerdown", menu);
    // A browser sends the click in a task of its own.
    vi.advanceTimersByTime(0);
    expect(heard).toEqual([]);
    pointer("pointerup", menu);
    menu.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(heard).toEqual(["open"]);
    vi.advanceTimersByTime(PRESS_MS);
    expect(heard).toEqual(["open"]);
    document.removeEventListener("pointerdown", closeOutside);
  });

  it("REQ-SND-03 a press with no click plays its change once the pointer lifts, or at the latest after PRESS_MS", () => {
    const { heard, panel } = start();
    const page = add("div");
    const closeOutside = () => panel.close("bar");
    document.addEventListener("pointerdown", closeOutside);
    panel.open("bar");
    vi.advanceTimersByTime(0);
    heard.length = 0;
    pointer("pointerdown", page);
    pointer("pointerup", page);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(0);
    expect(heard).toEqual(["close"]);

    panel.open("bar");
    vi.advanceTimersByTime(0);
    heard.length = 0;
    pointer("pointerdown", page);
    vi.advanceTimersByTime(PRESS_MS - 1);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(heard).toEqual(["close"]);
    document.removeEventListener("pointerdown", closeOutside);
  });

  it("REQ-SND-03 REQ-NAV-04 a click whose handler ticked already (a palette row) is not ticked again", () => {
    const fake = fakeSound();
    const { heard } = start(fake);
    const option = add("div", { role: "option" });
    option.addEventListener("click", () => fake.sound.tick("select"));
    press(option);
    expect(heard).toEqual(["select"]);
  });

  it("REQ-SND-03 nothing ticks on scroll, the wheel or focus moving", () => {
    const { heard } = start();
    const button = add("button");
    window.dispatchEvent(new Event("scroll"));
    button.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    button.focus();
    button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(heard).toEqual([]);
  });
});

describe("interface ticks, dialogs", () => {
  it("REQ-SND-03 REQ-NAV-03 REQ-NAV-04 the menu, the palette and a sound panel each tick open and close, once each", () => {
    const { heard, overlay, panel } = start();
    overlay.open("menu");
    vi.advanceTimersByTime(0);
    // The menu handing over to the palette is one open.
    overlay.open("palette");
    vi.advanceTimersByTime(0);
    overlay.close();
    vi.advanceTimersByTime(0);
    overlay.close();
    panel.open("bar");
    vi.advanceTimersByTime(0);
    panel.close("bar");
    vi.advanceTimersByTime(0);
    expect(heard).toEqual(["open", "open", "close", "open", "close"]);
  });

  it("REQ-SND-03 one event, one tick: a palette opening over an open panel closes the panel in silence", () => {
    const { heard, overlay, panel } = start();
    panel.open("bar");
    vi.advanceTimersByTime(0);
    heard.length = 0;
    overlay.subscribe(() => panel.close("bar"));
    overlay.open("palette");
    expect(heard).toEqual(["open"]);
    vi.advanceTimersByTime(0);
    overlay.close();
    expect(heard).toEqual(["open", "close"]);
  });
});

describe("interface ticks, hover", () => {
  it("REQ-SND-03 a mouse reaching a link, a button or a switch ticks hover once, until it leaves", () => {
    const { heard } = start();
    const button = add("button");
    const words = add("span", {}, button);
    const link = add("a", { href: "/work" });
    const toggle = add("div", { role: "switch" });
    hover(button);
    hover(words);
    hover(button);
    expect(heard).toEqual(["hover"]);

    clock.at += HOVER_GAP_MS;
    hover(link);
    clock.at += HOVER_GAP_MS;
    hover(toggle);
    clock.at += HOVER_GAP_MS;
    // Out and back in: new again.
    hover(document.body);
    hover(toggle);
    expect(heard).toEqual(["hover", "hover", "hover", "hover"]);
    // Off the page altogether, then back.
    clock.at += HOVER_GAP_MS;
    pointer("pointerout", toggle, "mouse", { relatedTarget: null });
    hover(toggle);
    expect(heard).toHaveLength(5);
  });

  it("REQ-SND-03 at most one hover every 90 ms across the page", () => {
    const { heard } = start();
    const [first, second, third] = [add("button"), add("button"), add("a")];
    if (third === undefined) throw new Error("no link");
    third.setAttribute("href", "/");
    hover(first);
    clock.at += HOVER_GAP_MS - 1;
    hover(second);
    expect(heard).toEqual(["hover"]);
    clock.at += 1;
    hover(third);
    expect(heard).toEqual(["hover", "hover"]);
    expect(HOVER_GAP_MS).toBe(90);
  });

  it("REQ-SND-03 mouse only: touch and pen never hover, and neither does plain text or a held button", () => {
    const { heard } = start();
    const button = add("button");
    hover(button, "touch");
    hover(add("button"), "pen");
    hover(add("p"));
    pointer("pointerover", add("button"), "mouse", { buttons: 1 });
    expect(heard).toEqual([]);
  });

  it("REQ-SND-03 a control the page scrolls under a still mouse stays silent", () => {
    const { heard } = start();
    window.dispatchEvent(new Event("scroll"));
    clock.at += SCROLL_QUIET_MS - 1;
    hover(add("button"));
    expect(heard).toEqual([]);
    clock.at += 1;
    hover(add("button"));
    expect(heard).toEqual(["hover"]);
  });
});

describe("interface ticks, with the store", () => {
  class FakeContext {
    state: AudioContextState = "suspended";
    readonly sampleRate = 48_000;
    resume = vi.fn(() => {
      this.state = "running";
      return Promise.resolve();
    });
    suspend = vi.fn(() => Promise.resolve());
  }

  it("REQ-SND-01 REQ-SND-03 with Interface sounds off nothing plays and no AudioContext is made; turned on, the next press is heard", async () => {
    const createContext = vi.fn(
      () => new FakeContext() as unknown as AudioContext,
    );
    const tick = vi.fn();
    const store = createSoundStore({
      win: () => window,
      createContext,
      loadSession: () =>
        Promise.resolve({
          createSoundSession: () =>
            ({
              analyser: {} as AnalyserNode,
              play: vi.fn(),
              pause: vi.fn(),
              tick,
              dispose: vi.fn(),
            }) satisfies SoundSession,
        }),
      bridge: { setAudio: () => undefined },
    });
    const overlay = createOverlayStore(() => document);
    stop = startInterfaceTicks(window, {
      sound: store,
      overlay,
      panel: createSoundPanelStore(),
      now: () => clock.at,
    });
    const button = add("button");
    press(button);
    hover(button);
    overlay.open("menu");
    expect(createContext).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();

    store.toggleTicks();
    await vi.advanceTimersByTimeAsync(0);
    clock.at += PRESS_MS;
    press(add("a", { href: "/work" }));
    expect(tick).toHaveBeenLastCalledWith("select");
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});
