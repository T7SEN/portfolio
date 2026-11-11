import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startPointerInput } from "./pointer-input";

const AREA = { left: 0, top: 0, width: 200, height: 100 };

let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;

/** Runs the animation frame the input asked for, as the browser would. */
function runFrame() {
  const due = [...frames.values()];
  frames.clear();
  for (const callback of due) callback(performance.now());
}

function pointer(
  type: string,
  init: { clientX?: number; clientY?: number; pointerType?: string } & {
    relatedTarget?: EventTarget | null;
  } = {},
) {
  window.dispatchEvent(
    new PointerEvent(type, { pointerType: "mouse", bubbles: true, ...init }),
  );
}

/** jsdom has no Touch constructor, so the touch list is set by hand. */
function touch(type: string, points: Array<[number, number]>) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "touches", {
    value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
  });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextFrame++;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startPointerInput", () => {
  function start(area: (() => typeof AREA) | undefined = () => AREA) {
    const send = vi.fn();
    const stop = startPointerInput({ send, area });
    return { send, stop };
  }

  it("REQ-SCR-06 a mouse move becomes normalised device coordinates of the field, y up", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 150, clientY: 25 });
    expect(send).not.toHaveBeenCalled();

    runFrame();
    expect(send).toHaveBeenCalledWith(0.5, 0.5, true);
    stop();
  });

  it("REQ-SCR-06 the corners of the field are -1 and 1", () => {
    const { send, stop } = start(() => ({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
    }));
    pointer("pointermove", { clientX: 10, clientY: 70 });
    runFrame();
    pointer("pointermove", { clientX: 110, clientY: 20 });
    runFrame();

    expect(send.mock.calls).toEqual([
      [-1, -1, true],
      [1, 1, true],
    ]);
    stop();
  });

  it("REQ-SCR-06 an empty field box counts as the whole viewport", () => {
    const { send, stop } = start(() => ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    }));
    pointer("pointermove", {
      clientX: window.innerWidth * 0.75,
      clientY: window.innerHeight * 0.25,
    });
    runFrame();

    expect(send).toHaveBeenCalledWith(0.5, 0.5, true);
    stop();
  });

  it("REQ-SCR-06 sends at most once per animation frame, with the latest position", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 0, clientY: 0 });
    pointer("pointermove", { clientX: 50, clientY: 50 });
    pointer("pointermove", { clientX: 100, clientY: 50 });
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1);

    runFrame();
    expect(send.mock.calls).toEqual([[0, 0, true]]);
    runFrame();
    expect(send).toHaveBeenCalledTimes(1);
    stop();
  });

  it("REQ-SCR-06 a pen stirs like a mouse, and touch pointer events are left to the touch listeners", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 100, clientY: 50, pointerType: "touch" });
    runFrame();
    expect(send).not.toHaveBeenCalled();

    pointer("pointermove", { clientX: 100, clientY: 50, pointerType: "pen" });
    runFrame();
    expect(send).toHaveBeenCalledWith(0, 0, true);
    stop();
  });

  it("REQ-SCR-06 leaving the window sends active false at once, at the last position", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 150, clientY: 25 });
    runFrame();

    pointer("pointerout", { relatedTarget: document.body });
    expect(send).toHaveBeenCalledTimes(1);

    pointer("pointerout", { relatedTarget: null });
    expect(send).toHaveBeenLastCalledWith(0.5, 0.5, false);
    expect(send).toHaveBeenCalledTimes(2);

    pointer("pointerout", { relatedTarget: null });
    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });

  it("REQ-SCR-06 losing focus releases the pointer and drops a move still waiting", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 150, clientY: 25 });
    runFrame();
    pointer("pointermove", { clientX: 0, clientY: 0 });

    window.dispatchEvent(new Event("blur"));
    runFrame();
    expect(send.mock.calls).toEqual([
      [0.5, 0.5, true],
      [0.5, 0.5, false],
    ]);
    stop();
  });

  it("REQ-SCR-06 a finger stirs through passive touch listeners that never cancel the scroll", () => {
    const added = vi.spyOn(window, "addEventListener");
    const { send, stop } = start();

    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
      const call = added.mock.calls.find(([name]) => name === type);
      expect(call?.[2]).toEqual({ passive: true });
    }
    expect(added.mock.calls.map(([name]) => name)).not.toContain(
      "pointercancel",
    );

    const press = touch("touchstart", [[50, 75]]);
    const move = touch("touchmove", [[150, 25]]);
    runFrame();
    expect(press.defaultPrevented).toBe(false);
    expect(move.defaultPrevented).toBe(false);
    expect(send.mock.calls).toEqual([[0.5, 0.5, true]]);
    expect(document.documentElement.style.touchAction).toBe("");
    stop();
  });

  it("REQ-SCR-06 a cancelled touch pointer does not stop the stirring while touchmove goes on", () => {
    const { send, stop } = start();
    touch("touchstart", [[100, 50]]);
    runFrame();

    pointer("pointercancel", { pointerType: "touch" });
    pointer("pointerout", { pointerType: "touch", relatedTarget: null });
    touch("touchmove", [[150, 25]]);
    runFrame();
    expect(send.mock.calls).toEqual([
      [0, 0, true],
      [0.5, 0.5, true],
    ]);
    stop();
  });

  it("REQ-SCR-06 lifting the last finger sends active false; a finger still down keeps stirring", () => {
    const { send, stop } = start();
    touch("touchstart", [
      [100, 50],
      [0, 0],
    ]);
    runFrame();

    touch("touchend", [[150, 25]]);
    runFrame();
    expect(send).toHaveBeenLastCalledWith(0.5, 0.5, true);

    touch("touchend", []);
    expect(send).toHaveBeenLastCalledWith(0.5, 0.5, false);

    touch("touchstart", [[100, 50]]);
    runFrame();
    touch("touchcancel", []);
    expect(send).toHaveBeenLastCalledWith(0, 0, false);
    stop();
  });

  it("REQ-ENG-07 the stop removes every listener, cancels the waiting frame and releases an active pointer", () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    const { send, stop } = start();
    pointer("pointermove", { clientX: 150, clientY: 25 });
    runFrame();
    pointer("pointermove", { clientX: 0, clientY: 0 });

    stop();
    expect(window.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith(0.5, 0.5, false);
    expect(
      removed.mock.calls.map(([type, listener]) => [type, listener]),
    ).toEqual(added.mock.calls.map(([type, listener]) => [type, listener]));

    pointer("pointermove", { clientX: 10, clientY: 10 });
    touch("touchmove", [[10, 10]]);
    runFrame();
    stop();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("REQ-ENG-07 a stop before any move sends nothing", () => {
    const { send, stop } = start();
    pointer("pointermove", { clientX: 150, clientY: 25 });
    stop();
    runFrame();
    expect(send).not.toHaveBeenCalled();
  });
});
