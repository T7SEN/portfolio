import { describe, expect, it, vi } from "vitest";

import * as catalogue from "@/engine/sky/catalogue";
import * as maths from "@/engine/sky/sky";
import type { ChapterId, SkyView } from "@/engine/types";
import type { SkyMessage } from "@/lib/sky-message";

import { TAP_HOLD_MS, startContactSky } from "./contact-sky-session";

const JAN_15 = Date.parse("2026-01-15T16:00:00Z");
const WIDTH = 1280;
const HEIGHT = 800;
const HORIZON = maths.skyFrame(WIDTH, HEIGHT).horizon;
const ORION = catalogue.SKY_CONSTELLATIONS.indexOf("Ori");

/** Orion's centre on the frame the session works out, with no turn. */
function orionCentre() {
  const sky = maths.prepareSky(
    {
      stars: catalogue.SKY_STARS,
      segments: catalogue.SKY_SEGMENTS,
      constellations: catalogue.SKY_CONSTELLATIONS,
    },
    JAN_15,
  );
  const placed = maths.placeSky(
    sky,
    JAN_15,
    maths.skyFrame(WIDTH, HEIGHT),
    { turn: 0, tilt: 0 },
    maths.createPlaced(sky.count),
  );
  const view = maths
    .constellationsInView(sky, placed)
    .find((constellation) => constellation.index === ORION);
  if (view === undefined) throw new Error("Orion is not in view");
  return view;
}

type Listener = (event: unknown) => void;

function mount(
  options: {
    calm?: boolean;
    message?: SkyMessage;
    covers?: Array<{
      left: number;
      top: number;
      right: number;
      bottom: number;
    }>;
    story?: { chapter: ChapterId; progress: number } | null;
  } = {},
) {
  const listeners = new Map<string, Set<Listener>>();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  const clock = { perf: 1000, wall: JAN_15 };
  const target = {
    innerWidth: WIDTH,
    innerHeight: HEIGHT,
    document: {
      hidden: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    performance: { now: () => clock.perf },
    addEventListener(type: string, listener: Listener) {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    requestAnimationFrame(callback: FrameRequestCallback) {
      const id = nextFrame;
      nextFrame += 1;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
  } as unknown as Window;

  let onNear: (near: boolean) => void = () => undefined;
  const section = document.createElement("section");
  const label = document.createElement("div");
  const name = document.createElement("span");
  const views: Array<SkyView | null> = [];
  const state = {
    calm: options.calm ?? false,
    message: options.message ?? { words: 0, letters: 0, sentAt: null },
    covers: options.covers ?? [],
    story:
      options.story === undefined
        ? { chapter: "contact" as ChapterId, progress: 0.5 }
        : options.story,
  };
  const stop = startContactSky({
    catalogue,
    maths,
    section,
    label,
    name,
    names: { Ori: "Orion" },
    horizon: () => HORIZON,
    covered: () => state.covers,
    story: () => state.story,
    calm: () => state.calm,
    message: () => state.message,
    send: (view) => views.push(view),
    near: (_, onChange) => {
      onNear = onChange;
      return () => undefined;
    },
    target,
    now: () => clock.perf,
    clock: () => clock.wall,
  });

  const run = (count = 1, ms = 16) => {
    for (let index = 0; index < count; index += 1) {
      clock.perf += ms;
      clock.wall += ms;
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback(clock.perf);
    }
  };
  const dispatch = (type: string, event: unknown) => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };
  const last = () => views.at(-1);
  return {
    stop,
    run,
    dispatch,
    last,
    views,
    label,
    name,
    state,
    clock,
    near: (value: boolean) => onNear(value),
    frames,
  };
}

describe("the contact sky on the page (D-146, D-147)", () => {
  it("D-147 sends the sky's view on every frame while the chapter is near, and null once it leaves", () => {
    const sky = mount();
    sky.run();
    expect(sky.views).toEqual([]);

    sky.near(true);
    sky.run(2);
    const view = sky.last();
    expect(view?.turn).toBe(0);
    expect(view?.tilt).toBe(0);
    expect(view?.reveal).toHaveLength(catalogue.SKY_CONSTELLATIONS.length);
    expect(view?.trace).toBeNull();
    expect(view?.at).toBeGreaterThanOrEqual(JAN_15);

    sky.near(false);
    expect(sky.last()).toBeNull();
    expect(sky.label.style.opacity).toBe("0");
    const count = sky.views.length;
    sky.run(3);
    expect(sky.views).toHaveLength(count);
  });

  it("REQ-SCR-06 the head turn follows the pointer, eased, up to its reach", () => {
    const sky = mount();
    sky.near(true);
    sky.run();
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: WIDTH,
      clientY: 0,
    });
    sky.run(2);
    const early = sky.last()?.turn ?? 0;
    sky.run(120);
    const settled = sky.last();
    expect(early).toBeLessThan(settled?.turn ?? 0);
    expect(settled?.turn).toBeCloseTo(maths.SKY_VIEW.turnDegrees, 1);
    expect(settled?.tilt).toBeCloseTo(maths.SKY_VIEW.tiltDegrees, 1);
  });

  it("D-146 a constellation's lines and name show where the pointer settles", () => {
    const sky = mount();
    const orion = orionCentre();
    sky.near(true);
    sky.run();
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBeGreaterThan(0.9);
    expect(sky.name.textContent).toBe("Orion");
    expect(Number(sky.label.style.opacity)).toBeGreaterThan(0.9);

    // The pointer leaves the window: the lines and the name fade.
    sky.dispatch("pointerout", { relatedTarget: null });
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBeLessThan(0.1);
    expect(sky.label.style.opacity).toBe("0");
  });

  it("D-146 nothing is named or drawn before the contact chapter, and names wait for the sky to gather there", () => {
    const orion = orionCentre();
    const sky = mount({ story: { chapter: "about", progress: 0.9 } });
    sky.near(true);
    sky.run();
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    // Near, so the view is already sent, but nothing shows yet.
    expect(sky.last()?.reveal[ORION]).toBe(0);
    expect(sky.label.style.opacity).toBe("0");

    // The contact chapter's top: the sky has not gathered.
    sky.state.story = { chapter: "contact", progress: 0 };
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBe(0);
    expect(sky.label.style.opacity).toBe("0");

    // A quarter in, it has: the name shows.
    sky.state.story = { chapter: "contact", progress: maths.SKY_GATHER };
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBeGreaterThan(0.9);
    expect(sky.name.textContent).toBe("Orion");
    expect(Number(sky.label.style.opacity)).toBeGreaterThan(0.9);

    // Back up into the about chapter: the name goes at once.
    sky.state.story = { chapter: "about", progress: 0.9 };
    sky.run();
    expect(sky.label.style.opacity).toBe("0");
  });

  it("D-146 a constellation behind the contact panel or a plate behind text is not named, drawn or traced", () => {
    const orion = orionCentre();
    const box = {
      left: orion.x - 40,
      top: orion.y - 40,
      right: orion.x + 40,
      bottom: orion.y + 40,
    };
    const sky = mount({
      covers: [box],
      message: { words: 50, letters: 0, sentAt: null },
    });
    sky.near(true);
    sky.run();
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBe(0);
    expect(sky.last()?.trace?.constellation).not.toBe(ORION);
    expect(sky.name.textContent).not.toBe("Orion");

    // The box moves away, as the page scrolls: Orion draws again.
    sky.state.covers = [];
    sky.run(150);
    expect(sky.last()?.reveal[ORION]).toBeGreaterThan(0.9);
  });

  it("D-146 the name sits above its constellation, or below it where something stands in front of the sky above", () => {
    const orion = orionCentre();
    const sky = mount();
    sky.near(true);
    sky.run();
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    // The head turn moves the sky a pixel or two from its place at rest.
    const top = () => parseFloat(sky.label.style.top);
    expect(Math.abs(top() - (orion.top - 34))).toBeLessThan(3);

    sky.state.covers = [
      {
        left: orion.x - 40,
        top: orion.top - 40,
        right: orion.x + 40,
        bottom: orion.top - 20,
      },
    ];
    sky.run();
    expect(sky.name.textContent).toBe("Orion");
    expect(Math.abs(top() - (orion.bottom + 14))).toBeLessThan(3);
  });

  it("D-146 a tap on the sky names the constellation there for a while; a tap on the form or a link does not", () => {
    const sky = mount();
    const orion = orionCentre();
    sky.near(true);
    sky.run();

    const form = document.createElement("div");
    form.dataset.stage = "contact";
    sky.dispatch("pointerdown", {
      pointerType: "touch",
      target: form,
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    expect(sky.label.style.opacity).toBe("0");

    sky.dispatch("pointerdown", {
      pointerType: "touch",
      target: document.body,
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    expect(sky.name.textContent).toBe("Orion");
    expect(Number(sky.label.style.opacity)).toBeGreaterThan(0.9);

    sky.run(Math.ceil(TAP_HOLD_MS / 16) + 150);
    expect(sky.label.style.opacity).toBe("0");
  });

  it("REQ-A11Y-03 calm holds the moment, turns nothing and draws no lines in the field", () => {
    const sky = mount({ calm: true });
    const orion = orionCentre();
    sky.near(true);
    sky.run();
    const at = sky.last()?.at;
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: orion.x,
      clientY: orion.y,
    });
    sky.run(150);
    const view = sky.last();
    expect(view?.at).toBe(at);
    expect(view?.turn).toBe(0);
    expect(view?.tilt).toBe(0);
    expect(view?.reveal.every((value) => value === 0)).toBe(true);
    // The name still fades in: a fade is allowed (REQ-A11Y-03).
    expect(sky.name.textContent).toBe("Orion");
  });

  it("REQ-A11Y-03 calm sends no trace, so the words draw no lines in a calm still", () => {
    const sky = mount({
      calm: true,
      message: { words: 4, letters: 0, sentAt: null },
    });
    sky.near(true);
    sky.run(2);
    expect(sky.last()?.trace).toBeNull();
    sky.state.calm = false;
    sky.run(2);
    expect(sky.last()?.trace?.done).toBe(4);
  });

  it("D-146 the words trace the brightest whole constellation, and Send lights it and names it", () => {
    const sky = mount({ message: { words: 4, letters: 0, sentAt: null } });
    sky.near(true);
    sky.run(2);
    const trace = sky.last()?.trace;
    expect(trace?.done).toBe(4);
    expect(trace?.partial).toBe(0);
    expect(trace?.flash).toBe(0);
    const traced = trace?.constellation ?? -1;
    expect(traced).toBeGreaterThanOrEqual(0);

    sky.state.message = { words: 4, letters: 0, sentAt: sky.clock.perf };
    sky.run(20);
    expect(sky.last()?.trace?.constellation).toBe(traced);
    expect(sky.last()?.trace?.flash).toBeGreaterThan(0);
    expect(Number(sky.label.style.opacity)).toBe(1);
  });

  it("REQ-ENG-07 the stop takes its listeners and frames away and sends null", () => {
    const sky = mount();
    sky.near(true);
    sky.run(2);
    sky.stop();
    expect(sky.last()).toBeNull();
    expect(sky.frames.size).toBe(0);
    const count = sky.views.length;
    sky.dispatch("pointermove", {
      pointerType: "mouse",
      clientX: 10,
      clientY: 10,
    });
    sky.run(5);
    expect(sky.views).toHaveLength(count);
  });
});
