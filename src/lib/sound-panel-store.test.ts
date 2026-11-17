import { describe, expect, it, vi } from "vitest";

import { createSoundPanelStore } from "./sound-panel-store";

describe("sound panel store", () => {
  it("REQ-SND-01 closed on the server and at first; one panel open at a time", () => {
    const store = createSoundPanelStore();
    const heard = vi.fn();
    store.subscribe(heard);
    expect(store.getServerSnapshot()).toBeNull();
    expect(store.getSnapshot()).toBeNull();

    store.open("bar");
    expect(store.getSnapshot()).toBe("bar");
    store.open("footer");
    expect(store.getSnapshot()).toBe("footer");
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("REQ-SND-01 a pill closes only its own panel, and a change that changes nothing tells no one", () => {
    const store = createSoundPanelStore();
    const heard = vi.fn();
    const leave = store.subscribe(heard);
    store.open("bar");
    store.open("bar");
    store.close("footer");
    expect(store.getSnapshot()).toBe("bar");
    store.close("bar");
    expect(store.getSnapshot()).toBeNull();
    expect(heard).toHaveBeenCalledTimes(2);
    leave();
    store.open("menu");
    expect(heard).toHaveBeenCalledTimes(2);
  });
});
