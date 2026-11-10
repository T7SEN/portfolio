import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { afterFirstContent } from "./after-first-content";

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", {
    configurable: true,
    get: () => state,
  });
}

type PaintList = { getEntriesByName(name: string): unknown[] };

/** A PerformanceObserver that reports paints only when the test says so. */
function stubPaintTiming() {
  const observers: Array<{
    callback: (list: PaintList) => void;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  class PaintObserver {
    static supportedEntryTypes = ["paint"];
    disconnect = vi.fn();
    constructor(callback: (list: PaintList) => void) {
      observers.push({ callback, disconnect: this.disconnect });
    }
    observe() {}
  }
  vi.stubGlobal("PerformanceObserver", PaintObserver);

  return {
    observers,
    report(...names: string[]) {
      for (const { callback } of observers) {
        callback({
          getEntriesByName: (name) => (names.includes(name) ? [{}] : []),
        });
      }
    },
  };
}

describe("afterFirstContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReadyState("complete");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "readyState");
  });

  it("REQ-PERF-07 never runs in the same task, even on a loaded page", () => {
    const run = vi.fn();
    afterFirstContent(run);
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("REQ-PERF-07 waits for the load event while the document is still loading", () => {
    setReadyState("loading");
    const run = vi.fn();
    afterFirstContent(run);
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();

    window.dispatchEvent(new Event("load"));
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("REQ-PERF-04 uses an idle callback with a time limit where the browser has one", () => {
    const idle: Array<() => void> = [];
    const requestIdleCallback = vi.fn(
      (callback: () => void, options?: IdleRequestOptions) => {
        void options;
        idle.push(callback);
        return idle.length;
      },
    );
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", vi.fn());

    const run = vi.fn();
    afterFirstContent(run);
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    expect(requestIdleCallback.mock.calls[0]?.[1]?.timeout).toBeGreaterThan(0);

    idle[0]?.();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("REQ-PERF-04 cancels a pending idle callback", () => {
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn(() => 7),
    );
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);

    afterFirstContent(vi.fn())();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it("REQ-PERF-04 a cancel before the load event stops the run for good", () => {
    setReadyState("loading");
    const run = vi.fn();
    const cancel = afterFirstContent(run);
    cancel();
    window.dispatchEvent(new Event("load"));
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });

  it("REQ-PERF-04 a cancel after the load event stops the waiting timer", () => {
    setReadyState("loading");
    const run = vi.fn();
    const cancel = afterFirstContent(run);
    window.dispatchEvent(new Event("load"));
    cancel();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });

  it("REQ-PERF-07 waits for the first contentful paint where the browser reports paints", () => {
    const paints = stubPaintTiming();
    const run = vi.fn();
    afterFirstContent(run);
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();

    paints.report("first-paint");
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();

    paints.report("first-paint", "first-contentful-paint");
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(paints.observers[0]?.disconnect).toHaveBeenCalledTimes(1);
  });

  it("REQ-PERF-07 stops waiting for a paint that is never reported", () => {
    stubPaintTiming();
    const run = vi.fn();
    afterFirstContent(run);
    vi.advanceTimersByTime(4000);
    expect(run).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("REQ-PERF-04 a cancel while waiting for the paint stops the run for good", () => {
    const paints = stubPaintTiming();
    const run = vi.fn();
    const cancel = afterFirstContent(run);
    cancel();
    // A disconnected observer reports nothing more, so only the time limit
    // is left to stop.
    expect(paints.observers[0]?.disconnect).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
  });
});
