import { expect, type Page } from "@playwright/test";

import { chapterOrder } from "../../src/content/story";
import type { ChapterId } from "../../src/engine/types";
import { FIELD } from "./tiers";

// Helpers for the home page's scroll story (REQ-SCR-01 to 07), shared by the
// gate (e2e/story.spec.ts) and the headed specs (e2e/headed/).

export { chapterOrder };

// The story loads GSAP after first content (REQ-PERF-04). In the gate many
// workers share the CPU, so this is generous; a story that never starts
// still fails.
export const STORY_TIMEOUT_MS = 45_000;

/** A place in the story: a chapter and a progress, or a study row. */
export type StoryPlace =
  { chapter: ChapterId; progress: number } | { step: number; local?: number };

/**
 * Waits until the story runner has started. It marks the first chapter
 * title below the fold as it starts: split into words with an aria-label
 * (motion), or set to fade in with an inline opacity (calm and reduced
 * motion). Load the page at the top before calling it.
 */
export async function waitForStory(page: Page): Promise<"split" | "fade"> {
  const handle = await page.waitForFunction(
    () => {
      const title = document.querySelector<HTMLElement>(
        "main [data-story-title]",
      );
      if (title === null) return null;
      if (title.hasAttribute("aria-label")) return "split";
      if (title.style.opacity !== "") return "fade";
      return null;
    },
    undefined,
    { timeout: STORY_TIMEOUT_MS },
  );
  return (await handle.jsonValue()) as "split" | "fade";
}

/** html carries this class while Lenis drives the page. */
export const LENIS_CLASS = /(?:^|\s)lenis(?:\s|$)/;

/**
 * The calm-mode switch in the bar (REQ-A11Y-04). The home page holds three
 * switches of that name (the bar's, the hero's corner pill and the
 * footer's), so this one is found inside the banner.
 */
export function calmToggle(page: Page) {
  return page
    .getByRole("banner")
    .getByRole("switch", { name: "Calm mode", exact: true });
}

/** Whether Lenis drives the page now: it puts its class on html. */
export function hasLenis(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    document.documentElement.classList.contains("lenis"),
  );
}

/**
 * Whether a Lenis instance was ever made in this document. The constructor
 * sets window.lenisVersion, and destroy() leaves it (lenis 1.3.27,
 * dist/lenis.mjs line 435 and destroy() from line 493).
 */
export function lenisWasMade(page: Page): Promise<boolean> {
  return page.evaluate(() => "lenisVersion" in window);
}

/**
 * The scroll position, clamped to the page, at which the place sits at the
 * middle of the viewport. A chapter's progress is 0 when its section's top
 * reaches the middle and 1 when its bottom does (the story to engine
 * contract); a study row's span is measured the same way.
 */
export function scrollPositionOf(page: Page, place: StoryPlace) {
  return page.evaluate((target) => {
    const selector =
      "step" in target
        ? `main [data-work-step="${target.step}"]`
        : `main [data-chapter="${target.chapter}"]`;
    const element = document.querySelector(selector);
    if (element === null) throw new Error(`Nothing matches ${selector}`);
    const box = element.getBoundingClientRect();
    const progress = "step" in target ? (target.local ?? 0.5) : target.progress;
    const top =
      box.top + window.scrollY - window.innerHeight / 2 + progress * box.height;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return Math.round(Math.min(Math.max(top, 0), max));
  }, place);
}

/** Jumps the page to a place in the story and returns the position. */
export async function scrollToPlace(
  page: Page,
  place: StoryPlace,
): Promise<number> {
  const top = await scrollPositionOf(page, place);
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    top,
  );
  return top;
}

/** Jumps to the middle of a chapter and waits for the field to follow. */
export async function goToChapter(
  page: Page,
  chapter: ChapterId,
  progress = 0.5,
): Promise<number> {
  const top = await scrollToPlace(page, { chapter, progress });
  await expect(page.locator(FIELD)).toHaveAttribute("data-chapter", chapter);
  return top;
}

export interface ChapterRoom {
  chapter: ChapterId;
  /** The section's top on the page and its height, px. */
  top: number;
  height: number;
  /**
   * What its content needs: the span of its children in the flow, margins
   * included, plus its own padding and borders, px.
   */
  content: number;
  /**
   * How far the page scrolls while a sticky screen in the section holds
   * still, px; 0 without one. The field chapter's screen is a child of the
   * section; the making-of slide's screen sits inside its stretch.
   */
  held: number;
  /** The tallest stretch of the section with no line of text in it, px. */
  emptiest: number;
  /** Where that stretch starts, px below the section's top. */
  emptiestAt: number;
}

/**
 * Each chapter's room, measured with the page at its top, where no sticky
 * screen is held away from its place: the section's height, what its
 * content needs, its held stretch and the tallest stretch of it with no line
 * of text. Text kept for assistive technology only (inside a clipping box of
 * 1 px or less, as the scene lines are) does not count; a title waiting for
 * its reveal does, since it is laid out and shows when it is reached. Leaves
 * the page at its top.
 */
export function chapterRooms(page: Page): Promise<ChapterRoom[]> {
  return page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    const px = (value: string) => Number.parseFloat(value) || 0;

    return [
      ...document.querySelectorAll<HTMLElement>("main > section[data-chapter]"),
    ].map((section) => {
      const box = section.getBoundingClientRect();
      const style = getComputedStyle(section);
      const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);

      let first = Number.POSITIVE_INFINITY;
      let last = Number.NEGATIVE_INFINITY;
      for (const child of section.children) {
        const childStyle = getComputedStyle(child);
        if (
          childStyle.display === "none" ||
          childStyle.display === "contents" ||
          childStyle.position === "absolute" ||
          childStyle.position === "fixed"
        ) {
          continue;
        }
        const rect = child.getBoundingClientRect();
        first = Math.min(first, rect.top - px(childStyle.marginTop));
        last = Math.max(last, rect.bottom + px(childStyle.marginBottom));
      }

      // A sticky screen holds while the page scrolls through what is left
      // of its parent's content box below it.
      let held = 0;
      for (const element of section.querySelectorAll<HTMLElement>("*")) {
        const holder = element.parentElement;
        if (
          holder === null ||
          getComputedStyle(element).position !== "sticky"
        ) {
          continue;
        }
        const holderStyle = getComputedStyle(holder);
        held = Math.max(
          held,
          holder.getBoundingClientRect().height -
            px(holderStyle.borderTopWidth) -
            px(holderStyle.borderBottomWidth) -
            px(holderStyle.paddingTop) -
            px(holderStyle.paddingBottom) -
            element.getBoundingClientRect().height,
        );
      }
      const content =
        (last > first ? last - first : 0) +
        px(style.paddingTop) +
        px(style.paddingBottom) +
        borders;

      // Every line box of visible text, from the section's top.
      const lines: Array<{ top: number; bottom: number }> = [];
      const range = document.createRange();
      const walker = document.createTreeWalker(section, NodeFilter.SHOW_TEXT);
      for (
        let node = walker.nextNode();
        node !== null;
        node = walker.nextNode()
      ) {
        const parent = node.parentElement;
        if (parent === null || (node.textContent ?? "").trim() === "") {
          continue;
        }
        if (getComputedStyle(parent).visibility === "hidden") continue;
        // A box of 1 px or less that clips what it holds hides it from the
        // eye. A box with display contents has no size of its own and
        // hides nothing.
        let isClipped = false;
        for (
          let element: Element | null = parent;
          element !== null && element !== section;
          element = element.parentElement
        ) {
          const elementStyle = getComputedStyle(element);
          if (
            elementStyle.display === "contents" ||
            elementStyle.overflow === "visible"
          ) {
            continue;
          }
          const rect = element.getBoundingClientRect();
          if (rect.width <= 1 && rect.height <= 1) {
            isClipped = true;
            break;
          }
        }
        if (isClipped) continue;
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (rect.height > 0) {
            lines.push({
              top: rect.top - box.top,
              bottom: rect.bottom - box.top,
            });
          }
        }
      }
      lines.sort((a, b) => a.top - b.top);
      let reached = 0;
      let emptiest = 0;
      let emptiestAt = 0;
      for (const line of [...lines, { top: box.height, bottom: box.height }]) {
        if (line.top - reached > emptiest) {
          emptiest = line.top - reached;
          emptiestAt = reached;
        }
        reached = Math.max(reached, line.bottom);
      }

      return {
        chapter: section.dataset.chapter as ChapterId,
        top: Math.round(box.top + window.scrollY),
        height: Math.round(box.height),
        content: Math.round(content),
        held: Math.round(held),
        emptiest: Math.round(emptiest),
        emptiestAt: Math.round(emptiestAt),
      };
    });
  });
}

export interface HeldText {
  text: string;
  /** Its box in the viewport, px. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Scrolls the field chapter to a place in its held stretch, 0 where its
 * screen first fills the view and 1 where it starts to leave, and returns
 * what the held screen shows there: each text that brings its own plate (the
 * label, the tier readout and the note) with its box in the viewport.
 */
export function heldScreenAt(
  page: Page,
  share: number,
): Promise<{ viewHeight: number; texts: HeldText[] }> {
  return page.evaluate((at) => {
    const section = document.querySelector<HTMLElement>(
      'main > section[data-chapter="bloom"]',
    );
    const screen = section?.querySelector<HTMLElement>(
      '[data-part="field-screen"]',
    );
    if (!section || !screen)
      throw new Error("No held screen in the field chapter");
    const box = section.getBoundingClientRect();
    const held = box.height - screen.getBoundingClientRect().height;
    window.scrollTo({
      top: Math.round(box.top + window.scrollY + at * held),
      behavior: "instant",
    });
    return {
      viewHeight: window.innerHeight,
      texts: [
        ...screen.querySelectorAll<HTMLElement>('[data-plate="own"]'),
      ].map((plate) => {
        const rect = plate.getBoundingClientRect();
        return {
          text: (plate.textContent ?? "").trim(),
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
        };
      }),
    };
  }, share);
}

// The making-of slide (home/pass-viewer.tsx): a stretch of the page holding
// a sticky screen, the row of pass cards in it moving sideways as the page
// scrolls through the stretch. These read it as the viewer does.
export const SLIDE_STRETCH = '[data-pass-viewer] [data-part="pass-stretch"]';
export const SLIDE_SCREEN = '[data-part="pass-screen"]';

/**
 * The scroll position, clamped to the page, at which the slide stands at a
 * progress from 0 to 1 through its stretch: 0 where its screen first fills
 * the view, 1 where it starts to leave. The viewer measures its progress the
 * same way.
 */
export function slideTop(page: Page, progress: number): Promise<number> {
  return page.evaluate(
    ({ selector, at }) => {
      const stretch = document.querySelector(selector);
      if (stretch === null) throw new Error(`Nothing matches ${selector}`);
      const box = stretch.getBoundingClientRect();
      const travel = box.height - window.innerHeight;
      const top = box.top + window.scrollY + at * travel;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return Math.round(Math.min(Math.max(top, 0), max));
    },
    { selector: SLIDE_STRETCH, at: progress },
  );
}

/**
 * Puts a finger on the page, or lifts it, as the making-of viewer reads it:
 * while one is down the slide never settles on a card (pass-viewer.tsx,
 * D-131). A plain event carrying the touch count, so it works on a desktop
 * project too.
 */
export function touchPage(page: Page, down: boolean): Promise<void> {
  return page.evaluate((isDown) => {
    const event = new Event(isDown ? "touchstart" : "touchend");
    Object.defineProperty(event, "touches", {
      value: { length: isDown ? 1 : 0 },
    });
    window.dispatchEvent(event);
  }, down);
}

/** Jumps the page to a progress through the slide and returns the position. */
export async function scrollToSlide(
  page: Page,
  progress: number,
): Promise<number> {
  const top = await slideTop(page, progress);
  await page.evaluate(
    (y) => window.scrollTo({ top: y, behavior: "instant" }),
    top,
  );
  return top;
}

/**
 * Scrolls the slide to a progress through its stretch and returns what its
 * held screen shows there: the card in the middle (aria-current), named by
 * its pass, and the text on that card's own plate with its box in the
 * viewport. The middle is set on the frame after a scroll, so read it with
 * expect.poll.
 */
export function slideScreenAt(
  page: Page,
  progress: number,
): Promise<{
  viewWidth: number;
  viewHeight: number;
  middle: string | null;
  texts: HeldText[];
}> {
  return page.evaluate(
    ({ selector, screenSelector, at }) => {
      const stretch = document.querySelector<HTMLElement>(selector);
      const screen = stretch?.querySelector<HTMLElement>(screenSelector);
      if (!stretch || !screen) {
        throw new Error("No sliding pass viewer in the making-of chapter");
      }
      const box = stretch.getBoundingClientRect();
      const travel = box.height - screen.getBoundingClientRect().height;
      window.scrollTo({
        top: Math.round(box.top + window.scrollY + at * travel),
        behavior: "instant",
      });
      const middle = screen.querySelector<HTMLElement>(
        'li[aria-current="step"]',
      );
      return {
        viewWidth: document.documentElement.clientWidth,
        viewHeight: window.innerHeight,
        middle: middle?.dataset.pass ?? null,
        texts: [
          ...(middle?.querySelectorAll<HTMLElement>('[data-plate="own"]') ??
            []),
        ].map((plate) => {
          const rect = plate.getBoundingClientRect();
          return {
            text: (plate.textContent ?? "").trim(),
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
          };
        }),
      };
    },
    { selector: SLIDE_STRETCH, screenSelector: SLIDE_SCREEN, at: progress },
  );
}

/**
 * Starts recording every value written to the wrapper's data-chapter. Read
 * the writes with readChapterWrites.
 */
export async function recordChapterWrites(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element === null) throw new Error(`Nothing matches ${selector}`);
    const writes: string[] = [];
    const observer = new MutationObserver((records) => {
      // Each record holds the value before its write, so the value a write
      // left is the old value of the next record, or the current one.
      records.forEach((_record, index) => {
        const next = records[index + 1];
        writes.push(
          (next === undefined ? element.dataset.chapter : next.oldValue) ??
            "(removed)",
        );
      });
    });
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["data-chapter"],
      attributeOldValue: true,
    });
    Object.assign(window, {
      chapterWrites: { writes, stop: () => observer.disconnect() },
    });
  }, FIELD);
}

/** Stops the recording and returns the values written, in order. */
export function readChapterWrites(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const record = (
      window as unknown as {
        chapterWrites?: { writes: string[]; stop: () => void };
      }
    ).chapterWrites;
    if (record === undefined) throw new Error("No recording was started");
    record.stop();
    return [...record.writes];
  });
}

/**
 * Samples the scroll position on every frame for the given time and returns
 * every distinct position seen. A page that pins or snaps moves on its own.
 */
export function scrollPositionsFor(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (wait) =>
      new Promise<number[]>((resolve) => {
        const positions = [window.scrollY];
        const start = performance.now();
        const tick = (now: number) => {
          if (window.scrollY !== positions.at(-1))
            positions.push(window.scrollY);
          if (now - start >= wait) resolve(positions);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

export type ScrollRestOptions = {
  from?: number;
  quietMs?: number;
  timeoutMs?: number;
};

/**
 * Waits until the scroll position has stopped changing for quietMs and
 * returns every distinct position seen on the way; the last is where the
 * page rests. Given `from`, the position before a key was pressed, it first
 * waits for the page to leave it, so a scroll that has not begun yet is not
 * taken for rest. Gives up after timeoutMs.
 */
export function scrollAtRest(
  page: Page,
  { from, quietMs = 400, timeoutMs = 5_000 }: ScrollRestOptions = {},
): Promise<number[]> {
  return page.evaluate(
    ({ from, quietMs, timeoutMs }) =>
      new Promise<number[]>((resolve) => {
        const positions = [window.scrollY];
        const start = performance.now();
        let changedAt = start;
        let moved = from === null || window.scrollY !== from;
        const tick = (now: number) => {
          if (window.scrollY !== positions.at(-1)) {
            positions.push(window.scrollY);
            changedAt = now;
            moved ||= window.scrollY !== from;
          }
          const rested = moved && now - changedAt >= quietMs;
          if (rested || now - start >= timeoutMs) resolve(positions);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { from: from ?? null, quietMs, timeoutMs },
  );
}

/**
 * The chapter the story gives the current scroll position, read from the
 * layout as story-progress.ts reads it: the last chapter whose top has
 * reached the middle of the viewport.
 */
export function chapterInLayout(page: Page): Promise<ChapterId> {
  return page.evaluate(() => {
    let current = "hero";
    for (const section of document.querySelectorAll<HTMLElement>(
      "main [data-chapter]",
    )) {
      const top = section.getBoundingClientRect().top;
      if (top <= window.innerHeight / 2) {
        current = section.dataset.chapter ?? current;
      }
    }
    return current as ChapterId;
  });
}

/**
 * Starts recording every class Lenis puts on html. Lenis marks a scroll it
 * watches with lenis-scrolling, and one it animates itself with lenis-smooth
 * (lenis 1.3.27, dist/lenis.mjs, the className getter from line 1039). Read
 * them with readLenisClasses.
 */
export async function recordLenisClasses(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    const seen = new Set<string>();
    const note = () => {
      for (const name of root.classList) {
        if (name === "lenis" || name.startsWith("lenis-")) seen.add(name);
      }
    };
    note();
    const observer = new MutationObserver(note);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    Object.assign(window, {
      lenisClasses: { seen, stop: () => observer.disconnect() },
    });
  });
}

/** Stops the recording and returns every Lenis class seen on html. */
export function readLenisClasses(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const record = (
      window as unknown as {
        lenisClasses?: { seen: Set<string>; stop: () => void };
      }
    ).lenisClasses;
    if (record === undefined) throw new Error("No recording was started");
    record.stop();
    return [...record.seen].sort();
  });
}

export interface FocusedView {
  /** The focused element's box, in CSS px from the viewport's top start. */
  top: number;
  bottom: number;
  left: number;
  right: number;
  /** The viewport, without its scrollbar. */
  viewWidth: number;
  viewHeight: number;
  scrollY: number;
  /**
   * The focused element, its ancestors and its contents wherever they are
   * drawn below full opacity or not drawn at all, such as a word mid reveal.
   */
  hiddenParts: string[];
}

/** Where the focused element sits in the viewport and whether it shows whole. */
export function focusedView(page: Page): Promise<FocusedView> {
  return page.evaluate(() => {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || focused === document.body) {
      throw new Error("Nothing has focus");
    }
    const ancestors: Element[] = [];
    for (
      let node = focused.parentElement;
      node !== null;
      node = node.parentElement
    ) {
      ancestors.push(node);
    }
    const hiddenParts = [
      focused,
      ...ancestors,
      ...focused.querySelectorAll("*"),
    ].flatMap((element) => {
      const style = getComputedStyle(element);
      return style.opacity !== "1" || style.visibility !== "visible"
        ? [
            `${element.tagName.toLowerCase()} "${(element.textContent ?? "").trim().slice(0, 40)}" at opacity ${style.opacity}, ${style.visibility}`,
          ]
        : [];
    });
    const box = focused.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      left: box.left,
      right: box.right,
      viewWidth: document.documentElement.clientWidth,
      viewHeight: window.innerHeight,
      scrollY: window.scrollY,
      hiddenParts,
    };
  });
}

/**
 * The chapter titles the story reveals, with any part of them not fully
 * shown: the title or a word of its split below opacity 1.
 */
export function hiddenTitleParts(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("main [data-story-title]")]
      .flatMap((title) => [title, ...title.querySelectorAll<HTMLElement>("*")])
      .filter((element) => getComputedStyle(element).opacity !== "1")
      .map(
        (element) =>
          `${element.closest("[data-story-title]")?.id ?? "?"}: ${element.tagName.toLowerCase()} "${element.textContent ?? ""}" at opacity ${getComputedStyle(element).opacity}`,
      ),
  );
}

/**
 * Every element positioned fixed or sticky, named by tag, its marks and its
 * position, such as `div[data-part="pass-screen"] sticky`.
 */
export function fixedElements(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) =>
        ["fixed", "sticky"].includes(getComputedStyle(element).position),
      )
      .map((element) => {
        const marks = ["id", "data-testid", "data-part", "href"]
          .map((name) => [name, element.getAttribute(name)] as const)
          .filter(([, value]) => value !== null)
          .map(([name, value]) => `[${name}="${value}"]`)
          .join("");
        const { position } = getComputedStyle(element);
        return `${element.tagName.toLowerCase()}${marks} ${position}`;
      }),
  );
}
