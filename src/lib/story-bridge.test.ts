import { describe, expect, it, vi } from "vitest";

import type { PassCard, SkyView, Stages } from "@/engine/types";

import { createStoryBridge, type StoryTarget } from "./story-bridge";

/** A target that records every command in one list, so order shows. */
function recorder() {
  const calls: string[] = [];
  const target = {
    setStory: vi.fn((chapter: string, progress: number) => {
      calls.push(`story ${chapter} ${progress}`);
    }),
    setPointer: vi.fn((x: number, y: number, active: boolean) => {
      calls.push(`pointer ${x} ${y} ${active}`);
    }),
    setStage: vi.fn((stages: Stages) => {
      calls.push(`stage ${Object.keys(stages).join(",")}`);
    }),
    setVeil: vi.fn((veil: number | null) => {
      calls.push(`veil ${veil}`);
    }),
    setPasses: vi.fn((cards: readonly PassCard[] | null) => {
      calls.push(
        `passes ${cards === null ? "none" : cards.map((card) => card.pass).join(",")}`,
      );
    }),
    setSky: vi.fn((view: SkyView | null) => {
      calls.push(`sky ${view === null ? "none" : view.at}`);
    }),
  } satisfies StoryTarget;
  return { calls, target };
}

/** A card whose face fills the screen's middle, in its corner order. */
function card(pass: PassCard["pass"], x = 0): PassCard {
  return {
    pass,
    corners: [
      { x: x - 0.2, y: 0.3 },
      { x: x + 0.2, y: 0.3 },
      { x: x + 0.2, y: -0.3 },
      { x: x - 0.2, y: -0.3 },
    ],
  };
}

describe("story bridge", () => {
  it("REQ-SCR-01 holds no story until the page sends one, then the latest", () => {
    const bridge = createStoryBridge();
    expect(bridge.getStory()).toBeNull();

    bridge.setStory("bloom", 0.4);
    expect(bridge.getStory()).toEqual({ chapter: "bloom", progress: 0.4 });
    bridge.setStory("work", 0.1);
    expect(bridge.getStory()).toEqual({ chapter: "work", progress: 0.1 });
  });

  it.each([
    [-0.5, 0],
    [1.5, 1],
    [Number.NaN, 0],
    [0, 0],
    [1, 1],
    [0.25, 0.25],
  ])("REQ-SCR-01 progress %s is held and sent as %s", (sent, expected) => {
    const bridge = createStoryBridge();
    const { target } = recorder();
    bridge.connect(target);

    bridge.setStory("about", sent);
    expect(bridge.getStory()?.progress).toBe(expected);
    expect(target.setStory).toHaveBeenLastCalledWith("about", expected);
  });

  it.each([
    [2, -3, 1, -1],
    [-1.5, 1.5, -1, 1],
    [Number.NaN, 0.5, 0, 0.5],
    [0.25, Number.NaN, 0.25, 0],
    [-1, 1, -1, 1],
  ])(
    "REQ-SCR-06 a pointer at %s, %s reaches the target at %s, %s",
    (x, y, expectedX, expectedY) => {
      const bridge = createStoryBridge();
      const { target } = recorder();
      bridge.connect(target);

      bridge.setPointer(x, y, true);
      expect(target.setPointer).toHaveBeenLastCalledWith(
        expectedX,
        expectedY,
        true,
      );
    },
  );

  it("REQ-SCR-01 forwards every value sent after the target connects", () => {
    const bridge = createStoryBridge();
    const { calls, target } = recorder();
    bridge.connect(target);

    bridge.setStory("hero", 1);
    bridge.setPointer(0.5, -0.5, true);
    bridge.setStory("bloom", 0.2);
    bridge.setPointer(0.5, -0.5, false);

    expect(calls).toEqual([
      "story hero 1",
      "pointer 0.5 -0.5 true",
      "story bloom 0.2",
      "pointer 0.5 -0.5 false",
    ]);
  });

  it("REQ-SCR-01 a target connected late gets only the latest story, then the latest pointer", () => {
    const bridge = createStoryBridge();
    bridge.setPointer(0.1, 0.1, true);
    bridge.setStory("hero", 0.5);
    bridge.setStory("bloom", 0.3);
    bridge.setPointer(0.2, -0.4, false);

    const { calls, target } = recorder();
    bridge.connect(target);
    expect(calls).toEqual(["story bloom 0.3", "pointer 0.2 -0.4 false"]);
  });

  it("REQ-SCR-01 a late target gets the stage before the story, and the veil last", () => {
    const bridge = createStoryBridge();
    const hero = { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 };
    bridge.setVeil(0.5);
    bridge.setStory("hero", 0.2);
    bridge.setStage({ hero });
    bridge.setPointer(0, 0, false);

    const { calls, target } = recorder();
    bridge.connect(target);
    expect(calls).toEqual([
      "stage hero",
      "story hero 0.2",
      "pointer 0 0 false",
      "veil 0.5",
    ]);
    expect(target.setStage).toHaveBeenCalledWith({ hero });
  });

  it.each([
    [0.35, 0.35],
    [-1, 0],
    [3, 1],
    [Number.NaN, 0],
    [null, null],
  ])("REQ-A11Y-06 a veil of %s reaches the target as %s", (sent, expected) => {
    const bridge = createStoryBridge();
    const { target } = recorder();
    bridge.connect(target);
    bridge.setVeil(sent);
    expect(target.setVeil).toHaveBeenLastCalledWith(expected);
  });

  it("REQ-SCR-01 the replay carries the clamped values", () => {
    const bridge = createStoryBridge();
    bridge.setStory("work", 7);
    bridge.setPointer(-9, 9, true);

    const { calls, target } = recorder();
    bridge.connect(target);
    expect(calls).toEqual(["story work 1", "pointer -1 1 true"]);
  });

  it("REQ-SCR-01 nothing is replayed when nothing was sent", () => {
    const bridge = createStoryBridge();
    const { calls, target } = recorder();
    bridge.connect(target);
    expect(calls).toEqual([]);
  });

  it("REQ-ENG-01 connecting a second target replaces the first", () => {
    const bridge = createStoryBridge();
    const first = recorder();
    const second = recorder();
    bridge.connect(first.target);
    bridge.setStory("hero", 0);

    bridge.connect(second.target);
    bridge.setStory("bloom", 0.5);

    expect(first.calls).toEqual(["story hero 0"]);
    expect(second.calls).toEqual(["story hero 0", "story bloom 0.5"]);
  });

  it("REQ-ENG-07 an older target's disconnect leaves the newer target connected", () => {
    const bridge = createStoryBridge();
    const first = recorder();
    const second = recorder();
    const disconnectFirst = bridge.connect(first.target);
    bridge.connect(second.target);

    disconnectFirst();
    bridge.setPointer(0, 0, true);
    expect(second.calls).toEqual(["pointer 0 0 true"]);
    expect(first.calls).toEqual([]);
  });

  it("REQ-ENG-07 a disconnect stops forwarding but keeps the values for the next target", () => {
    const bridge = createStoryBridge();
    const first = recorder();
    const disconnect = bridge.connect(first.target);

    disconnect();
    disconnect();
    bridge.setStory("contact", 0.9);
    expect(first.calls).toEqual([]);
    expect(bridge.getStory()).toEqual({ chapter: "contact", progress: 0.9 });

    const second = recorder();
    bridge.connect(second.target);
    expect(second.calls).toEqual(["story contact 0.9"]);
  });

  it("D-147 the sky reaches the target clamped, a broken view is dropped, and a later target hears the latest", () => {
    const bridge = createStoryBridge();
    const { calls, target } = recorder();
    bridge.connect(target);
    const view: SkyView = {
      at: 1000,
      turn: 1,
      tilt: 0,
      horizon: 300,
      reveal: [0.5, 2, -1],
      trace: { constellation: 59, done: 1, partial: 0.5, flash: 0 },
    };
    bridge.setSky(view);
    expect(target.setSky).toHaveBeenLastCalledWith({
      ...view,
      reveal: [0.5, 1, 0],
    });
    bridge.setSky({ ...view, at: Number.NaN });
    bridge.setSky(null);
    expect(calls).toEqual(["sky 1000", "sky none", "sky none"]);

    bridge.setSky({ ...view, at: 2000 });
    const later = recorder();
    bridge.connect(later.target);
    expect(later.calls).toEqual(["sky 2000"]);
  });

  it("D-147 a trace reaches the target cleaned: whole lines, a part clamped, and a broken trace dropped", () => {
    const bridge = createStoryBridge();
    const { target } = recorder();
    bridge.connect(target);
    const view: SkyView = {
      at: 1000,
      turn: 0,
      tilt: 0,
      horizon: null,
      reveal: [],
      trace: { constellation: 59, done: 2.7, partial: 3, flash: -1 },
    };
    bridge.setSky(view);
    expect(target.setSky).toHaveBeenLastCalledWith({
      ...view,
      trace: { constellation: 59, done: 2, partial: 1, flash: 0 },
    });
    for (const trace of [
      { constellation: -1, done: 1, partial: 0, flash: 0 },
      { constellation: 1.5, done: 1, partial: 0, flash: 0 },
      { constellation: 3, done: Number.NaN, partial: 0, flash: 0 },
    ]) {
      bridge.setSky({ ...view, trace });
      expect(target.setSky).toHaveBeenLastCalledWith({ ...view, trace: null });
    }
  });

  it("REQ-ENG-09 the pass cards reach the target as sent, and none is null", () => {
    const bridge = createStoryBridge();
    const { calls, target } = recorder();
    bridge.connect(target);
    const cards = [card("points", -0.5), card("final", 0.5)];

    bridge.setPasses(cards);
    expect(target.setPasses).toHaveBeenLastCalledWith(cards);
    bridge.setPasses([]);
    bridge.setPasses(null);
    expect(calls).toEqual([
      "passes points,final",
      "passes none",
      "passes none",
    ]);
  });

  it("REQ-ENG-09 a card off the screen keeps its corners; a card with a corner that is not finite is left out", () => {
    const bridge = createStoryBridge();
    const { target } = recorder();
    bridge.connect(target);
    const below = card("density", 1.6);
    const broken: PassCard = {
      pass: "glow",
      corners: [
        { x: Number.NaN, y: 0 },
        { x: 0.1, y: 0 },
        { x: 0.1, y: -0.1 },
        { x: 0, y: Number.POSITIVE_INFINITY },
      ],
    };

    bridge.setPasses([below, broken]);
    expect(target.setPasses).toHaveBeenLastCalledWith([below]);
    bridge.setPasses([broken]);
    expect(target.setPasses).toHaveBeenLastCalledWith(null);
  });

  it("REQ-ENG-09 a target connected late gets the latest cards after the stage and before the story; a sent none is replayed too", () => {
    const bridge = createStoryBridge();
    const hero = { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 };
    bridge.setPasses([card("points")]);
    bridge.setStory("making-of", 0.4);
    bridge.setStage({ hero });
    bridge.setPasses([card("velocity"), card("glow", 0.4)]);

    const first = recorder();
    bridge.connect(first.target);
    expect(first.calls).toEqual([
      "stage hero",
      "passes velocity,glow",
      "story making-of 0.4",
    ]);

    bridge.setPasses(null);
    const second = recorder();
    bridge.connect(second.target);
    expect(second.calls).toContain("passes none");
  });

  it("REQ-ENG-07 reset forgets the values and the target", () => {
    const bridge = createStoryBridge();
    const first = recorder();
    bridge.connect(first.target);
    bridge.setStory("making-of", 0.5);
    bridge.setPointer(0.3, 0.3, true);
    bridge.setStage({});
    bridge.setPasses([card("final")]);
    bridge.setVeil(0.4);
    first.calls.length = 0;

    bridge.reset();
    expect(bridge.getStory()).toBeNull();
    bridge.setStory("about", 0.1);
    expect(first.calls).toEqual([]);

    bridge.reset();
    const second = recorder();
    bridge.connect(second.target);
    expect(second.calls).toEqual([]);
  });
});
