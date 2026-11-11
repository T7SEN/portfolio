import { describe, expect, it, vi } from "vitest";

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
  } satisfies StoryTarget;
  return { calls, target };
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

  it("REQ-ENG-07 reset forgets the values and the target", () => {
    const bridge = createStoryBridge();
    const first = recorder();
    bridge.connect(first.target);
    bridge.setStory("making-of", 0.5);
    bridge.setPointer(0.3, 0.3, true);
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
