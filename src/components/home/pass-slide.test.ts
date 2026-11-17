import { describe, expect, test } from "vitest";

import { PASSES } from "@/engine/story";

import {
  glideCard,
  keyStep,
  catchRest,
  CATCH_HOLD_MS,
  isPageKey,
  isSwipe,
  MOMENTUM_QUIET_MS,
  pageRest,
  progressAt,
  sideKey,
  stepRest,
  STEP_HOLD_MS,
  SWIPE_PX,
  middleCard,
  NEW_TURN,
  NOTCH_GAP_MS,
  NOTCH_PX,
  restProgress,
  TURN_GAP_MS,
  wheelStep,
  type WheelTurn,
  SETTLE_DELAY_MS,
  SETTLE_LEAN,
  settleCard,
  SLIDE_MOVE,
  SLIDE_REST,
  SLIDE_SCREENS,
  slideAt,
  STRETCH_SCREENS,
} from "./pass-slide";

const sweep = Array.from({ length: 2001 }, (_, step) => step / 2000);

describe("the making-of slide", () => {
  test("REQ-ENG-09 REQ-SCR-02 the slide's scroll is five rests and four glides, and the stretch adds the held screen", () => {
    expect(SLIDE_SCREENS).toBeCloseTo(
      PASSES.length * SLIDE_REST + (PASSES.length - 1) * SLIDE_MOVE,
      12,
    );
    expect(STRETCH_SCREENS).toBeCloseTo(1 + SLIDE_SCREENS, 12);
    expect(SLIDE_REST).toBeGreaterThan(0);
    expect(SLIDE_MOVE).toBeGreaterThan(0);
  });

  test("REQ-SCR-02 the row's place is a function of the scroll alone: it starts at the first card, ends at the last and never runs backwards", () => {
    expect(slideAt(0)).toBe(0);
    expect(slideAt(1)).toBe(PASSES.length - 1);
    let previous = -Infinity;
    for (const progress of sweep) {
      const at = slideAt(progress);
      expect(at).toBeGreaterThanOrEqual(previous);
      expect(at).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThanOrEqual(PASSES.length - 1);
      previous = at;
    }
  });

  test("REQ-ENG-09 each card rests whole in the middle for its stretch of scroll, and the row glides between two", () => {
    const span = SLIDE_REST + SLIDE_MOVE;
    for (let card = 0; card < PASSES.length; card += 1) {
      const start = (card * span) / SLIDE_SCREENS;
      const end = (card * span + SLIDE_REST) / SLIDE_SCREENS;
      for (const share of [0, 0.25, 0.5, 0.75, 1]) {
        expect(slideAt(start + share * (end - start))).toBe(card);
      }
      if (card === PASSES.length - 1) continue;
      const glide = (card * span + SLIDE_REST + SLIDE_MOVE / 2) / SLIDE_SCREENS;
      const at = slideAt(glide);
      expect(at).toBeGreaterThan(card);
      expect(at).toBeLessThan(card + 1);
      expect(at).toBeCloseTo(card + 0.5, 6);
    }
  });

  test("REQ-ENG-09 the middle card is the nearest whole card, and a card's rest is where Tab and a click take the page", () => {
    expect(middleCard(0)).toBe(0);
    expect(middleCard(1.49)).toBe(1);
    expect(middleCard(1.51)).toBe(2);
    expect(middleCard(-3)).toBe(0);
    expect(middleCard(99)).toBe(PASSES.length - 1);
    expect(middleCard(Number.NaN)).toBe(0);
    for (let card = 0; card < PASSES.length; card += 1) {
      const progress = restProgress(card);
      expect(progress).toBeGreaterThan(0);
      expect(progress).toBeLessThan(1);
      expect(slideAt(progress)).toBe(card);
      expect(middleCard(slideAt(progress))).toBe(card);
    }
    expect(restProgress(-1)).toBe(restProgress(0));
    expect(restProgress(9)).toBe(restProgress(PASSES.length - 1));
  });

  test("REQ-ENG-09 while the row glides the mark streams between the middle card and the one beside it: the card it leaves, then the card it reaches; at rest there is none", () => {
    for (let card = 0; card < PASSES.length; card += 1) {
      expect(glideCard(card)).toBeNull();
      expect(glideCard(slideAt(restProgress(card)))).toBeNull();
    }
    // Before the middle changes, the card the mark is reaching.
    expect(glideCard(1.2)).toBe(2);
    expect(middleCard(1.2)).toBe(1);
    // After it, the card the mark has left.
    expect(glideCard(1.8)).toBe(1);
    expect(middleCard(1.8)).toBe(2);
    // Never the middle card itself, and always a neighbour of it.
    for (const at of sweep.map((progress) => slideAt(progress))) {
      const other = glideCard(at);
      if (other === null) continue;
      expect(other).not.toBe(middleCard(at));
      expect(Math.abs(other - middleCard(at))).toBe(1);
    }
    expect(glideCard(-1)).toBeNull();
    expect(glideCard(99)).toBeNull();
    expect(glideCard(Number.NaN)).toBeNull();
  });

  test("REQ-SCR-02 one wheel notch from a card's rest settles on the next card on a common screen; a small nudge settles back", () => {
    // A notch scrolls about 100 px; the slide's scroll is SLIDE_SCREENS
    // screens of the screen's height.
    for (const height of [600, 800, 1080, 1440]) {
      for (const card of [0, 1, 2, 3]) {
        const step = (px: number) => px / (SLIDE_SCREENS * height);
        const rest = restProgress(card);
        expect(settleCard(slideAt(rest + step(100)), 1)).toBe(card + 1);
        expect(settleCard(slideAt(rest + step(10)), 1)).toBeOneOf([null, card]);
      }
    }
  });

  test("REQ-SCR-02 once the scroll stops between two cards the row settles on one: on in the scroll's direction past SETTLE_LEAN, back before it", () => {
    // Down from card 1.
    expect(settleCard(1 + SETTLE_LEAN, 1)).toBe(2);
    expect(settleCard(1.6, 1)).toBe(2);
    expect(settleCard(1 + SETTLE_LEAN / 2, 1)).toBe(1);
    // Up from card 2.
    expect(settleCard(2 - SETTLE_LEAN, -1)).toBe(1);
    expect(settleCard(1.4, -1)).toBe(1);
    expect(settleCard(2 - SETTLE_LEAN / 2, -1)).toBe(2);
    // No direction known: the nearer card.
    expect(settleCard(1.3, 0)).toBe(1);
    expect(settleCard(1.7, 0)).toBe(2);
    // At rest on a card, outside the slide, or not a number: nothing.
    for (const card of PASSES.keys()) expect(settleCard(card, 1)).toBeNull();
    expect(settleCard(-0.5, 1)).toBeNull();
    expect(settleCard(PASSES.length + 1, -1)).toBeNull();
    expect(settleCard(Number.NaN, 1)).toBeNull();
    expect(SETTLE_DELAY_MS).toBeGreaterThan(100);
    expect(SETTLE_DELAY_MS).toBeLessThan(400);
  });

  describe("the wheel's steps (D-132)", () => {
    // Five rests 150 px apart, from 1000 px.
    const rests = [1000, 1150, 1300, 1450, 1600];
    let now = 0;
    let turn: WheelTurn = NEW_TURN;
    const wheel = (target: number, delta: number) => {
      const step = wheelStep(target, delta, rests, now, turn);
      turn = step.turn;
      return step.to;
    };
    const later = (ms: number) => {
      now += ms;
    };

    test("REQ-SCR-02 each notch is one glide to the next card, down and up, a turn apart", () => {
      now = 10_000;
      turn = NEW_TURN;
      expect(wheel(1150, 100)).toBe(1300);
      later(TURN_GAP_MS + 1);
      expect(wheel(1300, 100)).toBe(1450);
      later(TURN_GAP_MS + 1);
      expect(wheel(1450, -100)).toBe(1300);
      // A notch of any size from NOTCH_PX up, and a target a pixel off.
      later(TURN_GAP_MS + 1);
      expect(wheel(1301, NOTCH_PX)).toBe(1450);
    });

    test("REQ-SCR-02 a quick spin moves one card; a spin that goes on walks on a card per STEP_HOLD_MS, from where Lenis is heading", () => {
      now = 20_000;
      turn = NEW_TURN;
      expect(wheel(1000, 100)).toBe(1150);
      later(NOTCH_GAP_MS + 10);
      expect(wheel(1150, 100)).toBe(1150);
      later(NOTCH_GAP_MS + 10);
      expect(wheel(1150, 100)).toBe(1150);
      // Still the same turn: a notch every 50 ms until the hold is over.
      for (let ms = 2 * (NOTCH_GAP_MS + 10); ms < STEP_HOLD_MS - 50; ms += 50) {
        later(50);
        expect(wheel(1150, 100)).toBe(1150);
      }
      now = 20_000 + STEP_HOLD_MS;
      expect(wheel(1150, 100)).toBe(1300);
      later(50);
      expect(wheel(1300, 100)).toBe(1300);
      // A pause starts a new turn, which steps at once.
      later(TURN_GAP_MS + 1);
      expect(wheel(1300, 100)).toBe(1450);
    });

    test("REQ-SCR-02 a spin onto the last card holds there, so it never flings the page out of the slide; the next turn leaves", () => {
      now = 25_000;
      turn = NEW_TURN;
      expect(wheel(1450, 100)).toBe(1600);
      later(NOTCH_GAP_MS + 10);
      expect(wheel(1600, 100)).toBe(1600);
      later(NOTCH_GAP_MS + 10);
      expect(wheel(1600, 100)).toBe(1600);
      later(TURN_GAP_MS + 1);
      expect(wheel(1600, 100)).toBeNull();
      // Coming in from above, a spin lands on the first card and holds.
      later(TURN_GAP_MS + 1);
      expect(wheel(950, 100)).toBe(1000);
      later(NOTCH_GAP_MS + 10);
      expect(wheel(1000, 100)).toBe(1000);
    });

    test("REQ-SCR-02 a trackpad's close stream gathers half a card a step, then holds while the card glides in", () => {
      now = 27_000;
      turn = NEW_TURN;
      expect(wheel(1150, 50)).toBe(1300);
      // Its inertia, an input every 16 ms in the same turn: held while the
      // card glides in, then gathered from nothing again.
      while (now + 16 < 27_000 + STEP_HOLD_MS) {
        later(16);
        expect(wheel(1300, 30)).toBe(1300);
      }
      later(16);
      expect(wheel(1300, 30)).toBe(1300);
      later(16);
      expect(wheel(1300, 30)).toBe(1300);
      later(16);
      expect(wheel(1300, 30)).toBe(1450);
    });

    test("REQ-SCR-02 small inputs, a trackpad's, gather until they make half the way to the next card", () => {
      now = 30_000;
      turn = NEW_TURN;
      for (let input = 0; input < 7; input += 1) {
        expect(wheel(1150, 10)).toBe(1150);
        later(16);
      }
      expect(wheel(1150, 10)).toBe(1300);
      // A turn of the other way starts its gathering again.
      later(TURN_GAP_MS + 1);
      expect(wheel(1300, -30)).toBe(1300);
      expect(wheel(1300, 20)).toBe(1300);
      expect(wheel(1300, -30)).toBe(1300);
    });

    test("REQ-SCR-02 past the first card going up or the last going down the wheel scrolls as ever; coming in, it lands on the end card", () => {
      now = 40_000;
      turn = NEW_TURN;
      expect(wheel(1000, -100)).toBeNull();
      later(TURN_GAP_MS + 1);
      expect(wheel(1600, 100)).toBeNull();
      later(TURN_GAP_MS + 1);
      // Above the slide: scrolls as ever until an input reaches it.
      expect(wheel(700, 100)).toBeNull();
      expect(wheel(950, 100)).toBe(1000);
      // Below it, coming back up.
      later(TURN_GAP_MS + 1);
      expect(wheel(1900, -100)).toBeNull();
      expect(wheel(1650, -100)).toBe(1600);
      // Going away from it, nothing.
      expect(wheel(950, -100)).toBeNull();
      expect(wheel(1650, 100)).toBeNull();
    });

    test("REQ-SCR-02 a target between two cards steps to the next one in the input's direction", () => {
      now = 50_000;
      turn = NEW_TURN;
      expect(wheel(1200, 100)).toBe(1300);
      later(TURN_GAP_MS + 1);
      expect(wheel(1200, -100)).toBe(1150);
    });

    test("REQ-SCR-02 no rests, no delta or not a number: the wheel scrolls as ever", () => {
      expect(wheelStep(1000, 100, [], 0, NEW_TURN).to).toBeNull();
      expect(wheelStep(1000, 0, rests, 0, NEW_TURN).to).toBeNull();
      expect(wheelStep(Number.NaN, 100, rests, 0, NEW_TURN).to).toBeNull();
      expect(wheelStep(1000, Number.NaN, rests, 0, NEW_TURN).to).toBeNull();
    });
  });

  describe("the keys' and a finger's steps (D-133)", () => {
    const rests = [1000, 1150, 1300, 1450, 1600];

    test("REQ-SCR-02 a step goes on from the card the page rests on, or from the one behind it between two, and stops at an end", () => {
      expect(stepRest(1150, 1, rests)).toBe(1300);
      expect(stepRest(1150, -1, rests)).toBe(1000);
      expect(stepRest(1151, 1, rests)).toBe(1300);
      expect(stepRest(1200, 1, rests)).toBe(1300);
      expect(stepRest(1200, -1, rests)).toBe(1150);
      expect(stepRest(1150, 1, rests, 2)).toBe(1450);
      expect(stepRest(1150, 1, rests, 9)).toBe(1600);
      expect(stepRest(1300, -1, rests, 9)).toBe(1000);
      // On the end card that way, or away from the slide: none.
      expect(stepRest(1600, 1, rests)).toBeNull();
      expect(stepRest(1000, -1, rests)).toBeNull();
      expect(stepRest(500, 1, rests)).toBeNull();
      expect(stepRest(2000, -1, rests)).toBeNull();
      expect(stepRest(1150, 0, rests)).toBeNull();
      expect(stepRest(1150, 1, [])).toBeNull();
      expect(stepRest(Number.NaN, 1, rests)).toBeNull();
      expect(stepRest(1150, 1, rests, 0)).toBeNull();
    });

    test("REQ-SCR-02 REQ-A11Y-02 the scroll keys step down or up, Space with Shift up; others not at all", () => {
      expect(keyStep("ArrowDown", false)).toBe(1);
      expect(keyStep("PageDown", false)).toBe(1);
      expect(keyStep(" ", false)).toBe(1);
      expect(keyStep("ArrowUp", false)).toBe(-1);
      expect(keyStep("PageUp", false)).toBe(-1);
      expect(keyStep(" ", true)).toBe(-1);
      for (const other of ["Home", "End", "Tab", "Enter", "a"]) {
        expect(keyStep(other, false)).toBe(0);
      }
    });

    test("REQ-SCR-02 a swipe of SWIPE_PX or more, slow or quick, short or long, is a swipe; less is a touch", () => {
      expect(isSwipe(SWIPE_PX - 1)).toBe(false);
      expect(isSwipe(SWIPE_PX)).toBe(true);
      expect(isSwipe(-SWIPE_PX)).toBe(true);
      expect(isSwipe(500)).toBe(true);
      expect(isSwipe(-500)).toBe(true);
      expect(isSwipe(Number.NaN)).toBe(false);
    });

    test("REQ-SCR-02 a key that pages the screen from outside stops on the first card below or the last above, within a screen; else it pages as ever", () => {
      for (const key of ["PageDown", "PageUp", " "]) {
        expect(isPageKey(key), key).toBe(true);
      }
      for (const key of ["ArrowDown", "End", "Home", "Enter"]) {
        expect(isPageKey(key), key).toBe(false);
      }
      expect(pageRest(920, 1, 800, rests)).toBe(1000);
      expect(pageRest(1680, -1, 800, rests)).toBe(1600);
      // More than a screen away, or leaving from an end card: none.
      expect(pageRest(100, 1, 800, rests)).toBeNull();
      expect(pageRest(1600, 1, 800, rests)).toBeNull();
      expect(pageRest(1000, -1, 800, rests)).toBeNull();
      expect(pageRest(920, 0, 800, rests)).toBeNull();
      expect(pageRest(920, 1, 0, rests)).toBeNull();
    });

    test("REQ-SCR-02 a flick's momentum is caught on the first rest it crosses: the first card from above, the last from below, the next card inside", () => {
      expect(catchRest(700, 1050, rests)).toBe(1000);
      expect(catchRest(700, 1500, rests)).toBe(1000);
      expect(catchRest(1900, 1590, rests)).toBe(1600);
      expect(catchRest(1900, 1100, rests)).toBe(1600);
      expect(catchRest(1000, 1160, rests)).toBe(1150);
      expect(catchRest(1200, 1140, rests)).toBe(1150);
      // Short of a rest, or leaving the slide from an end card: none.
      expect(catchRest(700, 990, rests)).toBeNull();
      expect(catchRest(1000, 1100, rests)).toBeNull();
      expect(catchRest(1000, 800, rests)).toBeNull();
      // A page a pixel past a rest is still on it.
      expect(catchRest(1001, 800, rests)).toBeNull();
      expect(catchRest(1599, 1800, rests)).toBeNull();
      expect(catchRest(1600, 1800, rests)).toBeNull();
      expect(catchRest(1200, 1200, rests)).toBeNull();
      expect(catchRest(Number.NaN, 1200, rests)).toBeNull();
      expect(catchRest(700, 1050, [])).toBeNull();
      // The hold outlasts the browser's momentum; a flick scrolls each frame.
      expect(CATCH_HOLD_MS).toBeGreaterThan(1_300);
      expect(MOMENTUM_QUIET_MS).toBeGreaterThan(50);
    });
  });

  test("REQ-SCR-02 REQ-I18N-01 the arrow toward the next card goes on, the other back, mirrored right to left; other keys nothing", () => {
    expect(sideKey("ArrowRight", false)).toBe(1);
    expect(sideKey("ArrowLeft", false)).toBe(-1);
    expect(sideKey("ArrowLeft", true)).toBe(1);
    expect(sideKey("ArrowRight", true)).toBe(-1);
    for (const other of ["ArrowDown", "ArrowUp", " ", "Home", "a"]) {
      expect(sideKey(other, false)).toBe(0);
    }
  });

  test("REQ-SCR-02 progressAt is slideAt's inverse: a card's rest at a whole card, the glide's place between two", () => {
    PASSES.forEach((_, index) => {
      expect(progressAt(index)).toBeCloseTo(restProgress(index), 12);
    });
    for (let step = 0; step <= 400; step += 1) {
      const place = (step / 400) * (PASSES.length - 1);
      expect(slideAt(progressAt(place))).toBeCloseTo(place, 9);
    }
    // Clamped to the cards; not a number is the first card's rest.
    expect(progressAt(-1)).toBe(restProgress(0));
    expect(progressAt(PASSES.length + 2)).toBe(restProgress(PASSES.length - 1));
    expect(progressAt(Number.NaN)).toBe(restProgress(0));
  });

  test("REQ-SCR-02 progress outside 0 to 1, or not a number, is clamped", () => {
    expect(slideAt(-1)).toBe(0);
    expect(slideAt(2)).toBe(PASSES.length - 1);
    expect(slideAt(Number.NaN)).toBe(0);
    expect(slideAt(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
