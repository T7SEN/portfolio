import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { site } from "@/content/site";

import { LOADING_ATTRIBUTE } from "./overlays";

// Each dialog stands in as a marker that counts its loads and mounts, so
// these tests see when overlays.tsx loads and keeps it, not what it draws.
// The stand-ins are registered afresh for every test (mockDialogs), after
// the module graph is reset, so each test starts with nothing loaded.
const dialogs = vi.hoisted(() => ({
  loads: { menu: 0, palette: 0 },
  mounts: { menu: 0, palette: 0 },
  failMenu: false,
  failPalette: false,
  // Set to hold the menu's code until the test lets it arrive.
  holdMenu: null as Promise<void> | null,
}));

function mockDialogs() {
  vi.doMock("./menu-dialog", async () => {
    dialogs.loads.menu += 1;
    if (dialogs.holdMenu !== null) await dialogs.holdMenu;
    if (dialogs.failMenu) throw new Error("offline");
    const { useEffect } = await import("react");
    return {
      default: function Menu() {
        useEffect(() => {
          dialogs.mounts.menu += 1;
        }, []);
        return <div data-testid="menu" />;
      },
    };
  });
  vi.doMock("./palette-dialog", async () => {
    dialogs.loads.palette += 1;
    if (dialogs.failPalette) throw new Error("offline");
    const { useEffect } = await import("react");
    return {
      default: function Palette() {
        useEffect(() => {
          dialogs.mounts.palette += 1;
        }, []);
        return <div data-testid="palette" />;
      },
    };
  });
}

let host: HTMLDivElement;
let root: Root;

// A fresh module graph per test, so each starts with no dialog loaded.
async function load() {
  vi.resetModules();
  mockDialogs();
  const [{ Overlays }, { overlayStore }] = await Promise.all([
    import("./overlays"),
    import("@/lib/overlay-store"),
  ]);
  await act(async () => {
    root.render(<Overlays />);
  });
  return overlayStore;
}

/** Lets a dynamic import resolve and React render what it brought. */
async function flush() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dialogs.loads = { menu: 0, palette: 0 };
  dialogs.mounts = { menu: 0, palette: 0 };
  dialogs.failMenu = false;
  dialogs.failPalette = false;
  dialogs.holdMenu = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("Overlays", () => {
  it("REQ-NAV-03 REQ-NAV-04 REQ-PERF-04 loads neither dialog before its first open", async () => {
    await load();
    await flush();
    expect(dialogs.loads).toEqual({ menu: 0, palette: 0 });
    expect(host.innerHTML).toBe("");
  });

  it("REQ-NAV-03 loads the menu on its first open and keeps it mounted after it closes", async () => {
    const store = await load();

    await act(async () => {
      store.open("menu");
    });
    await flush();
    expect(dialogs.loads.menu).toBe(1);
    expect(dialogs.mounts.menu).toBe(1);
    expect(host.querySelector('[data-testid="menu"]')).not.toBeNull();

    await act(async () => {
      store.close();
    });
    await act(async () => {
      store.open("menu");
    });
    await flush();
    expect(dialogs.mounts.menu).toBe(1);
    expect(dialogs.loads.palette).toBe(0);
  });

  it("REQ-NAV-04 loads the palette on its first open, beside a menu already loaded", async () => {
    const store = await load();

    await act(async () => {
      store.open("menu");
    });
    await flush();
    await act(async () => {
      store.open("palette");
    });
    await flush();
    expect(host.querySelector('[data-testid="menu"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="palette"]')).not.toBeNull();
  });

  it("REQ-NAV-03 a preload from the control starts the import before the first open", async () => {
    vi.resetModules();
    mockDialogs();
    const { preloadOverlay } = await import("./overlays");
    preloadOverlay("menu");
    await flush();
    expect(dialogs.loads.menu).toBe(1);
    expect(dialogs.loads.palette).toBe(0);
  });

  it("REQ-NAV-03 A11 a menu that cannot load closes and leads to the footer's site links instead", async () => {
    dialogs.failMenu = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const footer = document.createElement("nav");
    footer.id = site.siteLinksId;
    footer.innerHTML = '<a href="/work">Work</a>';
    footer.scrollIntoView = vi.fn();
    document.body.append(footer);
    const store = await load();

    await act(async () => {
      store.open("menu");
    });
    await flush();
    expect(store.getSnapshot()).toBeNull();
    expect(footer.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(footer.querySelector("a"));
  });

  it("REQ-NAV-04 A11 a palette that cannot load closes and leads to the footer's site links too, never silently", async () => {
    dialogs.failPalette = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const footer = document.createElement("nav");
    footer.id = site.siteLinksId;
    footer.innerHTML = '<a href="/work">Work</a>';
    footer.scrollIntoView = vi.fn();
    document.body.append(footer);
    const store = await load();

    await act(async () => {
      store.open("palette");
    });
    await flush();
    expect(store.getSnapshot()).toBeNull();
    expect(store.takeReturnFocus()).toBeNull();
    expect(footer.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(footer.querySelector("a"));
  });

  it("REQ-NAV-03 REQ-A11Y-02 while the menu's code loads the page says it is busy, Esc closes the menu asked for, and the busy state goes", async () => {
    let arrive = () => undefined as void;
    dialogs.holdMenu = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    const store = await load();
    const html = document.documentElement;

    await act(async () => {
      store.open("menu");
    });
    await flush();
    expect(html.hasAttribute(LOADING_ATTRIBUTE)).toBe(true);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(store.getSnapshot()).toBeNull();
    expect(html.hasAttribute(LOADING_ATTRIBUTE)).toBe(false);

    // The code arriving later opens nothing.
    arrive();
    await flush();
    expect(store.getSnapshot()).toBeNull();
    expect(html.hasAttribute(LOADING_ATTRIBUTE)).toBe(false);
  });

  it("REQ-NAV-03 the busy state ends once the dialog is mounted, and Esc is then the dialog's", async () => {
    const store = await load();
    const html = document.documentElement;
    await act(async () => {
      store.open("menu");
    });
    await flush();
    expect(host.querySelector('[data-testid="menu"]')).not.toBeNull();
    expect(html.hasAttribute(LOADING_ATTRIBUTE)).toBe(false);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    // The stand in has no Esc of its own, so the menu stays open here.
    expect(store.getSnapshot()).toBe("menu");
  });
});
