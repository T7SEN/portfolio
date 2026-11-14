import { describe, expect, it, vi } from "vitest";

import { createTierStore, tierStore } from "./tier-store";

describe("tier store", () => {
  it("REQ-CNT-10 starts with no tier, on the server and in the browser", () => {
    const store = createTierStore();
    const initial = {
      tier: null,
      reason: null,
      ready: false,
      particles: null,
      look: null,
    };
    expect(store.getSnapshot()).toEqual(initial);
    expect(store.getServerSnapshot()).toEqual(initial);
  });

  it("REQ-ENG-03 tierChosen sets the tier and its reason", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    expect(store.getSnapshot()).toEqual({
      tier: 2,
      reason: "no-webgpu",
      ready: false,
      particles: null,
      look: null,
    });
  });

  it("REQ-ENG-03 ready marks the chosen tier ready and mirrors the particles its field draws and its look", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    store.apply({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    expect(store.getSnapshot()).toEqual({
      tier: 1,
      reason: "probe-pass",
      ready: true,
      particles: 1_000_000,
      look: "halftone",
    });

    const soft = createTierStore();
    soft.apply({ type: "tierChosen", tier: 2, reason: "no-webgpu" });
    soft.apply({ type: "ready", tier: 2, particles: 250_000, look: "soft" });
    expect(soft.getSnapshot().look).toBe("soft");
  });

  it("REQ-ENG-03 REQ-CNT-10 the tier 3 still reports no particles, and the store says so", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 3, reason: "save-data" });
    expect(store.getSnapshot().particles).toBeNull();
    store.apply({ type: "ready", tier: 3, particles: 0 });
    expect(store.getSnapshot()).toEqual({
      tier: 3,
      reason: "save-data",
      ready: true,
      particles: 0,
      look: null,
    });
  });

  it("REQ-ENG-08 a later tierChosen clears ready, the old count and the look until that tier reports ready", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    store.apply({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    store.apply({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(store.getSnapshot()).toEqual({
      tier: 2,
      reason: "device-lost",
      ready: false,
      particles: null,
      look: null,
    });
    store.apply({ type: "ready", tier: 2, particles: 250_000 });
    expect(store.getSnapshot().ready).toBe(true);
    expect(store.getSnapshot().particles).toBe(250_000);
  });

  it("REQ-ENG-03 frameRate changes nothing and wakes no listener", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: "frameRate", fps: 60 });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-LOAD-01 REQ-ENG-03 rendererStarted and probeStarted change nothing and wake no listener, before a tier and after one", () => {
    const store = createTierStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: "rendererStarted", backend: "webgpu" });
    store.apply({ type: "probeStarted", durationMs: 2000 });
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(listener).not.toHaveBeenCalled();

    store.apply({ type: "tierChosen", tier: 2, reason: "probe-slow" });
    store.apply({
      type: "ready",
      tier: 2,
      particles: 250_000,
      look: "halftone",
    });
    const settled = store.getSnapshot();
    listener.mockClear();
    store.apply({ type: "rendererStarted", backend: "webgl2" });
    store.apply({ type: "probeStarted", durationMs: 2000 });
    expect(store.getSnapshot()).toBe(settled);
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-LOAD-01 REQ-ENG-08 a rendererStarted while a chosen tier waits for its ready, as a lost device's rebuild sends, leaves it waiting", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    const chosen = store.getSnapshot();
    store.apply({ type: "rendererStarted", backend: "webgl2" });
    expect(store.getSnapshot()).toBe(chosen);
    expect(store.getSnapshot().ready).toBe(false);
  });

  it("REQ-ENG-03 a repeated ready keeps the same snapshot object", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 3, reason: "save-data" });
    store.apply({ type: "ready", tier: 3, particles: 0 });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: "ready", tier: 3, particles: 0 });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-ENG-03 listeners hear each change until they unsubscribe", () => {
    const store = createTierStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.apply({ type: "tierChosen", tier: 2, reason: "phone" });
    store.apply({ type: "ready", tier: 2, particles: 100_000 });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.apply({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("REQ-ENG-03 a listener that unsubscribes during a change does not stop the others", () => {
    const store = createTierStore();
    const second = vi.fn();
    const unsubscribeFirst = store.subscribe(() => unsubscribeFirst());
    store.subscribe(second);
    store.apply({ type: "tierChosen", tier: 1, reason: "forced" });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("REQ-ENG-07 reset returns to the first snapshot and tells listeners once", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    store.apply({ type: "ready", tier: 1, particles: 1_000_000 });
    const listener = vi.fn();
    store.subscribe(listener);
    store.reset();
    store.reset();
    expect(store.getSnapshot()).toBe(store.getServerSnapshot());
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("REQ-ENG-03 the shared store starts empty", () => {
    expect(tierStore.getSnapshot()).toBe(tierStore.getServerSnapshot());
  });
});
