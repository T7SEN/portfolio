import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import type { CalmSnapshot } from "@/lib/calm-store";
import { loadMotion } from "@/lib/load-motion";

import { startStory } from "./story-runner";

// The same story with the pinned GSAP itself, in jsdom (which has no layout,
// so every position is 0): the calls it makes exist and its teardown leaves
// nothing behind.

function calmStoreOf(calm: boolean) {
  const snapshot: CalmSnapshot = { calm, system: calm, chosen: false };
  return { getSnapshot: () => snapshot, subscribe: () => () => undefined };
}

let root: HTMLElement;
// Torn down after each test as well, so a failed assertion leaves no
// trigger behind for the next one.
let stopStory: (() => void) | null = null;

beforeEach(() => {
  // jsdom has no matchMedia, which ScrollTrigger calls when it registers.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  // Nor scrolling, which ScrollTrigger uses to restore the position after it
  // measures.
  vi.stubGlobal("scrollTo", () => undefined);
  root = document.createElement("main");
  root.id = "main";
  root.innerHTML = renderToStaticMarkup(<HomePage />);
  document.body.append(root);
  // Titles below the fold, so their reveals are set up.
  for (const title of root.querySelectorAll<HTMLElement>(
    "[data-story-title]",
  )) {
    title.getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;
  }
});

afterEach(() => {
  stopStory?.();
  stopStory = null;
  root.remove();
  vi.unstubAllGlobals();
});

describe("story with the pinned GSAP", () => {
  it.each([false, true])(
    "REQ-SCR-04 REQ-CNT-01 calm %s: starting and tearing down leaves no ScrollTrigger and every title as it was",
    async (calm) => {
      const motion = await loadMotion();
      const before = [
        ...root.querySelectorAll<HTMLElement>("[data-story-title]"),
      ].map((title) => title.innerHTML);
      const bridge = { setStory: vi.fn() };

      const stop = startStory(motion, {
        root,
        bridge,
        calm: calmStoreOf(calm),
        view: { innerHeight: 800 },
        fonts: null,
      });
      stopStory = stop;
      // Six chapters, five cards, three titles.
      expect(motion.ScrollTrigger.getAll()).toHaveLength(14);
      expect(bridge.setStory).toHaveBeenCalled();
      const work = root.querySelector<HTMLElement>("#work-heading");
      if (calm) {
        expect(work?.style.opacity).toBe("0");
        expect(work?.hasAttribute("aria-label")).toBe(false);
      } else {
        // Split into words that wait out of view; the heading keeps its name.
        expect(work?.getAttribute("aria-label")).toBe("Work");
        expect(
          work?.querySelectorAll('[aria-hidden="true"]').length,
        ).toBeGreaterThan(0);
        expect(work?.style.opacity).toBe("");
        const hidden = [
          ...(work?.querySelectorAll<HTMLElement>("*") ?? []),
        ].filter((node) => node.style.opacity === "0");
        expect(hidden.map((node) => node.textContent)).toEqual(["Work"]);
      }

      stop();
      expect(motion.ScrollTrigger.getAll()).toHaveLength(0);
      const after = [
        ...root.querySelectorAll<HTMLElement>("[data-story-title]"),
      ];
      // GSAP's revert may leave an empty style attribute; nothing in it.
      expect(after.map((title) => title.innerHTML)).toEqual(before);
      for (const title of after) {
        expect(title.style.cssText).toBe("");
        expect(title.hasAttribute("aria-label")).toBe(false);
      }
    },
  );
});
