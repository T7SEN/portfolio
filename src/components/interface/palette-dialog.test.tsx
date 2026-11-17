import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studies } from "@/content";
import { paletteCopy } from "@/content/palette";
import { site } from "@/content/site";
import type { CalmSnapshot } from "@/lib/calm-store";
import type { EggOutcome } from "@/lib/eggs";
import { overlayStore } from "@/lib/overlay-store";
import type { SoundStatus, TicksStatus } from "@/lib/sound-store";
import { tierChoiceStore } from "@/lib/tier-choice-store";
import { tierStore } from "@/lib/tier-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import PaletteDialog from "./palette-dialog";

const fakes = vi.hoisted(() => {
  function store<T>(initial: T) {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      get: () => value,
      set(next: T) {
        value = next;
        for (const listener of [...listeners]) listener();
      },
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }
  return {
    route: { pathname: "/" as string | null },
    push: vi.fn<(href: string) => void>(),
    calm: store({ calm: false, system: false, chosen: false }),
    sound: store<{
      status: "off" | "waiting" | "starting" | "on" | "failed";
      ticks: "off" | "on" | "failed";
    }>({
      status: "off",
      ticks: "off",
    }),
    ticks: [] as string[],
    toggleBackground: vi.fn<() => void>(),
    toggleTicks: vi.fn<() => void>(),
    setChosen: vi.fn<(on: boolean) => void>(),
    egg: vi.fn<(egg: string) => EggOutcome>(),
    scroll: vi.fn<(id: string) => boolean>(),
    copy: vi.fn<(text: string) => Promise<boolean>>(),
    open: vi.fn<(href: string) => void>(),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => fakes.route.pathname,
  useRouter: () => ({ push: fakes.push }),
}));

vi.mock("@/lib/calm-store", () => ({
  calmStore: {
    subscribe: fakes.calm.subscribe,
    getSnapshot: fakes.calm.get,
    getServerSnapshot: () => ({ calm: false, system: false, chosen: false }),
    setChosen: fakes.setChosen,
  },
}));

vi.mock("@/lib/sound-store", () => ({
  soundStore: {
    subscribe: fakes.sound.subscribe,
    getSnapshot: fakes.sound.get,
    getServerSnapshot: () => ({ status: "off", ticks: "off" }),
    toggleBackground: fakes.toggleBackground,
    toggleTicks: fakes.toggleTicks,
    tick: (kind: string) => fakes.ticks.push(kind),
  },
}));

vi.mock("@/lib/eggs", () => ({ requestEgg: fakes.egg }));

vi.mock("@/components/motion/scroll-to-section", () => ({
  scrollToSection: fakes.scroll,
}));

vi.mock("./palette-actions", () => ({
  copyText: fakes.copy,
  openAddress: fakes.open,
}));

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

/** Stands in for matchMedia: a fine pointer or not, and a screen this wide. */
function stubPointer(isFine: boolean, width = 1280) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: media.includes("pointer: fine")
      ? isFine
      : media.includes("min-width: 22.5rem")
        ? width >= 360
        : false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Radix gives focus back a task after the dialog leaves. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render() {
  await act(async () => {
    root.render(<PaletteDialog />);
  });
}

async function openPalette() {
  opener.focus();
  await act(async () => {
    overlayStore.open("palette");
  });
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function input() {
  const found = document.querySelector<HTMLInputElement>("[cmdk-input]");
  if (found === null) throw new Error("no search input");
  return found;
}

function nameOf(element: Element | null | undefined) {
  const labelledBy = element?.getAttribute("aria-labelledby");
  if (labelledBy) return document.getElementById(labelledBy)?.textContent;
  return element?.getAttribute("aria-label") ?? element?.textContent;
}

/** What an element says aloud, its aria-hidden parts left out. */
function spoken(element: Element | null | undefined) {
  if (element === null || element === undefined) return "";
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => {
    node.remove();
  });
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

function options() {
  return [...document.querySelectorAll('[role="option"]')];
}

/** Each option's words, without its value. */
function labels() {
  return options().map(
    (option) => option.querySelector("span")?.textContent ?? "",
  );
}

function option(label: string) {
  const found = options().find(
    (each) => each.querySelector("span")?.textContent === label,
  );
  if (found === undefined) throw new Error(`no option ${label}`);
  return found;
}

function activeLabel() {
  return (
    document
      .querySelector('[role="option"][aria-selected="true"]')
      ?.querySelector("span")?.textContent ?? null
  );
}

/** The row the input names as active to assistive technology. */
function namedActive() {
  const id = input().getAttribute("aria-activedescendant");
  return id === null
    ? null
    : (document.getElementById(id)?.querySelector("span")?.textContent ?? null);
}

/** Whether the status words are on screen too, or for assistive technology only. */
function statusShown() {
  const words = document.querySelector('[data-part="palette-status"] p');
  return words !== null && !words.classList.contains("sr-only");
}

function status() {
  return document.querySelector('[role="status"]')?.textContent ?? "";
}

async function type(text: string) {
  const field = input();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(key: string, target: Element = input()) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

/** Moves the active row to the one with these words, then presses Enter. */
async function run(label: string) {
  for (let step = 0; step < 30 && activeLabel() !== label; step += 1) {
    await press("ArrowDown");
  }
  expect(activeLabel()).toBe(label);
  await press("Enter");
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = () => undefined;
  stubPointer(true);
  fakes.route.pathname = "/";
  fakes.calm.set({ calm: false, system: false, chosen: false });
  fakes.sound.set({ status: "off", ticks: "off" });
  fakes.ticks.length = 0;
  fakes.push.mockReset();
  fakes.toggleBackground.mockReset();
  fakes.toggleTicks.mockReset();
  fakes.setChosen.mockReset();
  fakes.egg.mockReset();
  fakes.scroll.mockReset();
  fakes.copy.mockReset();
  fakes.open.mockReset();
  opener = document.createElement("button");
  opener.textContent = "Ctrl K";
  host = document.createElement("div");
  document.body.append(opener, host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    overlayStore.close();
    root.unmount();
  });
  overlayStore.takeReturnFocus();
  tierChoiceStore.set("auto");
  tierStore.reset();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("PaletteDialog", () => {
  it("REQ-NAV-04 shows nothing until the overlay store opens the palette", async () => {
    await render();
    expect(dialog()).toBeNull();
    await act(async () => {
      overlayStore.open("menu");
    });
    expect(dialog()).toBeNull();
  });

  it("REQ-NAV-04 a search reaches every Go to row the empty list leaves out: the short studies, the home chapters, All work and the v1 archive", async () => {
    await render();
    await openPalette();
    await type("home");
    expect(labels()).toEqual(
      expect.arrayContaining([
        "Home: Work",
        "Home: Making-of",
        "Home: About",
        "Home: Contact",
      ]),
    );
    await type("url");
    expect(labels()).toContain("t7sen-url");
    await type("systemseven");
    expect(labels()).toContain("SystemSeven");
    await type("v1");
    expect(labels()).toContain("v1 archive");
    await type("all work");
    expect(labels()).toContain("All work, no 3D");
    await type("");
    expect(labels()).not.toContain("v1 archive");
  });

  it("REQ-NAV-04 REQ-A11Y-02 is a dialog named Command palette, its search labelled Search commands, its results a listbox of options in Go to, Settings and Actions", async () => {
    await render();
    await openPalette();

    expect(nameOf(dialog())).toBe("Command palette");
    expect(document.activeElement).toBe(input());
    expect(nameOf(input())).toBe("Search commands");
    expect(input().placeholder).toBe("Jump to a study, or change a setting");
    expect(input().getAttribute("role")).toBe("combobox");

    const list = dialog()?.querySelector('[role="listbox"]');
    expect(list?.getAttribute("aria-label")).toBe("Commands");
    expect(input().getAttribute("aria-controls")).toBe(list?.id);
    const groups = [...(list?.querySelectorAll('[role="group"]') ?? [])];
    expect(groups.map((group) => nameOf(group))).toEqual([
      "Go to",
      "Settings",
      "Actions",
    ]);
    // An empty search lists Go to as artboard 7 does: the full studies,
    // then About and Contact; the rest come with a search.
    expect(labels()).toEqual([
      ...studies
        .filter((study) => study.kind === "full")
        .map((study) => study.title),
      "About",
      "Contact",
      "Background sound",
      "Interface sounds",
      "Quality tier",
      "Calm mode",
      "Copy email address",
      "Ask for my CV",
    ]);
    // The first row is active, and the input says so.
    expect(activeLabel()).toBe("Making-of: this site");
    const active = document.querySelector('[aria-selected="true"]');
    expect(namedActive()).toBe("Making-of: this site");
    // The values read with their rows, the Enter hint does not.
    expect(spoken(option("Background sound"))).toBe("Background sound, Off");
    expect(spoken(option("Interface sounds"))).toBe("Interface sounds, Off");
    expect(spoken(option("Copy email address"))).toBe(
      `Copy email address, ${site.email}`,
    );
    expect(spoken(option("Calm mode"))).toBe("Calm mode, Off");
    expect(active?.textContent).toContain("Enter");
    expect(dialog()?.textContent).toContain("↑ ↓ move · Enter run · Esc close");
    expect(dialog()?.textContent).toContain("Some commands are hidden");
    // Lenis leaves its wheel alone.
    expect(dialog()?.hasAttribute("data-lenis-prevent")).toBe(true);
  });

  it("REQ-NAV-04 REQ-SND-03 Esc closes it and focus goes back to the control that opened it; its open and close ticks are the tick listener's, never its own", async () => {
    await render();
    await openPalette();
    expect(fakes.ticks).toEqual([]);

    await press("Escape");
    await settle();

    expect(dialog()).toBeNull();
    expect(overlayStore.getSnapshot()).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(fakes.ticks).toEqual([]);
  });

  it("REQ-NAV-04 the Esc key cap is a button that closes, and Enter on it never runs the active row", async () => {
    await render();
    await openPalette();
    const close = dialog()?.querySelector('[data-part="palette-close"]');
    expect(nameOf(close)).toBe("Close the command palette, Esc");

    if (!(close instanceof HTMLElement)) throw new Error("no close");
    close.focus();
    await press("Enter", close);
    expect(fakes.push).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();

    await act(async () => {
      close.click();
    });
    await settle();
    expect(dialog()).toBeNull();
  });

  it("REQ-NAV-04 on touch the key hints and the Enter hint give way, and the close button shows a cross", async () => {
    stubPointer(false);
    await render();
    await openPalette();
    expect(dialog()?.textContent).not.toContain("↑ ↓ move");
    expect(dialog()?.textContent).toContain("Some commands are hidden");
    expect(
      document.querySelector('[aria-selected="true"]')?.textContent,
    ).not.toContain("Enter");
    const close = dialog()?.querySelector('[data-part="palette-close"]');
    expect(close?.querySelector("svg")).not.toBeNull();
    expect(nameOf(close)).toBe("Close the command palette, Esc");
  });

  it("REQ-NAV-04 below 360 px the search shows the same words, shorter, so none are cut off", async () => {
    stubPointer(false, 320);
    await render();
    await openPalette();
    expect(input().placeholder).toBe("Jump to a study or a setting");
    expect(nameOf(input())).toBe("Search commands");
  });

  it("REQ-NAV-04 typing filters the rows, the first match becomes active, and a search with no match says so", async () => {
    await render();
    await openPalette();

    await type("coup");
    expect(labels()).toEqual(["Coup Online"]);
    expect(activeLabel()).toBe("Coup Online");
    // cmdk alone would still name the row from before the search.
    expect(namedActive()).toBe("Coup Online");

    await type("email");
    expect(labels()).toEqual([
      "Home: Contact",
      "Contact",
      "Copy email address",
      "Ask for my CV",
    ]);
    expect(activeLabel()).toBe("Home: Contact");
    expect(namedActive()).toBe("Home: Contact");
    await press("ArrowDown");
    expect(namedActive()).toBe("Contact");

    await type("zzzz");
    expect(options()).toHaveLength(0);
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    expect(dialog()?.textContent).toContain(paletteCopy.empty);
  });

  it("REQ-NAV-04 REQ-SND-03 the arrow keys move with a tick, and Enter on a study closes the palette and goes to its page with no select of its own", async () => {
    await render();
    await openPalette();

    await press("ArrowDown");
    expect(activeLabel()).toBe("Coup Online");
    expect(fakes.ticks).toEqual(["move"]);
    await press("ArrowUp");
    await press("ArrowUp");
    // It wraps round from the first row to the last.
    expect(activeLabel()).toBe("Ask for my CV");
    await press("Home");
    await press("ArrowDown");
    await press("Enter");
    await settle();

    expect(fakes.push).toHaveBeenCalledWith("/work/coup-online");
    expect(overlayStore.getSnapshot()).toBeNull();
    expect(dialog()).toBeNull();
    // The close the tick listener plays is the press's one tick.
    expect(fakes.ticks).toEqual(["move", "move", "move", "move", "move"]);
  });

  it("REQ-NAV-04 REQ-A11Y-02 a home chapter is scrolled to on the home page, taking focus there with no scroll of its own, and reached by its address elsewhere", async () => {
    fakes.scroll.mockReturnValue(true);
    const about = document.createElement("section");
    about.id = "about";
    document.body.append(about);
    const focus = vi.spyOn(about, "focus");
    await render();
    await openPalette();
    await type("home about");
    await press("Enter");
    expect(fakes.scroll).toHaveBeenCalledWith("about");
    expect(fakes.push).not.toHaveBeenCalled();
    expect(overlayStore.getSnapshot()).toBeNull();
    await settle();
    // Focus follows the visitor: the next Tab goes on from About (WCAG 2.4.3).
    expect(document.activeElement).toBe(about);
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    // Focusable for that move only: once focus leaves, a click on its text
    // can no longer take focus there.
    expect(about.getAttribute("tabindex")).toBe("-1");
    about.blur();
    expect(about.hasAttribute("tabindex")).toBe(false);
    about.remove();

    fakes.route.pathname = "/work";
    await render();
    await openPalette();
    await type("home making");
    await press("Enter");
    expect(fakes.push).toHaveBeenCalledWith("/#making-of");
    expect(overlayStore.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-04 REQ-SND-01 Background sound turns over inside the press, its value follows the background and the change is announced", async () => {
    await render();
    await openPalette();
    await run("Background sound");
    expect(fakes.toggleBackground).toHaveBeenCalledTimes(1);
    expect(fakes.toggleTicks).not.toHaveBeenCalled();
    // The select tick after the change, and the palette stays open.
    expect(fakes.ticks.slice(-1)).toEqual(["select"]);
    expect(dialog()).not.toBeNull();

    await act(async () => {
      fakes.sound.set({ status: "starting", ticks: "off" });
    });
    expect(spoken(option("Background sound"))).toBe("Background sound, On");
    await act(async () => {
      fakes.sound.set({ status: "on", ticks: "off" });
    });
    expect(status()).toBe("Background sound on");
    await act(async () => {
      fakes.sound.set({ status: "off", ticks: "off" });
    });
    expect(status()).toBe("Background sound off");

    await act(async () => {
      fakes.sound.set({ status: "failed" satisfies SoundStatus, ticks: "off" });
    });
    expect(spoken(option("Background sound"))).toBe("Background sound, Failed");
    expect(status()).toBe("Sound could not start on this device.");
    expect(spoken(option("Interface sounds"))).toBe("Interface sounds, Off");
  });

  it("REQ-NAV-04 REQ-SND-01 Interface sounds turn over on their own inside the press, with their value and announcement", async () => {
    await render();
    await openPalette();
    await run("Interface sounds");
    expect(fakes.toggleTicks).toHaveBeenCalledTimes(1);
    expect(fakes.toggleBackground).not.toHaveBeenCalled();

    await act(async () => {
      fakes.sound.set({ status: "off", ticks: "on" satisfies TicksStatus });
    });
    expect(spoken(option("Interface sounds"))).toBe("Interface sounds, On");
    expect(spoken(option("Background sound"))).toBe("Background sound, Off");
    expect(status()).toBe("Interface sounds on");
    await act(async () => {
      fakes.sound.set({ status: "off", ticks: "off" });
    });
    expect(status()).toBe("Interface sounds off");
    await act(async () => {
      fakes.sound.set({ status: "off", ticks: "failed" });
    });
    expect(spoken(option("Interface sounds"))).toBe("Interface sounds, Failed");
    expect(status()).toBe("Sound could not start on this device.");
  });

  it("REQ-NAV-04 REQ-SND-01 while a returning visitor's background waits, its row says so; both sound rows are sound controls, and selecting Background sound turns it over once", async () => {
    fakes.sound.set({ status: "waiting" satisfies SoundStatus, ticks: "off" });
    await render();
    await openPalette();
    expect(spoken(option("Background sound"))).toBe(
      "Background sound, On · waiting",
    );
    // Only the two sound rows: the window leaves a press on them to the row.
    expect(
      options()
        .filter((each) => each.hasAttribute("data-sound-control"))
        .map((each) => each.querySelector("span")?.textContent),
    ).toEqual(["Background sound", "Interface sounds"]);

    // By key: Enter in the search with the row active, as the store's
    // window listener sees it (sound-store.ts).
    for (
      let step = 0;
      step < 30 && activeLabel() !== "Background sound";
      step += 1
    ) {
      await press("ArrowDown");
    }
    const active = input().getAttribute("aria-activedescendant");
    expect(active).not.toBeNull();
    expect(
      document.getElementById(active ?? "")?.hasAttribute("data-sound-control"),
    ).toBe(true);
    await press("Enter");
    expect(fakes.toggleBackground).toHaveBeenCalledTimes(1);

    // By pointer: a click on the row.
    await act(async () => {
      (option("Background sound") as HTMLElement).click();
    });
    expect(fakes.toggleBackground).toHaveBeenCalledTimes(2);

    await act(async () => {
      fakes.sound.set({ status: "on", ticks: "off" });
    });
    expect(spoken(option("Background sound"))).toBe("Background sound, On");
    expect(status()).toBe("Background sound on");
  });

  it("REQ-NAV-04 REQ-SND-03 rows that keep the palette open tick select; rows that close it leave the press to the close", async () => {
    await render();
    await openPalette();
    await run("Calm mode");
    expect(fakes.ticks.slice(-1)).toEqual(["select"]);
    fakes.ticks.length = 0;
    await run("Ask for my CV");
    expect(fakes.open).toHaveBeenCalled();
    expect(fakes.ticks.filter((kind) => kind !== "move")).toEqual([]);
  });

  it("REQ-NAV-04 REQ-A11Y-04 Calm mode turns on from the palette and says so", async () => {
    fakes.setChosen.mockImplementation((on) =>
      fakes.calm.set({ calm: on, system: false, chosen: on }),
    );
    await render();
    await openPalette();
    await run("Calm mode");

    expect(fakes.setChosen).toHaveBeenCalledWith(true);
    expect(spoken(option("Calm mode"))).toBe("Calm mode, On");
    expect(status()).toBe("Calm mode on");
  });

  it("REQ-A11Y-03 REQ-A11Y-04 while the device asks for reduced motion, Calm mode stays on and says why", async () => {
    const system: CalmSnapshot = { calm: true, system: true, chosen: false };
    fakes.calm.set(system);
    fakes.setChosen.mockImplementation(() => fakes.calm.set(system));
    await render();
    await openPalette();

    expect(spoken(option("Calm mode"))).toBe(
      `Calm mode, On. ${paletteCopy.calmSystem}`,
    );
    await run("Calm mode");
    expect(fakes.setChosen).toHaveBeenCalledWith(false);
    expect(spoken(option("Calm mode"))).toContain("On");
    expect(status()).toBe(paletteCopy.calmSystem);
  });

  it("REQ-TIER-04 Quality tier opens a second page of Auto and the three tiers; Backspace on an empty search goes back", async () => {
    tierStore.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    tierStore.apply({
      type: "ready",
      tier: 1,
      particles: 1_000_000,
      look: "halftone",
    });
    await render();
    await openPalette();
    expect(spoken(option("Quality tier"))).toBe(
      "Quality tier, Auto · Tier 1 · WebGPU",
    );

    await run("Quality tier");
    expect(labels()).toEqual([
      "Auto",
      "Tier 1 · WebGPU",
      "Tier 2 · WebGL2",
      "Tier 3 · Still",
    ]);
    expect(activeLabel()).toBe("Auto");
    expect(spoken(option("Auto"))).toBe("Auto, Chosen");
    expect(document.activeElement).toBe(input());
    expect(input().placeholder).toBe("Choose a quality tier");
    expect(nameOf(dialog()?.querySelector('[data-part="palette-back"]'))).toBe(
      "Back to all commands",
    );

    await type("2");
    expect(labels()).toEqual(["Tier 2 · WebGL2"]);
    await type("");
    await press("Backspace");
    expect(labels()).toContain("Quality tier");
    expect(activeLabel()).toBe("Quality tier");
    expect(document.activeElement).toBe(input());
  });

  it("REQ-TIER-04 A14 choosing a tier forces it for the visit, says so, and shows the tier only once it has drawn", async () => {
    tierStore.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    tierStore.apply({ type: "ready", tier: 1, particles: 1_000_000 });
    await render();
    await openPalette();
    await run("Quality tier");
    await run("Tier 2 · WebGL2");

    expect(tierChoiceStore.getSnapshot()).toBe(2);
    expect(activeLabel()).toBe("Quality tier");
    expect(status()).toBe("Quality tier set to Tier 2 · WebGL2");
    // The engine is still on tier 1 from before: the choice alone shows.
    expect(spoken(option("Quality tier"))).toBe("Quality tier, Tier 2");

    await act(async () => {
      tierStore.apply({ type: "tierChosen", tier: 2, reason: "forced" });
      tierStore.apply({ type: "ready", tier: 2, particles: 250_000 });
    });
    expect(spoken(option("Quality tier"))).toBe(
      "Quality tier, Tier 2 · WebGL2",
    );
  });

  it("REQ-TIER-04 A14 a forced tier 1 that fell back to WebGL2 says what was asked, what runs and why", async () => {
    tierChoiceStore.set(1);
    await render();
    await openPalette();
    expect(spoken(option("Quality tier"))).toBe("Quality tier, Tier 1");

    await act(async () => {
      tierStore.apply({
        type: "tierChosen",
        tier: 2,
        reason: "webgpu-init-fallback",
      });
      tierStore.apply({ type: "ready", tier: 2, particles: 250_000 });
    });
    const why = "WebGPU did not start on this device, so Tier 2 · WebGL2 runs.";
    expect(spoken(option("Quality tier"))).toBe(
      `Quality tier, Tier 1 asked · Tier 2 · WebGL2. ${why}`,
    );
    expect(status()).toBe(why);
    // The row's note shows the reason, so the region says it only aloud.
    expect(statusShown()).toBe(false);

    await run("Quality tier");
    expect(spoken(option("Tier 1 · WebGPU"))).toBe("Tier 1 · WebGPU, Chosen");
    expect(
      dialog()?.querySelector('[data-part="palette-tier-note"]')?.textContent,
    ).toBe(why);
  });

  it("REQ-TIER-04 A14 on a page with no field the tier page says the choice waits for one, even after the home page drew a tier; on the home page it never says so", async () => {
    // The home page's field reported before the move to /work.
    act(() => {
      tierStore.apply({ type: "tierChosen", tier: 1, reason: "probe-pass" });
      tierStore.apply({ type: "ready", tier: 1, particles: 1_000_000 });
    });
    fakes.route.pathname = "/work";
    await render();
    await openPalette();
    await run("Quality tier");
    const note = () =>
      dialog()?.querySelector('[data-part="palette-tier-note"]')?.textContent ??
      null;
    expect(note()).toBe(paletteCopy.tierPage.waiting);
    await press("Escape");
    await settle();

    // On the home page before its first report the field is on its way.
    act(() => tierStore.reset());
    fakes.route.pathname = "/";
    await render();
    await openPalette();
    await run("Quality tier");
    expect(note()).toBeNull();
  });

  it("REQ-NAV-05 a hidden command shows only for its exact code and plays its egg, closing so the field shows", async () => {
    fakes.egg.mockReturnValue({ played: true });
    await render();
    await openPalette();

    await type("g");
    expect(labels()).not.toContain("Spell GG in the field");
    await type("GG");
    expect(labels()).toEqual(["Spell GG in the field"]);
    const group = option("Spell GG in the field").closest('[role="group"]');
    expect(nameOf(group)).toBe("Hidden");
    await press("Enter");
    expect(fakes.egg).toHaveBeenCalledWith("gg");
    expect(overlayStore.getSnapshot()).toBeNull();
    await settle();

    await openPalette();
    await type("logo");
    expect(labels()).toEqual(["Re-form the logo"]);
    await press("Enter");
    expect(fakes.egg).toHaveBeenLastCalledWith("mark");
  });

  it("REQ-NAV-05 A14 an egg that cannot play says why in the palette, which stays open", async () => {
    await render();
    await openPalette();

    fakes.egg.mockReturnValue({ played: false, reason: "calm" });
    await type("flip");
    await press("Enter");
    expect(fakes.egg).toHaveBeenCalledWith("flip");
    expect(dialog()).not.toBeNull();
    expect(status()).toBe("Calm mode is on, so the field holds still.");
    expect(statusShown()).toBe(true);

    fakes.egg.mockReturnValue({ played: false, reason: "still" });
    await press("Enter");
    expect(status()).toBe(
      "This device shows a still frame of the field, so it cannot move.",
    );
    // A still frame the visitor chose is named as their choice (A14).
    act(() => tierChoiceStore.set(3));
    await press("Enter");
    expect(status()).toBe(paletteCopy.eggRefusals["still-chosen"]);
    act(() => tierChoiceStore.set("auto"));

    fakes.egg.mockReturnValue({ played: false, reason: "no-field" });
    await press("Enter");
    expect(status()).toBe(
      "The field has not drawn yet. Try again in a moment.",
    );
    await settle();
    await act(async () => {
      overlayStore.close();
    });

    fakes.route.pathname = "/about";
    await render();
    await openPalette();
    await type("gg");
    await press("Enter");
    expect(status()).toBe(
      "There is no field on this page. The home page plays it.",
    );
  });

  it("REQ-NAV-04 copying the address says Copied only once the browser has written it", async () => {
    fakes.copy.mockResolvedValue(true);
    await render();
    await openPalette();
    await run("Copy email address");
    expect(fakes.copy).toHaveBeenCalledWith("hello@t7sen.com");
    await act(async () => {
      await Promise.resolve();
    });
    expect(spoken(option("Copy email address"))).toBe(
      "Copy email address, Copied",
    );
    expect(status()).toBe("Copied");
    // The row says Copied already, so the region says it only aloud.
    expect(statusShown()).toBe(false);
    expect(dialog()).not.toBeNull();
  });

  it("REQ-NAV-04 rule A11 a copy that fails shows the address selected with a line saying so, never Copied", async () => {
    fakes.copy.mockResolvedValue(false);
    await render();
    await openPalette();
    await run("Copy email address");
    await act(async () => {
      await Promise.resolve();
    });

    expect(status()).toBe(paletteCopy.copyFailed);
    expect(statusShown()).toBe(true);
    expect(dialog()?.textContent).not.toContain("Copied");
    const address = dialog()?.querySelector<HTMLInputElement>(
      '[data-part="palette-address"]',
    );
    expect(address?.value).toBe(site.email);
    expect(address?.readOnly).toBe(true);
    expect(nameOf(address)).toBe("Email address");
    expect(document.activeElement).toBe(address);
    expect(address?.selectionStart).toBe(0);
    expect(address?.selectionEnd).toBe(site.email.length);
  });

  it("REQ-NAV-04 Ask for my CV opens an email with its subject and closes the palette", async () => {
    await render();
    await openPalette();
    await run("Ask for my CV");
    expect(fakes.open).toHaveBeenCalledWith(
      "mailto:hello@t7sen.com?subject=CV%20request",
    );
    expect(overlayStore.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-04 every open starts afresh: the first page, an empty search, the first row", async () => {
    await render();
    await openPalette();
    await type("coup");
    await press("Escape");
    await settle();

    await openPalette();
    expect(input().value).toBe("");
    expect(activeLabel()).toBe("Making-of: this site");
  });

  it("REQ-NAV-03 REQ-NAV-04 opening the menu closes the palette, which leaves focus to it", async () => {
    await render();
    await openPalette();
    await act(async () => {
      overlayStore.open("menu");
    });
    await settle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).not.toBe(opener);
  });

  it("REQ-I18N-01 uses no physical left or right utility", async () => {
    await render();
    await openPalette();
    await run("Quality tier");
    const classes = [...(dialog()?.querySelectorAll("[class]") ?? []), dialog()]
      .map((node) => node?.getAttribute("class") ?? "")
      .join(" ");
    expect(findPhysicalClasses(classes)).toEqual([]);
  });
});
