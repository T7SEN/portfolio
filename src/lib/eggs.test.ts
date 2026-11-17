import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Tier } from "@/engine/types";

import { bindLongPress, createEggRequest, LONG_PRESS_MS } from "./eggs";
import { FIELD_ROUTES, isFieldRoute } from "./field-routes";

/** The stores and the window an egg request reads, all in the test's hand. */
function scene({
  pathname = "/",
  tier = 1 as Tier | null,
  ready = true,
  calm = false,
  cover = null as string | null,
} = {}) {
  const html = document.createElement("html");
  if (cover !== null) html.setAttribute("data-loader", cover);
  const view = {
    location: { pathname },
    document: { documentElement: html },
  } as unknown as Window;
  const playEgg = vi.fn();
  const request = createEggRequest({
    tier: {
      getSnapshot: () => ({
        tier,
        reason: null,
        ready,
        particles: null,
        look: null,
      }),
    },
    calm: { getSnapshot: () => ({ calm, system: false, chosen: calm }) },
    bridge: { playEgg },
    win: () => view,
  });
  return { request, playEgg };
}

describe("egg requests", () => {
  it("REQ-NAV-05 on the home route with a live field drawn and calm off, the egg is sent and counts as played", () => {
    for (const tier of [1, 2] as const) {
      const { request, playEgg } = scene({ tier });
      expect(request("gg")).toEqual({ played: true });
      expect(playEgg).toHaveBeenCalledExactlyOnceWith("gg");
    }
  });

  it.each([
    ["a route without the field", { pathname: "/work" }],
    ["the loader's cover up", { cover: "up" }],
    ["no tier chosen yet", { tier: null, ready: false }],
    ["a tier not drawn yet", { tier: 1 as Tier, ready: false }],
  ])(
    "REQ-NAV-05 A14 with %s, nothing is sent and the reason is no-field",
    (_name, setting) => {
      const { request, playEgg } = scene(setting);
      expect(request("flip")).toEqual({ played: false, reason: "no-field" });
      expect(playEgg).not.toHaveBeenCalled();
    },
  );

  it("REQ-NAV-05 a cover that has lifted no longer counts", () => {
    const { request } = scene({ cover: "done" });
    expect(request("mark")).toEqual({ played: true });
  });

  it("REQ-NAV-05 REQ-TIER-03 A14 tier 3's still plays nothing and says so, calm or not", () => {
    for (const calm of [false, true]) {
      const { request, playEgg } = scene({ tier: 3, calm });
      expect(request("mark")).toEqual({ played: false, reason: "still" });
      expect(playEgg).not.toHaveBeenCalled();
    }
  });

  it("REQ-NAV-05 REQ-A11Y-04 calm holds the field still, so no egg plays and the reason is calm", () => {
    const { request, playEgg } = scene({ tier: 2, calm: true });
    expect(request("gg")).toEqual({ played: false, reason: "calm" });
    expect(playEgg).not.toHaveBeenCalled();
  });

  it("REQ-NAV-05 with no window there is no field", () => {
    const playEgg = vi.fn();
    const request = createEggRequest({
      bridge: { playEgg },
      win: () => undefined,
    });
    expect(request("gg")).toEqual({ played: false, reason: "no-field" });
    expect(playEgg).not.toHaveBeenCalled();
  });

  it("REQ-CNT-02 the field routes are the one shared list: the home page only", () => {
    expect(FIELD_ROUTES).toEqual(["/"]);
    expect(isFieldRoute("/")).toBe(true);
    expect(isFieldRoute("/about")).toBe(false);
  });
});

describe("long press", () => {
  let link: HTMLAnchorElement;
  let onPress: ReturnType<typeof vi.fn<() => void>>;
  let unbind: () => void;
  let followed: ReturnType<typeof vi.fn<(event: Event) => void>>;

  function pointer(
    type: string,
    { x = 10, y = 10, id = 1, button = 0, isPrimary = true } = {},
  ) {
    link.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: id,
        button,
        isPrimary,
      }),
    );
  }

  /** Dispatches a click; true when nothing stopped or prevented it. */
  function click(target: Element = link): boolean {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  function contextMenu(): boolean {
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    link = document.createElement("a");
    link.href = "/";
    const mark = document.createElement("span");
    link.append(mark);
    document.body.append(link);
    followed = vi.fn((event: Event) => event.preventDefault());
    document.body.addEventListener("click", followed);
    onPress = vi.fn<() => void>();
    unbind = bindLongPress(link, onPress);
  });

  afterEach(() => {
    unbind();
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("REQ-NAV-05 a pointer held still for 600 ms is a long press, and the click after it is swallowed", () => {
    expect(LONG_PRESS_MS).toBe(600);
    pointer("pointerdown");
    vi.advanceTimersByTime(599);
    expect(onPress).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onPress).toHaveBeenCalledTimes(1);

    pointer("pointerup");
    const mark = link.firstElementChild;
    if (mark === null) throw new Error("The mark is missing");
    expect(click(mark)).toBe(false);
    expect(followed).not.toHaveBeenCalled();

    // The next press is its own: a short one is an ordinary click.
    pointer("pointerdown");
    vi.advanceTimersByTime(100);
    pointer("pointerup");
    click();
    expect(followed).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("REQ-NAV-05 a short press is a click and calls nothing", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(300);
    pointer("pointerup");
    vi.advanceTimersByTime(1000);
    expect(onPress).not.toHaveBeenCalled();
    click();
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it("REQ-NAV-05 REQ-SCR-02 a pointer that moves past 10 px is a drag or a scroll, not a press", () => {
    pointer("pointerdown", { x: 10, y: 10 });
    pointer("pointermove", { x: 16, y: 16 });
    vi.advanceTimersByTime(300);
    pointer("pointermove", { x: 10, y: 22 });
    vi.advanceTimersByTime(600);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(["pointercancel", "pointerleave"])(
    "REQ-NAV-05 a %s before the time ends the press",
    (type) => {
      pointer("pointerdown");
      vi.advanceTimersByTime(300);
      pointer(type);
      vi.advanceTimersByTime(600);
      expect(onPress).not.toHaveBeenCalled();
    },
  );

  it("REQ-NAV-05 only the primary pointer's main button counts", () => {
    pointer("pointerdown", { button: 2 });
    pointer("pointerdown", { id: 2, isPrimary: false });
    vi.advanceTimersByTime(1000);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("REQ-NAV-05 the context menu is swallowed while a press runs and just after it fires, never otherwise", () => {
    expect(contextMenu()).toBe(true);
    pointer("pointerdown");
    vi.advanceTimersByTime(500);
    expect(contextMenu()).toBe(false);
    vi.advanceTimersByTime(100);
    expect(contextMenu()).toBe(false);
    pointer("pointerup");
    vi.advanceTimersByTime(1000);
    expect(contextMenu()).toBe(true);
  });

  it("REQ-NAV-05 a release off the element with no click after it stops swallowing after a second", () => {
    pointer("pointerdown");
    vi.advanceTimersByTime(600);
    pointer("pointerleave");
    vi.advanceTimersByTime(1000);
    click();
    expect(followed).toHaveBeenCalledTimes(1);
  });

  it("REQ-NAV-05 unbind removes every listener and a press that runs", () => {
    pointer("pointerdown");
    unbind();
    vi.advanceTimersByTime(1000);
    pointer("pointerdown");
    vi.advanceTimersByTime(1000);
    expect(onPress).not.toHaveBeenCalled();
    expect(contextMenu()).toBe(true);
  });
});
