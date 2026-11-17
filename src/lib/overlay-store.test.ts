import { afterEach, describe, expect, it, vi } from "vitest";

import { createOverlayStore, overlayStore } from "./overlay-store";

function button(name: string) {
  const element = document.createElement("button");
  element.textContent = name;
  document.body.append(element);
  return element;
}

afterEach(() => {
  overlayStore.close();
  overlayStore.takeReturnFocus();
  document.body.replaceChildren();
});

describe("overlay store", () => {
  it("REQ-NAV-03 REQ-NAV-04 holds no overlay until one opens, on the server too", () => {
    const store = createOverlayStore();
    expect(store.getSnapshot()).toBeNull();
    expect(store.getServerSnapshot()).toBeNull();

    store.open("menu");
    expect(store.getSnapshot()).toBe("menu");
    store.close();
    expect(store.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-04 opening one overlay closes the other", () => {
    const store = createOverlayStore();
    store.open("menu");
    store.open("palette");
    expect(store.getSnapshot()).toBe("palette");
    store.open("menu");
    expect(store.getSnapshot()).toBe("menu");
  });

  it("REQ-NAV-04 toggle closes the overlay that is open and opens it otherwise, switching from the other", () => {
    const store = createOverlayStore();
    store.toggle("palette");
    expect(store.getSnapshot()).toBe("palette");
    store.toggle("palette");
    expect(store.getSnapshot()).toBeNull();

    store.open("menu");
    store.toggle("palette");
    expect(store.getSnapshot()).toBe("palette");
  });

  it("REQ-NAV-03 tells listeners of each change only, and an unsubscribe stops them", () => {
    const store = createOverlayStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.open("menu");
    store.open("menu");
    store.close();
    store.close();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.open("palette");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("REQ-NAV-03 REQ-A11Y-02 gives back the element that had focus before the first overlay opened, once", () => {
    const store = createOverlayStore();
    const menu = button("Menu");
    menu.focus();
    store.open("menu");
    expect(store.takeReturnFocus()).toBeNull();

    store.close();
    expect(store.takeReturnFocus()).toBe(menu);
    expect(store.takeReturnFocus()).toBeNull();
  });

  it("REQ-NAV-04 REQ-A11Y-02 a switch between overlays keeps the first element, never one inside the overlay", () => {
    const store = createOverlayStore();
    const opener = button("Ctrl K");
    opener.focus();
    store.open("menu");

    const inside = button("Work");
    inside.focus();
    store.toggle("palette");
    // The menu closes because the palette opened: it gets nothing back.
    expect(store.takeReturnFocus()).toBeNull();

    store.close();
    expect(store.takeReturnFocus()).toBe(opener);
  });

  it("REQ-A11Y-02 focus recorded inside a part that goes is handed to the control that stays; focus elsewhere is kept", () => {
    const store = createOverlayStore();
    const pill = button("Sound off");
    const panel = document.createElement("div");
    const inside = document.createElement("button");
    panel.append(inside);
    document.body.append(panel);
    inside.focus();
    store.open("palette");
    store.passReturnFocus(panel, pill);
    store.close();
    expect(store.takeReturnFocus()).toBe(pill);

    const opener = button("Menu");
    opener.focus();
    store.open("menu");
    store.passReturnFocus(panel, pill);
    store.close();
    expect(store.takeReturnFocus()).toBe(opener);
    panel.remove();
  });

  it("REQ-A11Y-02 a command that moves the visitor on the page hands that place over as the focus to return", () => {
    const store = createOverlayStore();
    const opener = button("Ctrl K");
    const chapter = document.createElement("section");
    document.body.append(chapter);
    opener.focus();
    store.open("palette");
    store.setReturnFocus(chapter);
    store.close();
    expect(store.takeReturnFocus()).toBe(chapter);
  });

  it("REQ-A11Y-02 with the page itself focused there is nothing to give back", () => {
    const store = createOverlayStore();
    store.open("palette");
    store.close();
    expect(store.takeReturnFocus()).toBeNull();
  });

  it("REQ-NAV-03 a store with no document opens and closes and gives back nothing", () => {
    const store = createOverlayStore(() => undefined);
    store.open("menu");
    store.close();
    expect(store.getSnapshot()).toBeNull();
    expect(store.takeReturnFocus()).toBeNull();
  });

  it("REQ-NAV-03 the shared store is one instance for every reader", () => {
    const listener = vi.fn();
    const unsubscribe = overlayStore.subscribe(listener);
    overlayStore.open("palette");
    expect(overlayStore.getSnapshot()).toBe("palette");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
