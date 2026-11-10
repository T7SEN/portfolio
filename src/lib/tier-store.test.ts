import { describe, expect, it, vi } from "vitest";

import { createTierStore, tierStore } from "./tier-store";

describe("tier store", () => {
  it("REQ-CNT-10 starts with no tier, on the server and in the browser", () => {
    const store = createTierStore();
    const initial = { tier: null, reason: null, ready: false };
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
    });
  });

  it("REQ-ENG-03 ready marks the chosen tier ready", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    store.apply({ type: "ready", tier: 1 });
    expect(store.getSnapshot()).toEqual({
      tier: 1,
      reason: "probe-pass",
      ready: true,
    });
  });

  it("REQ-ENG-08 a later tierChosen clears ready until that tier reports ready", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    store.apply({ type: "ready", tier: 1 });
    store.apply({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(store.getSnapshot()).toEqual({
      tier: 2,
      reason: "device-lost",
      ready: false,
    });
    store.apply({ type: "ready", tier: 2 });
    expect(store.getSnapshot().ready).toBe(true);
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

  it("REQ-ENG-03 a repeated ready keeps the same snapshot object", () => {
    const store = createTierStore();
    store.apply({ type: "tierChosen", tier: 3, reason: "save-data" });
    store.apply({ type: "ready", tier: 3 });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    store.apply({ type: "ready", tier: 3 });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-ENG-03 listeners hear each change until they unsubscribe", () => {
    const store = createTierStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.apply({ type: "tierChosen", tier: 2, reason: "phone" });
    store.apply({ type: "ready", tier: 2 });
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
    store.apply({ type: "ready", tier: 1 });
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
