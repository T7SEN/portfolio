import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { soundCopy } from "@/content/sound";
import { calmStore } from "@/lib/calm-store";
import { overlayStore } from "@/lib/overlay-store";
import { SOUND_KEY, TICKS_KEY } from "@/lib/sound-choice";
import { soundPanelStore } from "@/lib/sound-panel-store";
import type {
  SoundStatus,
  SpectrumReader,
  TicksStatus,
} from "@/lib/sound-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { resetHintForTests } from "./hint-moment";
import { PEAK_SCALE, REST_SCALE } from "./levels";
import { HINT_FADE_MS, SoundHint } from "./sound-hint";
import {
  LEVEL_BARS,
  PANEL_GUTTER,
  SoundToggle,
  type SoundToggleVariant,
  wordsKey,
} from "./sound-toggle";

// The sound store as the pill sees it: the two settings the test sets, the
// two presses, and the frame loop's readers.
const sound = vi.hoisted(() => {
  type Snapshot = { status: SoundStatus; ticks: TicksStatus };
  const listeners = new Set<() => void>();
  const readers = new Set<SpectrumReader>();
  const state: Snapshot = { status: "off", ticks: "off" };
  const snapshots = new Map<string, Snapshot>();
  const snapshot = () => {
    const key = `${state.status} ${state.ticks}`;
    if (!snapshots.has(key)) snapshots.set(key, { ...state });
    return snapshots.get(key) as Snapshot;
  };
  return {
    readers,
    set(status: SoundStatus, ticks: TicksStatus = state.ticks) {
      state.status = status;
      state.ticks = ticks;
      for (const listener of [...listeners]) listener();
    },
    store: {
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getSnapshot: snapshot,
      getServerSnapshot: () => ({ status: "off", ticks: "off" }) as Snapshot,
      toggleBackground: vi.fn(),
      toggleTicks: vi.fn(),
      resumeWaiting: vi.fn(),
      tick: vi.fn(),
      ticksAsked: () => 0,
      getAnalyser: () => null,
      subscribeSpectrum(reader: SpectrumReader) {
        readers.add(reader);
        return () => {
          readers.delete(reader);
        };
      },
    },
  };
});

vi.mock("@/lib/sound-store", () => ({ soundStore: sound.store }));

const VARIANTS: SoundToggleVariant[] = ["bar", "menu", "footer"];

function staticHtml(variant: SoundToggleVariant) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<SoundToggle variant={variant} />);
  return host;
}

function classesOf(element: Element | null | undefined) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

function allClasses(element: Element) {
  return [element, ...element.querySelectorAll("[class]")]
    .map((node) => node.getAttribute("class") ?? "")
    .join(" ");
}

let host: HTMLDivElement;
let root: Root;

async function mount(element: React.ReactElement) {
  await act(async () => {
    root.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  sound.set("off", "off");
  sound.store.toggleBackground.mockClear();
  sound.store.toggleTicks.mockClear();
  calmStore.setChosen(false);
  window.localStorage.clear();
  resetHintForTests();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
  document.body.replaceChildren();
  calmStore.setChosen(false);
  overlayStore.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SoundToggle, static HTML", () => {
  it.each(VARIANTS)(
    "REQ-SND-01 REQ-A11Y-02 %s: off in the static HTML, a disclosure button named for its state, then Sound settings, its panel closed",
    (variant) => {
      const html = staticHtml(variant);
      const button = html.querySelector("button");
      expect(button?.getAttribute("type")).toBe("button");
      expect(button?.getAttribute("aria-label")).toBe(
        "Sound off. Sound settings",
      );
      expect(button?.getAttribute("aria-expanded")).toBe("false");
      expect(button?.hasAttribute("aria-pressed")).toBe(false);
      expect(button?.textContent).toContain("Sound off");
      // The panel it controls is in the page, hidden and empty.
      const panel = html.querySelector(
        `[id="${button?.getAttribute("aria-controls")}"]`,
      );
      expect(panel?.getAttribute("role")).toBe("group");
      expect(panel?.getAttribute("aria-label")).toBe("Sound settings");
      expect(panel?.hasAttribute("hidden")).toBe(true);
      expect(panel?.querySelector("button")).toBeNull();
      // Marked as a sound control, so a press on it while a returning
      // visitor's background waits is left to its own click.
      expect(button?.getAttribute("data-sound-control")).toBe("");
    },
  );

  it.each(VARIANTS)(
    "REQ-A11Y-02 %s: a 44 px target, the speaker and five level bars hidden from assistive technology",
    (variant) => {
      const button = staticHtml(variant).querySelector("button");
      expect(classesOf(button)).toEqual(
        expect.arrayContaining(["min-h-11", "min-w-11"]),
      );
      const svg = button?.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
      const bars = button?.querySelectorAll('[aria-hidden="true"] > span');
      expect(bars).toHaveLength(5);
      expect([...(bars ?? [])].map((bar) => bar.getAttribute("style"))).toEqual(
        LEVEL_BARS.map((height) => `height:${height}px`),
      );
    },
  );

  it("REQ-NAV-02 bar and menu: a square icon button below 640 px with the words hidden; the footer pill keeps them", () => {
    for (const variant of ["bar", "menu"] as const) {
      const button = staticHtml(variant).querySelector("button");
      expect(classesOf(button)).toEqual(
        expect.arrayContaining(["max-sm:size-11", "max-sm:rounded-xl"]),
      );
      const words = [...(button?.querySelectorAll("span") ?? [])].find(
        (span) => span.textContent === "Sound off",
      );
      expect(classesOf(words)).toContain("max-sm:hidden");
    }
    const footer = staticHtml("footer").querySelector("button");
    expect(classesOf(footer)).not.toContain("max-sm:size-11");
  });

  it("REQ-SND-02 only the bar's pill carries the hint's status region, empty until its moment", () => {
    const bar = staticHtml("bar").querySelector('[role="status"]');
    expect(bar).not.toBeNull();
    expect(bar?.textContent).toBe("");
    expect(classesOf(bar)).toContain("pointer-events-none");
    expect(staticHtml("menu").querySelector('[role="status"]')).toBeNull();
    expect(staticHtml("footer").querySelector('[role="status"]')).toBeNull();
  });

  it("REQ-I18N-01 uses logical utilities only", () => {
    for (const variant of VARIANTS) {
      expect(findPhysicalClasses(allClasses(staticHtml(variant)))).toEqual([]);
    }
  });
});

describe("SoundToggle, the pill's words", () => {
  it.each([
    ["off", "off", "off"],
    ["on", "on", "on"],
    ["starting", "on", "on"],
    ["waiting", "on", "on"],
    ["on", "off", "background"],
    ["starting", "off", "background"],
    ["waiting", "off", "background"],
    ["off", "on", "interface"],
    ["failed", "on", "failed"],
    ["on", "failed", "failed"],
  ] as const)(
    "REQ-SND-01 background %s and interface sounds %s read as %s",
    (status, ticks, key) => {
      expect(wordsKey(status, ticks)).toBe(key);
    },
  );

  it("REQ-SND-01 REQ-A11Y-02 the four states show their words, and each name starts with them, then Sound settings (WCAG 2.5.3)", async () => {
    await mount(<SoundToggle variant="footer" />);
    const button = () => host.querySelector("button");
    for (const [status, ticks, words] of [
      ["off", "off", "Sound off"],
      ["on", "on", "Sound on"],
      ["on", "off", "Background only"],
      ["off", "on", "Interface only"],
      ["failed", "off", "Sound failed"],
    ] as const) {
      await act(async () => sound.set(status, ticks));
      expect(button()?.textContent).toContain(words);
      expect(button()?.getAttribute("aria-label")).toBe(
        `${words}. Sound settings`,
      );
    }
  });

  it.each(VARIANTS)(
    "REQ-SND-01 REQ-SND-02 %s: while a returning visitor's background waits, the pill keeps its word, its bars at rest",
    async (variant) => {
      await mount(<SoundToggle variant={variant} />);
      await act(async () => sound.set("waiting", "off"));
      const pill = host.querySelector("button");
      expect(pill?.getAttribute("data-sound")).toBe("waiting");
      expect(pill?.textContent).toContain("Background only");
      expect(pill?.getAttribute("aria-label")).toBe(
        "Background only. Sound settings",
      );
      // Nothing plays yet: no frame loop reader, the bars as drawn.
      expect(sound.readers.size).toBe(0);
      await act(async () => sound.set("waiting", "on"));
      expect(pill?.textContent).toContain("Sound on");
    },
  );
});

describe("SoundToggle, the level bars", () => {
  function levelBars() {
    return [
      ...(host
        .querySelector("button")
        ?.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span') ?? []),
    ];
  }

  it("REQ-SND-03 the bars follow the background while it plays, never the interface sounds alone, and rest as drawn when it stops", async () => {
    await mount(<SoundToggle variant="footer" />);
    expect(sound.readers.size).toBe(0);
    await act(async () => sound.set("off", "on"));
    expect(sound.readers.size).toBe(0);
    await act(async () => sound.set("on", "on"));
    expect(sound.readers.size).toBe(1);

    const bins = new Uint8Array(512).fill(220);
    for (const reader of sound.readers) reader({ bins, binHz: 46.875 }, 16);
    for (const bar of levelBars()) {
      const scale = Number(
        /^scaleY\(([\d.]+)\)$/.exec(bar.style.transform)?.[1],
      );
      expect(scale).toBeGreaterThanOrEqual(REST_SCALE);
      expect(scale).toBeLessThanOrEqual(PEAK_SCALE);
    }

    await act(async () => sound.set("off", "on"));
    expect(sound.readers.size).toBe(0);
    for (const bar of levelBars()) expect(bar.style.transform).toBe("");
  });

  it("REQ-A11Y-03 REQ-A11Y-04 in calm mode the bars rest as drawn, sound on or not", async () => {
    await mount(<SoundToggle variant="footer" />);
    await act(async () => sound.set("on"));
    expect(sound.readers.size).toBe(1);
    await act(async () => calmStore.setChosen(true));
    expect(sound.readers.size).toBe(0);
    for (const bar of levelBars()) expect(bar.style.transform).toBe("");
  });
});

describe("SoundToggle, the panel", () => {
  function pill(scope: ParentNode = host) {
    const found = scope.querySelector<HTMLButtonElement>(
      '[data-part="sound-pill"]',
    );
    if (found === null) throw new Error("no pill");
    return found;
  }

  function panel(scope: ParentNode = host) {
    return scope.querySelector<HTMLElement>('[data-part="sound-panel"]');
  }

  function switches(scope: ParentNode = host) {
    return [
      ...(panel(scope)?.querySelectorAll<HTMLButtonElement>(
        '[role="switch"]',
      ) ?? []),
    ];
  }

  function describedBy(element: Element | undefined) {
    const id = element?.getAttribute("aria-describedby") ?? "";
    return document.getElementById(id)?.textContent;
  }

  function labelledBy(element: Element | undefined) {
    const id = element?.getAttribute("aria-labelledby") ?? "";
    return document.getElementById(id)?.textContent;
  }

  async function press(element: HTMLElement) {
    await act(async () => {
      element.click();
    });
  }

  async function openPanel(scope: ParentNode = host) {
    await press(pill(scope));
  }

  it("REQ-SND-01 REQ-A11Y-02 a press opens the panel: expanded, two 44 px switches named Background and Interface sounds with their lines, focus on the first", async () => {
    await mount(<SoundToggle variant="bar" />);
    await openPanel();
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    expect(panel()?.hasAttribute("hidden")).toBe(false);
    expect(panel()?.id).toBe(pill().getAttribute("aria-controls"));

    const [background, ticks] = switches();
    expect(switches()).toHaveLength(2);
    // Each named by its words alone, its line its description.
    expect(labelledBy(background)).toBe("Background");
    expect(describedBy(background)).toBe("Rain at sea");
    expect(labelledBy(ticks)).toBe("Interface sounds");
    expect(describedBy(ticks)).toBe("Clicks and hovers");
    for (const each of switches()) {
      expect(each.getAttribute("aria-checked")).toBe("false");
      expect(each.getAttribute("type")).toBe("button");
      expect(classesOf(each)).toContain("min-h-11");
      expect(each.getAttribute("data-sound-control")).toBe("");
      expect(each.querySelector('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(document.activeElement).toBe(background);
  });

  it("REQ-SND-01 the switches turn each setting over inside the press and show it, a waiting background on", async () => {
    await mount(<SoundToggle variant="menu" />);
    await openPanel();
    const [background, ticks] = switches();
    if (background === undefined || ticks === undefined) {
      throw new Error("no switches");
    }
    await press(background);
    expect(sound.store.toggleBackground).toHaveBeenCalledTimes(1);
    await press(ticks);
    expect(sound.store.toggleTicks).toHaveBeenCalledTimes(1);

    await act(async () => sound.set("waiting", "on"));
    expect(background.getAttribute("aria-checked")).toBe("true");
    expect(ticks.getAttribute("aria-checked")).toBe("true");
    await act(async () => sound.set("starting", "off"));
    expect(background.getAttribute("aria-checked")).toBe("true");
    expect(ticks.getAttribute("aria-checked")).toBe("false");
    // The panel stays open while the settings change.
    expect(pill().getAttribute("aria-expanded")).toBe("true");
  });

  it("REQ-SND-01 A11 a setting that could not start says so in its line, unchecked, and a press tries again", async () => {
    await mount(<SoundToggle variant="bar" />);
    await openPanel();
    const status = panel()?.querySelector('[role="status"]');
    expect(status?.textContent).toBe("");
    await act(async () => sound.set("off", "failed"));
    // Said once, in the panel's polite status region (WCAG 4.1.3).
    expect(status?.textContent).toBe(
      `${soundCopy.panel.ticks.label}: ${soundCopy.panel.failed}`,
    );
    await act(async () => sound.set("failed", "failed"));
    expect(status?.textContent).toBe(
      `${soundCopy.panel.background.label}, ${soundCopy.panel.ticks.label}: ${soundCopy.panel.failed}`,
    );
    for (const each of switches()) {
      expect(each.getAttribute("aria-checked")).toBe("false");
      expect(describedBy(each)).toBe(soundCopy.panel.failed);
    }
  });

  it("REQ-A11Y-02 Esc closes the panel and gives focus back to the pill, and goes no further, so the menu around it stays open", async () => {
    await mount(<SoundToggle variant="menu" />);
    const heardByPage = vi.fn();
    document.addEventListener("keydown", heardByPage, true);
    await openPanel();
    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(pill().getAttribute("aria-expanded")).toBe("false");
    expect(panel()?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(pill());
    expect(heardByPage).not.toHaveBeenCalled();
    document.removeEventListener("keydown", heardByPage, true);
  });

  it("REQ-A11Y-02 a press outside closes it; a press inside does not; the pill again closes it", async () => {
    await mount(<SoundToggle variant="bar" />);
    const outside = document.createElement("button");
    document.body.append(outside);
    await openPanel();
    const [background] = switches();
    await act(async () => {
      background?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(pill().getAttribute("aria-expanded")).toBe("false");

    await openPanel();
    await openPanel();
    expect(pill().getAttribute("aria-expanded")).toBe("false");
  });

  it("REQ-A11Y-02 Tab moves through the panel; focus leaving it closes it", async () => {
    await mount(<SoundToggle variant="bar" />);
    const after = document.createElement("button");
    document.body.append(after);
    await openPanel();
    const [, ticks] = switches();
    await act(async () => ticks?.focus());
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    await act(async () => pill().focus());
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    await act(async () => after.focus());
    expect(pill().getAttribute("aria-expanded")).toBe("false");
  });

  it("REQ-NAV-03 one panel at a time, and the menu or the palette opening closes it", async () => {
    await mount(
      <>
        <div data-scope="bar">
          <SoundToggle variant="bar" />
        </div>
        <div data-scope="footer">
          <SoundToggle variant="footer" />
        </div>
      </>,
    );
    const bar = host.querySelector('[data-scope="bar"]') as HTMLElement;
    const footer = host.querySelector('[data-scope="footer"]') as HTMLElement;
    await openPanel(bar);
    // Focus moves into the footer's panel, which closes the bar's.
    await openPanel(footer);
    expect(pill(bar).getAttribute("aria-expanded")).toBe("false");
    expect(pill(footer).getAttribute("aria-expanded")).toBe("true");
    await act(async () => overlayStore.open("palette"));
    expect(pill(footer).getAttribute("aria-expanded")).toBe("false");
    expect(soundPanelStore.getSnapshot()).toBeNull();
  });

  it("REQ-A11Y-02 REQ-NAV-04 Ctrl K pressed in the open panel: the palette's close gives focus back to the pill, not the page", async () => {
    await mount(<SoundToggle variant="bar" />);
    await openPanel();
    expect(document.activeElement).toBe(switches()[0]);
    await act(async () => overlayStore.open("palette"));
    expect(panel()?.hidden).toBe(true);
    await act(async () => overlayStore.close());
    expect(overlayStore.takeReturnFocus()).toBe(pill());
  });

  it("REQ-NAV-02 the bar's and the menu's panel float under the pill from its end with a pointer; the footer's opens in place under its pill, covering nothing", async () => {
    await mount(<SoundToggle variant="bar" />);
    await openPanel();
    expect(classesOf(panel())).toEqual(
      expect.arrayContaining(["top-full", "end-0", "bg-raised", "z-50"]),
    );
    const pointer = host.querySelector("svg.fill-raised");
    expect(classesOf(pointer)).toEqual(
      expect.arrayContaining(["top-full", "inset-x-0", "mx-auto"]),
    );
    expect(findPhysicalClasses(allClasses(host))).toEqual([]);

    // A new pill, not the bar's one shown again.
    await mount(<SoundToggle key="footer" variant="footer" />);
    await openPanel();
    const inPlace = classesOf(panel());
    expect(inPlace).toEqual(
      expect.arrayContaining([
        "order-last",
        "me-[calc(100%-16rem)]",
        "bg-raised",
      ]),
    );
    for (const floating of ["absolute", "top-full", "bottom-full", "z-50"]) {
      expect(inPlace).not.toContain(floating);
    }
    // Pill and panel join the footer's row, so the panel wraps under both.
    expect(classesOf(panel()?.parentElement ?? null)).toEqual(["contents"]);
    expect(host.querySelector("svg.fill-raised")).toBeNull();
  });

  it("REQ-NAV-02 at 320 px the panel moves along to stay inside the gutters", async () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      320,
    );
    const original = HTMLElement.prototype.getBoundingClientRect;
    // Hung from the end of a square about 120 px from the start.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.part !== "sound-panel") return original.call(this);
        return { left: -92, right: 164, width: 256 } as DOMRect;
      },
    );
    await mount(<SoundToggle variant="bar" />);
    await openPanel();
    // The page reads "108px 0" back as "108px".
    expect(panel()?.style.getPropertyValue("translate")).toMatch(
      new RegExp(`^${PANEL_GUTTER + 92}px( 0(px)?)?$`),
    );
  });

  it("REQ-SND-02 the panel closes with the pill: an unmount while open leaves no panel in the store", async () => {
    await mount(<SoundToggle variant="menu" />);
    await openPanel();
    expect(soundPanelStore.getSnapshot()).not.toBeNull();
    await mount(<></>);
    expect(soundPanelStore.getSnapshot()).toBeNull();
  });
});

describe("SoundHint", () => {
  function hintText() {
    return host.querySelector('[role="status"]')?.textContent ?? "";
  }

  async function mountHint() {
    let run: (() => void) | null = null;
    const afterFirstContent = (next: () => void) => {
      run = next;
      return () => undefined;
    };
    await mount(<SoundHint afterFirstContent={afterFirstContent} />);
    return () => run?.();
  }

  it("REQ-SND-02 shows the words in a polite status region once the hero settles, then goes", async () => {
    vi.useFakeTimers();
    const firstContent = await mountHint();
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(hintText()).toBe("");

    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(hintText()).toMatch(
      /^The field has sound\. Turn it on here, or any time from (?:Ctrl K|search)\.$/,
    );
    // Not a dialog, holds no control, takes no focus.
    expect(host.querySelector("button, a, [tabindex]")).toBeNull();
    expect(document.activeElement).not.toBe(host.querySelector("p"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(host.querySelector("p")?.hasAttribute("data-leaving")).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HINT_FADE_MS);
    });
    expect(hintText()).toBe("");
  });

  it.each([
    ["the background starting", "starting", "off"],
    ["the interface sounds turned on", "off", "on"],
  ] as const)(
    "REQ-SND-02 goes as soon as a setting turns on: %s",
    async (_name, status, ticks) => {
      vi.useFakeTimers();
      const firstContent = await mountHint();
      await act(async () => {
        firstContent();
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(hintText()).not.toBe("");
      await act(async () => {
        sound.set(status, ticks);
        await vi.advanceTimersByTimeAsync(HINT_FADE_MS);
      });
      expect(hintText()).toBe("");
    },
  );

  it("REQ-SND-02 goes when a sound panel opens in its place, and never shows over one", async () => {
    vi.useFakeTimers();
    const firstContent = await mountHint();
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(hintText()).not.toBe("");
    await act(async () => {
      soundPanelStore.open("pill");
      await vi.advanceTimersByTimeAsync(HINT_FADE_MS);
    });
    expect(hintText()).toBe("");
    soundPanelStore.close("pill");

    // A panel already open at the moment: no hint.
    resetHintForTests();
    window.localStorage.clear();
    soundPanelStore.open("pill");
    const again = await mountHint();
    await act(async () => {
      again();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(hintText()).toBe("");
    soundPanelStore.close("pill");
  });

  it("REQ-SND-02 never shows while sound is on", async () => {
    vi.useFakeTimers();
    sound.set("on");
    const firstContent = await mountHint();
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(hintText()).toBe("");
  });

  it("REQ-SND-02 for a visitor who left the background on, the note shows in the hint's place while it waits, and goes when it starts", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(SOUND_KEY, "on");
    window.localStorage.setItem(TICKS_KEY, "on");
    sound.set("waiting", "on");
    const firstContent = await mountHint();
    expect(hintText()).toBe("");
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(hintText()).toBe("Sound starts on your first click or key.");
    expect(host.querySelector("p")?.getAttribute("data-notice")).toBe("note");
    expect(host.querySelector("button, a, [tabindex]")).toBeNull();
    // A note is not the hint: the hint stays unseen for this visitor.
    expect(window.localStorage.getItem("portfolio:sound-hint")).toBeNull();

    await act(async () => {
      sound.set("starting");
      await vi.advanceTimersByTimeAsync(HINT_FADE_MS);
    });
    expect(hintText()).toBe("");
  });

  it("REQ-SND-02 the note goes by itself after about 6 s", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(SOUND_KEY, "on");
    sound.set("waiting");
    const firstContent = await mountHint();
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(1500 + 6000 + HINT_FADE_MS);
    });
    expect(hintText()).toBe("");
  });

  it.each([
    [SOUND_KEY, "off"],
    [SOUND_KEY, "on"],
    [TICKS_KEY, "off"],
    [TICKS_KEY, "on"],
  ])(
    "REQ-SND-02 the first-visit hint shows only when no choice is saved: never after %s saved %s",
    async (key, saved) => {
      vi.useFakeTimers();
      window.localStorage.setItem(key, saved);
      const firstContent = await mountHint();
      await act(async () => {
        firstContent();
        await vi.advanceTimersByTimeAsync(3000);
      });
      // Both settings are off here: a saved background on with no waiting
      // store shows no note either.
      expect(hintText()).toBe("");
      expect(window.localStorage.getItem("portfolio:sound-hint")).toBeNull();
    },
  );

  it("REQ-SND-02 a choice of either setting made after the page loaded keeps the hint away too", async () => {
    vi.useFakeTimers();
    const firstContent = await mountHint();
    // Interface sounds turned on and off again before the hero settled.
    window.localStorage.setItem(TICKS_KEY, "off");
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(hintText()).toBe("");
  });

  it("REQ-I18N-01 the hint and its pointer use logical utilities only", async () => {
    vi.useFakeTimers();
    const firstContent = await mountHint();
    await act(async () => {
      firstContent();
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(findPhysicalClasses(allClasses(host))).toEqual([]);
    expect(classesOf(host.querySelector("svg"))).toEqual(
      expect.arrayContaining(["end-4", "sm:end-10"]),
    );
  });
});
