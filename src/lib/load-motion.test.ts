import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadMotion, loadScrollTrigger } from "./load-motion";

// The real SplitText module, recorded when something first evaluates it.
const evaluated = vi.hoisted(() => [] as string[]);

vi.mock("gsap/SplitText", async (importOriginal) => {
  evaluated.push("gsap/SplitText");
  return importOriginal();
});

beforeEach(() => {
  // jsdom has no matchMedia or scrolling, which ScrollTrigger uses when it
  // registers.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("scrollTo", () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("motion loaders with the pinned GSAP", () => {
  it("REQ-PERF-04 the smooth scroll's loader never evaluates SplitText, and the story's loader adds it to the same gsap and ScrollTrigger", async () => {
    const register = vi.spyOn(gsap, "registerPlugin");

    const scroll = await loadScrollTrigger();
    expect(evaluated).toEqual([]);
    expect(scroll.gsap).toBe(gsap);
    expect(register.mock.calls).toEqual([[scroll.ScrollTrigger]]);

    const story = await loadMotion();
    expect(evaluated).toEqual(["gsap/SplitText"]);
    expect(story.gsap).toBe(scroll.gsap);
    expect(story.ScrollTrigger).toBe(scroll.ScrollTrigger);
    expect(register.mock.calls.slice(1)).toEqual([
      [story.ScrollTrigger],
      [story.SplitText],
    ]);
  });
});
