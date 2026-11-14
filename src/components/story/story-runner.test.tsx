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
import { SLIDE_MOVED } from "@/components/home/pass-slide";
import type { ChapterId, PassCard, Stage, Stages } from "@/engine/types";
import type { CalmSnapshot } from "@/lib/calm-store";

import { REVEAL_START } from "./motion-timing";
import { startStory, type StoryMotion } from "./story-runner";
import { screenStage, type PageLayout } from "./story-stage";
import { VEIL_FADE_MS, veilFor } from "./story-veil";

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
let bridge: {
  setStory: Mock<(chapter: ChapterId, progress: number) => void>;
  setStage: Mock<(stages: Stages) => void>;
  setPasses: Mock<(cards: readonly PassCard[] | null) => void>;
  setVeil: Mock<(veil: number | null) => void>;
};

function chapterSections() {
  return [...root.querySelectorAll<HTMLElement>("section[data-chapter]")];
}

function titles() {
  return [...root.querySelectorAll<HTMLElement>("[data-story-title]")];
}

function intros() {
  return [...root.querySelectorAll<HTMLElement>("[data-story-intro]")];
}

/** The tweens on titles or their words, not on the lines under them. */
function titleTweens<Tween extends { elements: HTMLElement[] }>(fake: {
  tweens: Tween[];
}): Tween[] {
  return fake.tweens.filter(
    (tween) => !tween.elements[0]?.hasAttribute("data-story-intro"),
  );
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
    setStage: vi.fn<(stages: Stages) => void>(),
    setPasses: vi.fn<(cards: readonly PassCard[] | null) => void>(),
    setVeil: vi.fn<(veil: number | null) => void>(),
  };
  placeTitles(3000);
});

afterEach(() => {
  root.remove();
  // Tests that never stop the story leave its plate layer behind.
  for (const layer of document.querySelectorAll("[data-part='veil-plates']")) {
    layer.remove();
  }
});

describe("story triggers", () => {
  it("REQ-SCR-01 one trigger per chapter, from its top at the middle to its bottom at the middle, and one per study row", () => {
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
    // One row per full study, one shape each; the short studies are not
    // steps.
    expect(steps).toHaveLength(3);
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

  it("REQ-SCR-01 a gap between two chapters keeps sending the chapter above at 1", () => {
    const fake = createFakeMotion(page);
    start(fake);
    page.position = 550;
    fake.triggers[0]?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("hero", 1);
  });

  it("REQ-SCR-01 the work chapter's progress comes from the study row in view, in workStep's equal steps", () => {
    const fake = createFakeMotion(page);
    start(fake);
    // Halfway through the third row (index 2): (2 + 0.5) / 3.
    page.position = 2800;
    fake.triggers[0]?.vars.onUpdate?.();
    expect(bridge.setStory).toHaveBeenLastCalledWith("work", 2.5 / 3);
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
  it("REQ-SCR-05 only the work, making-of, about and contact titles are revealed", () => {
    expect(titles().map((title) => title.textContent)).toEqual([
      "Selected work",
      "How one frame is built",
      "Real time, on and off stream.",
      "Send a message.",
    ]);
    expect(root.querySelector("h1")?.hasAttribute("data-story-title")).toBe(
      false,
    );
  });

  it("REQ-SCR-05 a title below the fold rises word by word once it scrolls in, ease-out in 600 to 900 ms", () => {
    const fake = createFakeMotion(page);
    start(fake);

    expect(fake.SplitText.create).toHaveBeenCalledTimes(4);
    for (const [, vars] of fake.SplitText.create.mock.calls) {
      expect(vars).toMatchObject({ type: "words", mask: "words" });
    }
    for (const tween of titleTweens(fake)) {
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
    expect(titleTweens(fake)[0]?.isPlaying).toBe(true);
    expect(titleTweens(fake)[1]?.isPlaying).toBe(false);
  });

  it("REQ-SCR-05 the line under a title waits hidden with it and fades in on the same trigger, trailing its words", () => {
    const fake = createFakeMotion(page);
    start(fake);
    expect(intros()).toHaveLength(3);
    for (const intro of intros()) expect(intro.style.opacity).toBe("0");

    const following = fake.tweens.filter((tween) =>
      tween.elements[0]?.hasAttribute("data-story-intro"),
    );
    expect(following.map((tween) => tween.elements[0])).toEqual(intros());
    for (const tween of following) {
      expect(tween.from).toEqual({ opacity: 0 });
      expect(tween.to).not.toHaveProperty("yPercent");
      // Slower than the title's 0.8 s and easing in, so it arrives after.
      expect(tween.to.duration).toBeGreaterThan(0.8);
      expect(tween.to.duration).toBeLessThanOrEqual(0.9);
      expect(String(tween.to.ease)).toMatch(/.inOut$/);
    }

    const reveals = fake.triggers.filter((trigger) => trigger.vars.once);
    reveals[0]?.vars.onEnter?.();
    expect(following[0]?.isPlaying).toBe(true);
    expect(following[1]?.isPlaying).toBe(false);
  });

  it("REQ-CNT-01 the static HTML hides no line under a title", () => {
    for (const intro of intros()) {
      expect(intro.getAttribute("style")).toBeNull();
    }
  });

  it("REQ-SCR-05 REQ-CNT-01 a title already on screen or above is left as it is", () => {
    placeTitles((title) =>
      title.textContent === "Send a message." ? 3000 : 100,
    );
    const before = titles().map((title) => title.outerHTML);
    const fake = createFakeMotion(page);
    start(fake);

    expect(fake.SplitText.create).toHaveBeenCalledTimes(1);
    // Split into words, the title keeps its name as its label.
    expect(
      fake.SplitText.create.mock.calls[0]?.[0].getAttribute("aria-label"),
    ).toBe("Send a message.");
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
    expect(titleTweens(fake).map((tween) => tween.elements)).toEqual(
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
      .slice(0, 4)) {
      expect(trigger.isKilled).toBe(true);
    }
    expect(work?.textContent).toBe("Selected work");
    expect(work?.style.opacity).toBe("");
    expect(fake.SplitText.create).toHaveBeenCalledTimes(4);
    const fades = titleTweens(fake).slice(4);
    expect(fades.map((tween) => tween.elements[0]?.textContent)).toEqual([
      "How one frame is built",
      "Real time, on and off stream.",
      "Send a message.",
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
    expect(fake.SplitText.create).toHaveBeenCalledTimes(4);
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
    expect(fake.SplitText.create).toHaveBeenCalledTimes(4);
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
    expect(second.SplitText.create).toHaveBeenCalledTimes(4);
    stop();
  });

  it("REQ-CNT-01 REQ-SCR-04 if setting up fails part way, everything is undone and no title stays hidden", () => {
    const calm = createCalm(false);
    // The first title splits and gets its hidden start; the second fails.
    const fake = createFakeMotion(page, { failSplitAt: 2 });
    const before = titles().map((title) => title.outerHTML);

    expect(() => start(fake, calm)).toThrow("split failed");
    expect(fake.splits).toHaveLength(1);
    // The first title's rise and the fade of the line under it.
    expect(fake.tweens).toHaveLength(2);
    expect(titles().map((title) => title.outerHTML)).toEqual(before);
    for (const intro of intros()) expect(intro.style.opacity).toBe("");
    for (const split of fake.splits) expect(split.isReverted).toBe(true);
    for (const trigger of fake.triggers) expect(trigger.isKilled).toBe(true);
    for (const context of fake.contexts) expect(context.isReverted).toBe(true);
    expect(calm.listeners.size).toBe(0);
    expect(bridge.setStory).not.toHaveBeenCalled();
  });
});

describe("the field's layout", () => {
  const hero = { x: 0, y: -0.6, halfWidth: 0, halfHeight: 0 };
  const work = { x: 0.45, y: 0, halfWidth: 0.4, halfHeight: 0.85 };

  function fakeTier(live: 1 | 2 | 3) {
    const listeners = new Set<() => void>();
    let snapshot = {
      tier: live as 1 | 2 | 3 | null,
      reason: null,
      ready: true,
      particles: live === 3 ? 0 : 250_000,
      look: (live === 3 ? null : "halftone") as "halftone" | "soft" | null,
    };
    return {
      store: {
        getSnapshot: () => snapshot,
        subscribe(listener: () => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      set(next: 1 | 2 | 3) {
        snapshot = { ...snapshot, tier: next };
        for (const listener of listeners) listener();
      },
      listeners,
    };
  }

  const layer = () =>
    document.querySelector<HTMLElement>('[data-part="veil-plates"]');

  it("REQ-SCR-01 REQ-A11Y-06 the stages go to the field once per layout; plates are laid behind the text before the veil opens", () => {
    const fake = createFakeMotion(page);
    const tier = fakeTier(2);
    let stages: Stages = { hero };
    let lines = [
      { top: 100, bottom: 140, left: 88, right: 400 },
      { top: 2000, bottom: 2040, left: 88, right: 300 },
    ];
    const order: string[] = [];
    bridge.setVeil.mockImplementation((veil) => {
      order.push(
        `veil ${veil} with ${layer()?.childElementCount ?? "no"} plates`,
      );
    });
    const stop = startStory(fake.motion, {
      root,
      bridge,
      calm: createCalm(false).store,
      view: VIEW,
      fonts: null,
      tier: tier.store,
      measure: () => ({ stages, frames: [], width: 1280, lines }),
    });

    expect(bridge.setStage.mock.calls).toEqual([[{ hero }]]);
    expect(order).toEqual(["veil 0.35 with 2 plates"]);
    // Outside header, main and footer, which the contrast spec hides.
    expect(layer()?.parentElement).toBe(document.body);
    expect(layer()?.getAttribute("aria-hidden")).toBe("true");
    expect(layer()?.hidden).toBe(false);
    const first = layer()?.firstElementChild as HTMLElement | null;
    expect(first?.style.top).toBe("84px");

    // The same layout again sends no stage; a new one sends its stages and
    // lays its plates again, with the veil left open.
    fake.ScrollTrigger.refresh();
    expect(bridge.setStage).toHaveBeenCalledTimes(1);
    stages = { hero, work };
    lines = [{ top: 100, bottom: 140, left: 88, right: 400 }];
    fake.ScrollTrigger.refresh();
    expect(bridge.setStage).toHaveBeenLastCalledWith({ hero, work });
    expect(layer()?.childElementCount).toBe(1);
    expect(bridge.setVeil).toHaveBeenCalledTimes(1);

    // Tier 3 keeps its own veil and shows no plates.
    tier.set(3);
    expect(layer()?.hidden).toBe(true);
    tier.set(1);
    expect(layer()?.hidden).toBe(false);

    stop();
    expect(bridge.setVeil).toHaveBeenLastCalledWith(null);
    expect(layer()).toBeNull();
    expect(tier.listeners.size).toBe(0);
  });

  it("REQ-A11Y-06 D-146 the contact chapter opens the veil over the sky with darker plates first; leaving it, the veil closes before the plates lighten", () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeMotion(page);
      const lines = [{ top: 100, bottom: 140, left: 88, right: 400 }];
      const order: string[] = [];
      bridge.setVeil.mockImplementation((veil) => {
        order.push(
          `veil ${veil} plates ${layer()?.style.getPropertyValue("--plate-alpha")}`,
        );
      });
      const stop = startStory(fake.motion, {
        root,
        bridge,
        calm: createCalm(false).store,
        view: VIEW,
        fonts: null,
        tier: fakeTier(1).store,
        measure: () => ({ stages: { hero }, frames: [], width: 1280, lines }),
      });
      const scrollTo = (position: number) => {
        page.position = position;
        fake.triggers[0]?.vars.onUpdate?.();
      };
      const open = veilFor(null);
      const sky = veilFor("contact");
      expect(order).toEqual([`veil ${open.veil} plates ${open.plate}`]);

      // Into the contact chapter: the plates darken in the same task as
      // the veil opens, so text never sits on less than the text veil.
      scrollTo(5050);
      expect(bridge.setStory).toHaveBeenLastCalledWith("contact", 0.25);
      expect(order.at(-1)).toBe(`veil ${sky.veil} plates ${sky.plate}`);
      // Scrolling inside it sends nothing more.
      scrollTo(5200);
      expect(order).toHaveLength(2);

      // Out again: the veil closes at once, the plates wait for its fade.
      scrollTo(4600);
      expect(order.at(-1)).toBe(`veil ${open.veil} plates ${sky.plate}`);
      vi.advanceTimersByTime(VEIL_FADE_MS - 1);
      expect(layer()?.style.getPropertyValue("--plate-alpha")).toBe(
        String(sky.plate),
      );
      vi.advanceTimersByTime(1);
      expect(layer()?.style.getPropertyValue("--plate-alpha")).toBe(
        String(open.plate),
      );

      // A plate change still waiting is dropped with the story.
      scrollTo(5050);
      scrollTo(4600);
      stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-A11Y-06 REQ-SCR-04 text that arrives once the field is ready, or comes and goes with calm, gets its plate on the next task, and teardown cancels one still waiting", () => {
    vi.useFakeTimers();
    try {
      const fake = createFakeMotion(page);
      const tier = fakeTier(2);
      const calm = createCalm(false);
      const label = { top: 100, bottom: 140, left: 88, right: 400 };
      const note = { top: 1700, bottom: 1717, left: 56, right: 330 };
      let lines = [label];
      let measures = 0;
      const stop = startStory(fake.motion, {
        root,
        bridge,
        calm: calm.store,
        view: VIEW,
        fonts: null,
        tier: tier.store,
        measure: () => {
          measures += 1;
          return { stages: { hero }, frames: [], width: 1280, lines };
        },
      });
      expect(layer()?.childElementCount).toBe(1);

      // The field note's words arrive with the ready tier, after React draws
      // them: laid on the next task, once for any number of changes.
      lines = [label, note];
      tier.set(1);
      tier.set(1);
      expect(layer()?.childElementCount).toBe(1);
      const before = measures;
      vi.runOnlyPendingTimers();
      expect(measures).toBe(before + 1);
      expect(layer()?.childElementCount).toBe(2);

      // Calm takes the note away.
      lines = [label];
      calm.set(true);
      vi.runOnlyPendingTimers();
      expect(layer()?.childElementCount).toBe(1);

      // A change just before leaving never measures a page that has gone.
      tier.set(2);
      stop();
      const atStop = measures;
      vi.runOnlyPendingTimers();
      expect(measures).toBe(atStop);
      expect(layer()).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  // The three rows' frames in page coordinates: each row's top reaches the
  // screen's middle at its span's start (2,100, 2,400 and 2,700 px), so the
  // row's top is 400 px further down the page; the frame is its first 150 px.
  const WIDTH = 1280;
  const FRAMES = [0, 1, 2].map((index) => ({
    top: 2500 + index * 300,
    bottom: 2650 + index * 300,
    left: 88,
    right: 700,
    radius: 16,
  }));
  const framed = (lines: PageLayout["lines"] = []): PageLayout => ({
    stages: { hero },
    frames: FRAMES,
    width: WIDTH,
    lines,
  });
  const frameAt = (row: number, position: number) =>
    screenStage(FRAMES[row]!, position, WIDTH, VIEW.innerHeight);

  function startFramed(calm = createCalm(false), lines?: PageLayout["lines"]) {
    const fake = createFakeMotion(page);
    const stop = startStory(fake.motion, {
      root,
      bridge,
      calm: calm.store,
      view: VIEW,
      fonts: null,
      tier: fakeTier(1).store,
      measure: () => framed(lines),
    });
    /** Scrolls the page and lets ScrollTrigger report it. */
    const scrollTo = (position: number) => {
      page.position = position;
      fake.triggers[0]?.vars.onUpdate?.();
    };
    return { fake, stop, scrollTo };
  }

  it("REQ-SCR-01 REQ-SCR-05 REQ-ENG-03 while the work chapter is on screen, each scroll frame sends the frame of the row in view, only when it moved, and a new row as one jump", () => {
    page.position = 2200;
    const { stop, scrollTo } = startFramed();
    // Inside the first row: its frame, where the screen shows it now.
    expect(bridge.setStage.mock.calls).toEqual([
      [{ hero, work: frameAt(0, 2200) }],
    ]);

    // Ten pixels on, the frame is ten pixels higher, and so is the stage.
    scrollTo(2210);
    expect(bridge.setStage).toHaveBeenLastCalledWith({
      hero,
      work: frameAt(0, 2210),
    });
    // A frame that did not move sends nothing.
    scrollTo(2210);
    expect(bridge.setStage).toHaveBeenCalledTimes(2);

    // Between two rows the next row's frame, sent before the story moves on
    // to its shape.
    scrollTo(2350);
    expect(bridge.setStage).toHaveBeenLastCalledWith({
      hero,
      work: frameAt(1, 2350),
    });
    const [stageOrder] = bridge.setStage.mock.invocationCallOrder.slice(-1);
    const [storyOrder] = bridge.setStory.mock.invocationCallOrder.slice(-1);
    expect(stageOrder).toBeLessThan(storyOrder ?? 0);
    expect(bridge.setStory).toHaveBeenLastCalledWith("work", 1 / 3);
    stop();
  });

  it("REQ-SCR-01 with the work chapter off screen, scrolling sends no stage", () => {
    page.position = 300;
    const { stop, scrollTo } = startFramed();
    const count = bridge.setStage.mock.calls.length;
    // The work chapter's top reaches the screen's bottom at 1,500 px and its
    // bottom leaves the top at 3,900 px.
    for (const position of [400, 900, 1400, 1500, 3900, 4400]) {
      scrollTo(position);
    }
    expect(bridge.setStage).toHaveBeenCalledTimes(count);
    scrollTo(1501);
    expect(bridge.setStage).toHaveBeenCalledTimes(count + 1);
    stop();
  });

  it("REQ-A11Y-03 REQ-A11Y-04 in calm the stage stream stops: the frame holds the screen's middle, and calm turning off or on sends one stage", () => {
    const calm = createCalm(true);
    page.position = 2200;
    const { stop, scrollTo } = startFramed(calm);
    const middle = { ...frameAt(0, 2200)!, y: 0 };
    expect(bridge.setStage.mock.calls).toEqual([[{ hero, work: middle }]]);

    // Every row's frame has the same place on the screen in calm, so no
    // scroll and no new row sends a stage.
    for (const position of [2210, 2300, 2350, 2600, 2800]) scrollTo(position);
    expect(bridge.setStage).toHaveBeenCalledTimes(1);

    calm.set(false);
    expect(bridge.setStage).toHaveBeenLastCalledWith({
      hero,
      work: frameAt(2, 2800),
    });
    scrollTo(2810);
    expect(bridge.setStage).toHaveBeenLastCalledWith({
      hero,
      work: frameAt(2, 2810),
    });

    calm.set(true);
    expect(bridge.setStage).toHaveBeenCalledTimes(4);
    expect(bridge.setStage.mock.lastCall?.[0].work?.y).toBe(0);
    stop();
  });

  it("REQ-SCR-04 after teardown no scroll sends a stage", () => {
    page.position = 2200;
    const { fake, stop } = startFramed();
    const count = bridge.setStage.mock.calls.length;
    stop();
    page.position = 2300;
    fake.triggers[0]?.vars.onUpdate?.();
    fake.ScrollTrigger.refresh();
    expect(bridge.setStage).toHaveBeenCalledTimes(count);
  });

  it("REQ-A11Y-06 a plate whose soft edge reaches a study frame is cut there, so the field shows inside the frame; other plates keep their whole edge", () => {
    const { stop } = startFramed(createCalm(false), [
      // The first row's title, beside its frame past a 56 px gap.
      { top: 2540, bottom: 2580, left: 756, right: 1192 },
      // A line far above the work chapter.
      { top: 100, bottom: 140, left: 88, right: 400 },
    ]);
    const plateElements = [...(layer()?.children ?? [])] as HTMLElement[];
    expect(plateElements).toHaveLength(2);
    const [beside, far] = plateElements;
    expect(beside?.style.clipPath).toMatch(/^path\(evenodd, "M -160 -160 /);
    // The first frame, 652 to 40 px before the plate's start: a hole.
    expect(beside?.style.clipPath).toContain("A 16 16 0 0 1 -40");
    expect(far?.style.clipPath).toBe("");
    stop();
  });

  describe("the pass viewer", () => {
    // The making-of chapter's viewer on the page, and one live card in it,
    // its face 166 by 270 px.
    const VIEWER = { top: 4100, bottom: 4900, left: 88, right: 1192 };
    const FACE = { top: 4124, bottom: 4394, left: 300, right: 466, radius: 12 };

    /** The live card where the screen shows it with the page at position. */
    function cardAt(position: number): PassCard {
      const x = (value: number) => (2 * value) / WIDTH - 1;
      const y = (value: number) =>
        1 - (2 * (value - position)) / VIEW.innerHeight;
      return {
        pass: "velocity",
        corners: [
          { x: x(FACE.left), y: y(FACE.top) },
          { x: x(FACE.right), y: y(FACE.top) },
          { x: x(FACE.right), y: y(FACE.bottom) },
          { x: x(FACE.left), y: y(FACE.bottom) },
        ],
      };
    }

    // The middle card's face of the sliding row, 320 by 400 px, centred
    // across the screen; its centre is 4,500 px down the page.
    const MIDDLE_CENTRE = 4500;

    /** The making-of stage with the page at position, as the screen shows it. */
    function middleAt(position: number, nudge = 0): Stage {
      return {
        x: 0,
        y: 1 - (2 * (MIDDLE_CENTRE - position)) / VIEW.innerHeight + nudge,
        halfWidth: 0.25,
        halfHeight: 0.5,
      };
    }

    function startViewer({
      calm = createCalm(false),
      isLive = true,
      hasMiddle = false,
      lines = [] as PageLayout["lines"],
      withRows = false,
    } = {}) {
      const state = { isLive, hasMiddle, nudge: 0, reads: 0, middleReads: 0 };
      const fake = createFakeMotion(page);
      const tier = fakeTier(1);
      const stop = startStory(fake.motion, {
        root,
        bridge,
        calm: calm.store,
        view: VIEW,
        fonts: null,
        tier: tier.store,
        measure: () => ({
          stages: { hero },
          frames: withRows ? FRAMES : [],
          width: WIDTH,
          lines,
          viewer: VIEWER,
          faces: state.isLive ? [FACE] : [],
        }),
        passes: () => {
          state.reads += 1;
          return state.isLive ? [cardAt(page.position)] : [];
        },
        middle: () => {
          state.middleReads += 1;
          return state.hasMiddle
            ? middleAt(page.position, state.nudge)
            : undefined;
        },
      });
      const scrollTo = (position: number) => {
        page.position = position;
        fake.triggers[0]?.vars.onUpdate?.();
      };
      return { stop, scrollTo, tier, state, fake };
    }

    it("REQ-ENG-09 REQ-SCR-01 while the viewer is near, each scroll frame sends the live cards where the screen shows them, only when they moved; well off screen the field gets none, once", () => {
      page.position = 1000;
      const { stop, scrollTo, state } = startViewer();
      // Far above the viewer: nothing read, nothing sent.
      expect(bridge.setPasses).not.toHaveBeenCalled();
      expect(state.reads).toBe(0);

      // Half a screen before its top reaches the screen.
      scrollTo(2901);
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(2901)]);
      scrollTo(3800);
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(3800)]);
      // A card that did not move sends nothing.
      scrollTo(3800);
      expect(bridge.setPasses).toHaveBeenCalledTimes(2);

      // Well past the viewer: none, once.
      scrollTo(5400);
      expect(bridge.setPasses).toHaveBeenLastCalledWith(null);
      const reads = state.reads;
      scrollTo(5600);
      scrollTo(6000);
      expect(bridge.setPasses).toHaveBeenCalledTimes(3);
      expect(state.reads).toBe(reads);
      stop();
    });

    it("REQ-ENG-09 REQ-SCR-01 the cards go out before the story moves on", () => {
      page.position = 3000;
      const { stop, scrollTo } = startViewer();
      scrollTo(3600);
      const [passesOrder] = bridge.setPasses.mock.invocationCallOrder.slice(-1);
      const [storyOrder] = bridge.setStory.mock.invocationCallOrder.slice(-1);
      expect(passesOrder).toBeLessThan(storyOrder ?? 0);
      expect(bridge.setStory).toHaveBeenLastCalledWith("making-of", 0.125);
      stop();
    });

    it("REQ-A11Y-03 REQ-ENG-09 in calm the cards still go to the field as they scroll, so its still keeps each pass in its card", () => {
      const calm = createCalm(true);
      page.position = 4000;
      const { stop, scrollTo } = startViewer({ calm });
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(4000)]);
      scrollTo(4010);
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(4010)]);

      // A change of calm alone moves no card.
      calm.set(false);
      calm.set(true);
      expect(bridge.setPasses).toHaveBeenCalledTimes(2);
      stop();
    });

    it("REQ-ENG-09 A14 cards that turn live once the field is ready are read on the next task, and none is sent while every card shows its still", () => {
      vi.useFakeTimers();
      try {
        page.position = 4000;
        const { stop, tier, state } = startViewer({ isLive: false });
        expect(bridge.setPasses).not.toHaveBeenCalled();

        // React draws the live faces after the tier store reports.
        state.isLive = true;
        tier.set(2);
        expect(bridge.setPasses).not.toHaveBeenCalled();
        vi.runOnlyPendingTimers();
        expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(4000)]);

        // Tier 3: the faces show stills again.
        state.isLive = false;
        tier.set(3);
        vi.runOnlyPendingTimers();
        expect(bridge.setPasses).toHaveBeenLastCalledWith(null);
        stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it("REQ-SCR-04 teardown takes the passes off the field, and no scroll after it sends any", () => {
      page.position = 4000;
      const { stop, scrollTo } = startViewer();
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(4000)]);

      stop();
      expect(bridge.setPasses).toHaveBeenLastCalledWith(null);
      const count = bridge.setPasses.mock.calls.length;
      scrollTo(4100);
      stop();
      expect(bridge.setPasses).toHaveBeenCalledTimes(count);
    });

    it("REQ-SCR-04 a story stopped away from the viewer sends nothing on teardown", () => {
      page.position = 1000;
      const { stop } = startViewer();
      stop();
      expect(bridge.setPasses).not.toHaveBeenCalled();
    });

    it("REQ-A11Y-06 REQ-ENG-09 a plate whose soft edge reaches a live face is cut there, so the pass shows; with the card on its still the plate keeps its edge", () => {
      // The chapter's intro above the cards, past the row's 24 px.
      const intro = { top: 3990, bottom: 4040, left: 88, right: 648 };
      page.position = 4000;
      const live = startViewer({ lines: [intro] });
      const [plate] = [...(layer()?.children ?? [])] as HTMLElement[];
      expect(plate?.style.clipPath).toMatch(/^path\(evenodd, /);
      expect(plate?.style.clipPath).toContain("A 12 12 0 0 1");
      live.stop();

      const still = startViewer({ lines: [intro], isLive: false });
      const [kept] = [...(layer()?.children ?? [])] as HTMLElement[];
      expect(kept?.style.clipPath).toBe("");
      still.stop();
    });

    it("REQ-ENG-09 REQ-SCR-01 while the viewer is near, the middle card's face goes to the field as the making-of stage with the others, on every frame it moves; away from the viewer it is dropped, once", () => {
      page.position = 1000;
      const { stop, scrollTo, state } = startViewer({ hasMiddle: true });
      // Far above the viewer: not read, not sent.
      expect(bridge.setStage.mock.calls).toEqual([[{ hero }]]);
      expect(state.middleReads).toBe(0);

      scrollTo(2901);
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(2901),
      });
      scrollTo(3800);
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(3800),
      });
      expect(bridge.setStage).toHaveBeenCalledTimes(3);

      // A face that did not move, or moved by less than a hair, sends
      // nothing (sameStages).
      scrollTo(3800);
      state.nudge = 1e-5;
      scrollTo(3800);
      expect(bridge.setStage).toHaveBeenCalledTimes(3);
      state.nudge = 0;

      // Well past the viewer the field gets the other stages alone, once.
      scrollTo(5400);
      expect(bridge.setStage).toHaveBeenCalledTimes(4);
      expect(bridge.setStage).toHaveBeenLastCalledWith({ hero });
      const reads = state.middleReads;
      scrollTo(5600);
      scrollTo(6000);
      expect(bridge.setStage).toHaveBeenCalledTimes(4);
      expect(state.middleReads).toBe(reads);
      stop();
    });

    it("REQ-ENG-09 REQ-SCR-01 the making-of stage goes out before the cards, and both before the story moves on", () => {
      page.position = 3000;
      const { stop, scrollTo } = startViewer({ hasMiddle: true });
      scrollTo(3600);
      const [stageOrder] = bridge.setStage.mock.invocationCallOrder.slice(-1);
      const [passesOrder] = bridge.setPasses.mock.invocationCallOrder.slice(-1);
      const [storyOrder] = bridge.setStory.mock.invocationCallOrder.slice(-1);
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(3600),
      });
      expect(stageOrder).toBeLessThan(passesOrder ?? 0);
      expect(passesOrder).toBeLessThan(storyOrder ?? 0);
      stop();
    });

    it("REQ-A11Y-03 REQ-A11Y-04 with no middle card, as in the still grid, the field gets no making-of stage; the row's arrival brings it with the refresh, calm drops it on the next task and calm off brings it back", () => {
      vi.useFakeTimers();
      try {
        const calm = createCalm(false);
        page.position = 4000;
        const { stop, state, fake } = startViewer({ calm });
        expect(bridge.setStage.mock.lastCall?.[0]).toEqual({ hero });

        // The still grid becomes the sliding row once the page's script
        // runs; main grows, and the refresh that follows finds its middle
        // card.
        state.hasMiddle = true;
        fake.ScrollTrigger.refresh();
        expect(bridge.setStage).toHaveBeenLastCalledWith({
          hero,
          "making-of": middleAt(4000),
        });

        // Calm turns it back into the still grid, which marks no card.
        state.hasMiddle = false;
        calm.set(true);
        vi.runOnlyPendingTimers();
        expect(bridge.setStage).toHaveBeenLastCalledWith({ hero });

        state.hasMiddle = true;
        calm.set(false);
        vi.runOnlyPendingTimers();
        expect(bridge.setStage).toHaveBeenLastCalledWith({
          hero,
          "making-of": middleAt(4000),
        });
        stop();
      } finally {
        vi.useRealTimers();
      }
    });

    it("REQ-ENG-09 REQ-SCR-02 when the viewer says its row has moved or a new card is in the middle, the faces are read again with the page where it is, so a jump never leaves the field on the card before it", () => {
      page.position = 4000;
      const { stop, state } = startViewer({ hasMiddle: true });
      const viewer = root.querySelector("[data-pass-viewer]");
      expect(viewer).not.toBeNull();
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(4000),
      });
      const stages = bridge.setStage.mock.calls.length;
      const reads = state.reads;

      // A Tab jump: the scroll reached the story before the row moved, so
      // the story read the old card. The row then moves with no scroll, and
      // says so.
      state.nudge = 0.4;
      viewer?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
      expect(bridge.setStage).toHaveBeenCalledTimes(stages + 1);
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(4000, 0.4),
      });
      expect(state.reads).toBe(reads + 1);

      // The card turned live after React drew it: read with the same event.
      state.isLive = false;
      viewer?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
      expect(bridge.setPasses).toHaveBeenLastCalledWith(null);
      state.isLive = true;
      viewer?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
      expect(bridge.setPasses).toHaveBeenLastCalledWith([cardAt(4000)]);

      // Nothing moved: nothing sent.
      const sent = bridge.setPasses.mock.calls.length;
      viewer?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
      expect(bridge.setStage).toHaveBeenCalledTimes(stages + 1);
      expect(bridge.setPasses).toHaveBeenCalledTimes(sent);

      // After teardown the event is not heard.
      stop();
      const after = bridge.setStage.mock.calls.length;
      state.nudge = 0;
      viewer?.dispatchEvent(new Event(SLIDE_MOVED, { bubbles: true }));
      expect(bridge.setStage).toHaveBeenCalledTimes(after);
    });

    it("REQ-ENG-03 REQ-SCR-05 with a study row and the viewer both on screen, a scroll frame that moves both stages sends them once", () => {
      page.position = 2950;
      const { stop, scrollTo } = startViewer({
        hasMiddle: true,
        withRows: true,
      });
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        work: frameAt(2, 2950),
        "making-of": middleAt(2950),
      });
      const count = bridge.setStage.mock.calls.length;
      scrollTo(2960);
      expect(bridge.setStage).toHaveBeenCalledTimes(count + 1);
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        work: frameAt(2, 2960),
        "making-of": middleAt(2960),
      });
      stop();
    });

    it("REQ-SCR-04 after teardown the making-of stage is never sent again", () => {
      page.position = 4000;
      const { stop, scrollTo, state } = startViewer({ hasMiddle: true });
      expect(bridge.setStage).toHaveBeenLastCalledWith({
        hero,
        "making-of": middleAt(4000),
      });
      const count = bridge.setStage.mock.calls.length;
      stop();
      scrollTo(4100);
      state.hasMiddle = false;
      scrollTo(5400);
      expect(bridge.setStage).toHaveBeenCalledTimes(count);
    });
  });
});

describe("the page's height", () => {
  // jsdom has no ResizeObserver: a stand-in that records what it watches,
  // whose callback the tests call as a browser would.
  class FakeResizeObserver {
    static made: FakeResizeObserver[] = [];
    readonly observe = vi.fn<(target: Element) => void>();
    readonly disconnect = vi.fn<() => void>();
    constructor(readonly callback: () => void) {
      FakeResizeObserver.made.push(this);
    }
  }

  let height: number;
  let frames: Map<number, FrameRequestCallback>;
  let cancelFrame: Mock<(id: number) => void>;

  function runFrames() {
    const due = [...frames.values()];
    frames.clear();
    for (const callback of due) callback(0);
  }

  beforeEach(() => {
    FakeResizeObserver.made = [];
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    frames = new Map();
    let last = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      last += 1;
      frames.set(last, callback);
      return last;
    });
    cancelFrame = vi.fn((id: number) => {
      frames.delete(id);
    });
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    height = 5500;
    root.getBoundingClientRect = () => ({ height }) as DOMRect;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REQ-SCR-01 REQ-SCR-02 when main's height changes with no resize, as when the pass viewer turns from its grid into its row, every trigger is measured again once, on the next frame", () => {
    const fake = createFakeMotion(page);
    const stop = start(fake);
    const [observer] = FakeResizeObserver.made;
    expect(FakeResizeObserver.made).toHaveLength(1);
    expect(observer?.observe).toHaveBeenCalledWith(root);
    const refreshes = fake.ScrollTrigger.refresh.mock.calls.length;

    // A browser reports the first size at once: the same height, nothing to do.
    observer?.callback();
    expect(frames.size).toBe(0);

    // The row's stretch adds its screens: one refresh, a frame later, for
    // any number of reports in between.
    height = 7900;
    observer?.callback();
    observer?.callback();
    expect(frames.size).toBe(1);
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(refreshes);
    runFrames();
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(refreshes + 1);
    observer?.callback();
    expect(frames.size).toBe(0);

    // Calm turns it back into the grid: measured again.
    height = 5500;
    observer?.callback();
    runFrames();
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(refreshes + 2);
    stop();
  });

  it("REQ-SCR-04 teardown disconnects the observer and cancels a refresh still waiting", () => {
    const fake = createFakeMotion(page);
    const stop = start(fake);
    const [observer] = FakeResizeObserver.made;
    height = 7900;
    observer?.callback();
    const [[pending, waiting]] = [...frames.entries()] as [
      [number, FrameRequestCallback],
    ];
    const refreshes = fake.ScrollTrigger.refresh.mock.calls.length;

    stop();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledWith(pending);
    expect(frames.size).toBe(0);
    // Even a frame already under way refreshes nothing once stopped.
    waiting(0);
    expect(fake.ScrollTrigger.refresh).toHaveBeenCalledTimes(refreshes);
    stop();
    expect(observer?.disconnect).toHaveBeenCalledTimes(1);
  });
});
