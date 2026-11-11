import { renderToStaticMarkup } from "react-dom/server";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import HomePage from "@/app/page";
import type { ChapterId } from "@/engine/types";
import type { CalmSnapshot } from "@/lib/calm-store";

import { REVEAL_START } from "./motion-timing";
import { startStory, type StoryMotion } from "./story-runner";

type Span = { start: number; end: number };

type TriggerVars = {
  trigger?: Element;
  start?: string;
  end?: string;
  once?: boolean;
  pin?: unknown;
  snap?: unknown;
  scrub?: unknown;
  onUpdate?: () => void;
  onEnter?: () => void;
};

type TweenVars = Record<string, unknown>;

/**
 * A stand-in for GSAP that records what the story creates. Contexts collect
 * what is made inside them, nested ones included, and revert it in reverse,
 * as gsap.context does. Tweens write their opacity to the elements, so the
 * tests can see what a visitor would.
 */
function createFakeMotion(
  page: { position: number; spans: Map<Element, Span> },
  options: { failSplitAt?: number } = {},
) {
  type Revertible = { revert(): void };

  // The context whose function is running is last.
  const stack: FakeContext[] = [];
  const contexts: FakeContext[] = [];
  const triggers: FakeTrigger[] = [];
  const tweens: FakeTween[] = [];
  const splits: FakeSplit[] = [];
  const listeners = new Map<string, Set<() => void>>();

  function register(item: Revertible) {
    stack.at(-1)?.items.push(item);
  }

  class FakeContext {
    items: Revertible[] = [];
    isReverted = false;
    constructor(
      run: () => void,
      readonly scope: unknown,
    ) {
      this.add(run);
    }
    add(run: () => void) {
      const parent = stack.at(-1);
      if (parent !== undefined && parent !== this) parent.items.push(this);
      stack.push(this);
      try {
        return run();
      } finally {
        stack.pop();
      }
    }
    revert() {
      for (const item of this.items.splice(0).reverse()) item.revert();
      this.isReverted = true;
    }
  }

  class FakeTrigger {
    isKilled = false;
    start: number;
    end: number;
    constructor(readonly vars: TriggerVars) {
      const span = vars.trigger ? page.spans.get(vars.trigger) : undefined;
      this.start = span?.start ?? 0;
      this.end = span?.end ?? 0;
      triggers.push(this);
      register(this);
      // ScrollTrigger measures and updates each trigger as it is created.
      vars.onUpdate?.();
    }
    scroll() {
      return page.position;
    }
    kill() {
      this.isKilled = true;
    }
    revert() {
      this.kill();
    }
  }

  class FakeTween {
    isPlaying = false;
    isReverted = false;
    readonly elements: HTMLElement[];
    constructor(
      targets: HTMLElement | HTMLElement[],
      readonly from: TweenVars,
      readonly to: TweenVars,
    ) {
      this.elements = Array.isArray(targets) ? targets : [targets];
      for (const element of this.elements) {
        element.style.opacity = String(from.opacity);
      }
      tweens.push(this);
      register(this);
    }
    play() {
      this.isPlaying = true;
      for (const element of this.elements) {
        element.style.opacity = String(this.to.opacity);
      }
      return this;
    }
    revert() {
      this.isReverted = true;
      for (const element of this.elements) {
        element.style.removeProperty("opacity");
        if (element.getAttribute("style") === "") {
          element.removeAttribute("style");
        }
      }
    }
  }

  class FakeSplit {
    isReverted = false;
    readonly words: HTMLElement[];
    readonly original: string;
    constructor(
      readonly element: HTMLElement,
      readonly vars: TweenVars,
    ) {
      this.original = element.innerHTML;
      const text = element.textContent ?? "";
      element.setAttribute("aria-label", text);
      element.replaceChildren();
      this.words = text
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => {
          const span = document.createElement("span");
          span.textContent = word;
          span.setAttribute("aria-hidden", "true");
          element.append(span);
          return span;
        });
      splits.push(this);
      register(this);
    }
    revert() {
      if (this.isReverted) return;
      this.isReverted = true;
      this.element.innerHTML = this.original;
      this.element.removeAttribute("aria-label");
    }
  }

  const ScrollTrigger = {
    create: vi.fn((vars: TriggerVars) => new FakeTrigger(vars)),
    refresh: vi.fn(() => {
      for (const listener of listeners.get("refresh") ?? []) listener();
    }),
    addEventListener: vi.fn((type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    }),
    removeEventListener: vi.fn((type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  const gsap = {
    context: vi.fn((run: () => void, scope?: unknown) => {
      const context = new FakeContext(run, scope);
      contexts.push(context);
      return context;
    }),
    fromTo: vi.fn(
      (targets: HTMLElement | HTMLElement[], from: TweenVars, to: TweenVars) =>
        new FakeTween(targets, from, to),
    ),
  };
  let splitCount = 0;
  const SplitText = {
    create: vi.fn((element: HTMLElement, vars: TweenVars) => {
      splitCount += 1;
      if (splitCount === options.failSplitAt) throw new Error("split failed");
      return new FakeSplit(element, vars);
    }),
  };

  return {
    motion: { gsap, ScrollTrigger, SplitText } as unknown as StoryMotion,
    gsap,
    ScrollTrigger,
    SplitText,
    contexts,
    triggers,
    tweens,
    splits,
    listeners,
  };
}

function createCalm(calm: boolean) {
  let snapshot: CalmSnapshot = { calm, system: false, chosen: calm };
  const listeners = new Set<() => void>();
  return {
    listeners,
    store: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    set(next: boolean) {
      snapshot = { calm: next, system: false, chosen: next };
      for (const listener of [...listeners]) listener();
    },
  };
}

// The home page laid out in scroll pixels, as in story-progress.test.ts.
const CHAPTER_SPANS: Record<string, Span> = {
  hero: { start: -300, end: 400 },
  bloom: { start: 700, end: 1900 },
  work: { start: 1900, end: 3500 },
  "making-of": { start: 3500, end: 4300 },
  about: { start: 4300, end: 4900 },
  contact: { start: 4900, end: 5500 },
};
const VIEW = { innerHeight: 800 };

let root: HTMLElement;
let page: { position: number; spans: Map<Element, Span> };
let bridge: { setStory: Mock<(chapter: ChapterId, progress: number) => void> };

function chapterSections() {
  return [...root.querySelectorAll<HTMLElement>("section[data-chapter]")];
}

function titles() {
  return [...root.querySelectorAll<HTMLElement>("[data-story-title]")];
}

/** Puts every chapter title at a viewport top, in px. */
function placeTitles(top: number | ((title: HTMLElement) => number)) {
  for (const title of titles()) {
    const value = typeof top === "number" ? top : top(title);
    title.getBoundingClientRect = () => ({ top: value }) as DOMRect;
  }
}

function start(
  fake: ReturnType<typeof createFakeMotion>,
  calm = createCalm(false),
) {
  return startStory(fake.motion, {
    root,
    bridge,
    calm: calm.store,
    view: VIEW,
    fonts: null,
  });
}

beforeEach(() => {
  root = document.createElement("main");
  root.id = "main";
  root.innerHTML = renderToStaticMarkup(<HomePage />);
  document.body.append(root);

  page = { position: 0, spans: new Map() };
  for (const section of chapterSections()) {
    const span = CHAPTER_SPANS[section.dataset.chapter ?? ""];
    if (span) page.spans.set(section, span);
  }
  [...root.querySelectorAll("[data-work-step]")].forEach((item, index) => {
    page.spans.set(item, {
      start: 2100 + index * 300,
      end: 2300 + index * 300,
    });
  });
  bridge = {
    setStory: vi.fn<(chapter: ChapterId, progress: number) => void>(),
  };
  placeTitles(3000);
});

afterEach(() => {
  root.remove();
});

describe("story triggers", () => {
  it("REQ-SCR-01 one trigger per chapter, from its top at the middle to its bottom at the middle, and one per study card", () => {
    const fake = createFakeMotion(page);
    start(fake);

    const created = fake.ScrollTrigger.create.mock.calls.map(([vars]) => vars);
    const chapterVars = created.filter((vars) =>
      chapterSections().includes(vars.trigger as HTMLElement),
    );
    expect(
      chapterVars.map((vars) => (vars.trigger as HTMLElement).dataset.chapter),
    ).toEqual(["hero", "bloom", "work", "making-of", "about", "contact"]);
    for (const vars of chapterVars) {
      expect(vars.start).toBe("top center");
      expect(vars.end).toBe("bottom center");
      expect(vars.onUpdate).toBeTypeOf("function");
    }

    const steps = [...root.querySelectorAll("[data-work-step]")];
    const stepVars = created.filter((vars) =>
      steps.includes(vars.trigger as Element),
    );
    expect(stepVars.map((vars) => vars.trigger)).toEqual(steps);
    expect(steps).toHaveLength(5);
  });

  it("REQ-SCR-02 nothing is pinned, snapped or scrubbed", () => {
    const fake = createFakeMotion(page);
    start(fake);
    for (const [vars] of fake.ScrollTrigger.create.mock.calls) {
      expect(vars.pin).toBeUndefined();
      expect(vars.snap).toBeUndefined();
      expect(vars.scrub).toBeUndefined();
    }
  });

  it("REQ-SCR-01 sends the chapter in view once, at once, and nothing while the triggers are being made", () => {
    page.position = 1300;
    const fake = createFakeMotion(page);
    start(fake);
    expect(bridge.setStory.mock.calls).toEqual([["bloom", 0.5]]);
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(1);
  });

  it("REQ-SCR-01 every scroll update sends the chapter at the middle, whichever trigger reports it", () => {
    const fake = createFakeMotion(page);
    start(fake);
    const contact = fake.triggers.find(
      (trigger) =>
        (trigger.vars.trigger as HTMLElement | undefined)?.dataset.chapter ===
        "contact",
    );

    page.position = 3900;
    contact?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("making-of", 0.5);

    page.position = 3901;
    fake.triggers[0]?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("making-of", 401 / 800);
  });

  it("REQ-SCR-01 the services block keeps sending the hero at 1", () => {
    const fake = createFakeMotion(page);
    start(fake);
    page.position = 550;
    fake.triggers[0]?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("hero", 1);
  });

  it("REQ-SCR-01 the work chapter's progress comes from the card in view, in workStep's equal steps", () => {
    const fake = createFakeMotion(page);
    start(fake);
    // Halfway through the fourth card (index 3): (3 + 0.5) / 5.
    page.position = 3100;
    fake.triggers[0]?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("work", 0.7);
  });

  it("REQ-SCR-01 an unchanged story is not sent again", () => {
    const fake = createFakeMotion(page);
    start(fake);
    const count = bridge.setStory.mock.calls.length;
    fake.triggers[0]?.vars.onUpdate?.();
    fake.ScrollTrigger.refresh();
    expect(bridge.setStory).toHaveBeenCalledTimes(count);
  });

  it("REQ-SCR-01 a refresh sends the story from the new positions", () => {
    const fake = createFakeMotion(page);
    start(fake);
    const bloom = fake.triggers.find(
      (trigger) =>
        (trigger.vars.trigger as HTMLElement | undefined)?.dataset.chapter ===
        "bloom",
    );
    if (!bloom) throw new Error("no bloom trigger");
    bloom.start = -400;
    fake.ScrollTrigger.refresh();
    expect(bridge.setStory).toHaveBeenLastCalledWith("bloom", 400 / 2300);
  });

  it("REQ-SCR-01 positions are measured again once the fonts are ready", async () => {
    const fake = createFakeMotion(page);
    let ready: () => void = () => undefined;
    startStory(fake.motion, {
      root,
      bridge,
      calm: createCalm(false).store,
      view: VIEW,
      fonts: {
        ready: new Promise<FontFaceSet>(
          (resolve) => (ready = () => resolve({} as FontFaceSet)),
        ),
      },
    });
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(1);
    ready();
    await Promise.resolve();
    await Promise.resolve();
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(2);
  });

  it("REQ-SCR-01 the triggers live in one context scoped to main", () => {
    const fake = createFakeMotion(page);
    start(fake);
    expect(fake.contexts[0]?.scope).toBe(root);
  });
});

describe("chapter title reveals", () => {
  it("REQ-SCR-05 only the work, about and contact titles are revealed", () => {
    expect(titles().map((title) => title.textContent)).toEqual([
      "Work",
      "About",
      "Contact",
    ]);
    expect(root.querySelector("h1")?.hasAttribute("data-story-title")).toBe(
      false,
    );
  });

  it("REQ-SCR-05 a title below the fold rises word by word once it scrolls in, ease-out in 600 to 900 ms", () => {
    const fake = createFakeMotion(page);
    start(fake);

    expect(fake.SplitText.create).toHaveBeenCalledTimes(3);
    for (const [, vars] of fake.SplitText.create.mock.calls) {
      expect(vars).toMatchObject({ type: "words", mask: "words" });
    }
    for (const tween of fake.tweens) {
      expect(tween.from).toMatchObject({ yPercent: 100, opacity: 0 });
      expect(tween.to).toMatchObject({ yPercent: 0, opacity: 1, paused: true });
      expect(tween.to.duration).toBeGreaterThanOrEqual(0.6);
      expect(tween.to.duration).toBeLessThanOrEqual(0.9);
      expect(String(tween.to.ease)).toMatch(/\.out$/);
    }

    const reveals = fake.triggers.filter((trigger) => trigger.vars.once);
    expect(reveals.map((trigger) => trigger.vars.trigger)).toEqual(titles());
    for (const trigger of reveals) {
      expect(trigger.vars.start).toBe(REVEAL_START);
    }

    reveals[0]?.vars.onEnter?.();
    expect(fake.tweens[0]?.isPlaying).toBe(true);
    expect(fake.tweens[1]?.isPlaying).toBe(false);
  });

  it("REQ-SCR-05 REQ-CNT-01 a title already on screen or above is left as it is", () => {
    placeTitles((title) => (title.textContent === "Contact" ? 3000 : 100));
    const before = titles().map((title) => title.outerHTML);
    const fake = createFakeMotion(page);
    start(fake);

    expect(fake.SplitText.create).toHaveBeenCalledTimes(1);
    expect(fake.SplitText.create.mock.calls[0]?.[0].textContent).toBe(
      "Contact",
    );
    expect(titles()[0]?.outerHTML).toBe(before[0]);
    expect(titles()[1]?.outerHTML).toBe(before[1]);
  });

  it("REQ-CNT-01 the static HTML hides no title before the story runs", () => {
    for (const title of titles()) {
      expect(title.getAttribute("style")).toBeNull();
      expect(title.className).not.toMatch(/opacity|invisible|hidden/);
    }
  });

  it("REQ-A11Y-03 in calm mode or under reduced motion titles fade in whole, with no split and no movement", () => {
    const fake = createFakeMotion(page);
    start(fake, createCalm(true));

    expect(fake.SplitText.create).not.toHaveBeenCalled();
    expect(fake.tweens.map((tween) => tween.elements)).toEqual(
      titles().map((title) => [title]),
    );
    for (const tween of fake.tweens) {
      expect(tween.from).toEqual({ opacity: 0 });
      expect(tween.to).not.toHaveProperty("yPercent");
      expect(tween.to.duration).toBeLessThanOrEqual(0.4);
    }
  });

  it("REQ-A11Y-03 REQ-A11Y-04 turning calm on mid-page turns the waiting reveals into fades and leaves revealed titles alone", () => {
    const calm = createCalm(false);
    const fake = createFakeMotion(page);
    start(fake, calm);
    const [work] = titles();
    const firstReveal = fake.triggers.find((trigger) => trigger.vars.once);
    firstReveal?.vars.onEnter?.();
    const splitsBefore = [...fake.splits];

    calm.set(true);

    for (const split of splitsBefore) expect(split.isReverted).toBe(true);
    for (const trigger of fake.triggers
      .filter((t) => t.vars.once)
      .slice(0, 3)) {
      expect(trigger.isKilled).toBe(true);
    }
    expect(work?.textContent).toBe("Work");
    expect(work?.style.opacity).toBe("");
    expect(fake.SplitText.create).toHaveBeenCalledTimes(3);
    const fades = fake.tweens.slice(3);
    expect(fades.map((tween) => tween.elements[0]?.textContent)).toEqual([
      "About",
      "Contact",
    ]);
    for (const tween of fades) expect(tween.from).toEqual({ opacity: 0 });
  });

  it("REQ-CNT-01 a reveal that fails to rebuild on a calm change leaves the waiting titles whole", () => {
    const calm = createCalm(true);
    const fake = createFakeMotion(page, { failSplitAt: 2 });
    const before = titles().map((title) => title.outerHTML);
    start(fake, calm);
    expect(() => calm.set(false)).not.toThrow();
    expect(titles().map((title) => title.outerHTML)).toEqual(before);
    for (const trigger of fake.triggers.filter((t) => t.vars.once)) {
      expect(trigger.isKilled).toBe(true);
    }
  });

  it("REQ-A11Y-03 turning calm off again brings back the word reveals for titles still waiting", () => {
    const calm = createCalm(true);
    const fake = createFakeMotion(page);
    start(fake, calm);
    calm.set(false);
    expect(fake.SplitText.create).toHaveBeenCalledTimes(3);
    for (const title of titles()) expect(title.style.opacity).toBe("");
  });
});

describe("teardown", () => {
  it("REQ-SCR-04 reverts the context, kills every trigger, reverts every split and removes every listener", () => {
    const calm = createCalm(false);
    const fake = createFakeMotion(page);
    const before = titles().map((title) => title.outerHTML);
    const stop = start(fake, calm);
    expect(calm.listeners.size).toBe(1);
    expect(fake.listeners.get("refresh")?.size).toBe(1);

    stop();

    for (const context of fake.contexts) expect(context.isReverted).toBe(true);
    for (const trigger of fake.triggers) expect(trigger.isKilled).toBe(true);
    for (const split of fake.splits) expect(split.isReverted).toBe(true);
    for (const tween of fake.tweens) expect(tween.isReverted).toBe(true);
    expect(calm.listeners.size).toBe(0);
    expect(fake.listeners.get("refresh")?.size).toBe(0);
    expect(titles().map((title) => title.outerHTML)).toEqual(before);
  });

  it("REQ-SCR-04 after teardown nothing more is sent, and a second teardown is harmless", () => {
    const calm = createCalm(false);
    const fake = createFakeMotion(page);
    const stop = start(fake, calm);
    const count = bridge.setStory.mock.calls.length;
    stop();
    stop();

    page.position = 3900;
    fake.triggers[0]?.vars.onUpdate?.();
    fake.ScrollTrigger.refresh();
    calm.set(true);
    expect(bridge.setStory).toHaveBeenCalledTimes(count);
    expect(fake.SplitText.create).toHaveBeenCalledTimes(3);
  });

  it("REQ-SCR-04 the story starts again after a teardown, as on returning to the page", () => {
    const first = createFakeMotion(page);
    start(first)();
    page.position = 1300;
    const second = createFakeMotion(page);
    const stop = start(second);
    expect(second.ScrollTrigger.create.mock.calls.length).toBe(
      first.ScrollTrigger.create.mock.calls.length,
    );
    expect(bridge.setStory).toHaveBeenLastCalledWith("bloom", 0.5);
    expect(second.SplitText.create).toHaveBeenCalledTimes(3);
    stop();
  });

  it("REQ-CNT-01 REQ-SCR-04 if setting up fails part way, everything is undone and no title stays hidden", () => {
    const calm = createCalm(false);
    // The first title splits and gets its hidden start; the second fails.
    const fake = createFakeMotion(page, { failSplitAt: 2 });
    const before = titles().map((title) => title.outerHTML);

    expect(() => start(fake, calm)).toThrow("split failed");
    expect(fake.splits).toHaveLength(1);
    expect(fake.tweens).toHaveLength(1);
    expect(titles().map((title) => title.outerHTML)).toEqual(before);
    for (const split of fake.splits) expect(split.isReverted).toBe(true);
    for (const trigger of fake.triggers) expect(trigger.isKilled).toBe(true);
    for (const context of fake.contexts) expect(context.isReverted).toBe(true);
    expect(calm.listeners.size).toBe(0);
    expect(bridge.setStory).not.toHaveBeenCalled();
  });
});
