import { describe, expect, it } from "vitest";

import { STEP_EDGE, WORK_SHAPES, workStep } from "@/engine/story";

import {
  FIRST_RISE,
  isReached,
  resolveStory,
  rowInView,
  sameStory,
  spanProgress,
  workProgress,
  type ChapterSpan,
  type Span,
} from "./story-progress";

// A page laid out like the home page, in scroll pixels: each span starts
// when the section's top reaches the viewport's middle. A gap is left
// between the hero and the bloom, to check the rule for gaps.
const PAGE: ChapterSpan[] = [
  { chapter: "hero", start: -300, end: 400 },
  { chapter: "bloom", start: 700, end: 1900 },
  { chapter: "work", start: 1900, end: 3500 },
  { chapter: "making-of", start: 3500, end: 4300 },
  { chapter: "about", start: 4300, end: 4900 },
  { chapter: "contact", start: 4900, end: 5500 },
];

// Three study rows inside the work chapter, 200 px each with 100 px between
// them: one per work shape.
const CARDS = [0, 1, 2].map((index) => ({
  start: 2100 + index * 300,
  end: 2300 + index * 300,
}));

describe("spanProgress", () => {
  it("REQ-SCR-01 is 0 when the top reaches the middle and 1 when the bottom does", () => {
    const span = { start: 100, end: 300 };
    expect(spanProgress(100, span)).toBe(0);
    expect(spanProgress(200, span)).toBe(0.5);
    expect(spanProgress(300, span)).toBe(1);
  });

  it("REQ-SCR-01 is clamped to 0 to 1 outside the span", () => {
    const span = { start: 100, end: 300 };
    expect(spanProgress(-50, span)).toBe(0);
    expect(spanProgress(900, span)).toBe(1);
  });

  it("REQ-SCR-01 an empty span is 0 before it and 1 from it on", () => {
    expect(spanProgress(99, { start: 100, end: 100 })).toBe(0);
    expect(spanProgress(100, { start: 100, end: 100 })).toBe(1);
    expect(spanProgress(Number.NaN, { start: 0, end: 10 })).toBe(0);
  });
});

describe("resolveStory", () => {
  it("REQ-SCR-01 gives the chapter at the viewport's middle and how far through it", () => {
    expect(resolveStory(200, PAGE)).toEqual({
      chapter: "hero",
      progress: 0.5,
    });
    expect(resolveStory(1300, PAGE)).toEqual({
      chapter: "bloom",
      progress: 0.5,
    });
    expect(resolveStory(3900, PAGE)).toEqual({
      chapter: "making-of",
      progress: 0.5,
    });
    expect(resolveStory(4300, PAGE)).toEqual({ chapter: "about", progress: 0 });
  });

  it("REQ-SCR-01 the first chapter runs from the page's top to where its bottom reaches the middle", () => {
    expect(resolveStory(0, PAGE)).toEqual({ chapter: "hero", progress: 0 });
    expect(resolveStory(100, PAGE)).toEqual({
      chapter: "hero",
      progress: 0.25,
    });
    expect(resolveStory(400, PAGE)).toEqual({ chapter: "hero", progress: 1 });
    // Only the first: every other chapter starts at the middle.
    expect(resolveStory(1000, PAGE)).toEqual({
      chapter: "bloom",
      progress: 0.25,
    });
    // A first chapter ending above the page's top is whole from the start.
    expect(
      resolveStory(0, [{ chapter: "hero", start: -500, end: -100 }]),
    ).toEqual({ chapter: "hero", progress: 1 });
  });

  it("REQ-SCR-01 a gap between two chapters belongs to the chapter above at 1", () => {
    for (const position of [400, 500, 699]) {
      expect(resolveStory(position, PAGE)).toEqual({
        chapter: "hero",
        progress: 1,
      });
    }
    expect(resolveStory(700, PAGE)).toEqual({ chapter: "bloom", progress: 0 });
  });

  it("REQ-SCR-01 above the first chapter is the hero at 0; past the last is contact at 1", () => {
    expect(resolveStory(-1000, PAGE)).toEqual({
      chapter: "hero",
      progress: 0,
    });
    expect(resolveStory(9000, PAGE)).toEqual({
      chapter: "contact",
      progress: 1,
    });
  });

  it("REQ-SCR-01 the work chapter takes its progress from the row in view", () => {
    // The middle of the third row (2700 to 2900): step 2, halfway.
    const story = resolveStory(2800, PAGE, CARDS);
    expect(story?.chapter).toBe("work");
    expect(workStep(story?.progress ?? -1)).toEqual({ index: 2, local: 0.5 });
  });

  it("REQ-SCR-01 with no rows the work chapter falls back to its own span", () => {
    expect(resolveStory(2700, PAGE)).toEqual({
      chapter: "work",
      progress: 0.5,
    });
  });

  it("REQ-SCR-01 no chapters give no story", () => {
    expect(resolveStory(0, [])).toBeNull();
  });
});

describe("workProgress", () => {
  it("REQ-SCR-01 each study row is one of workStep's equal steps, in study order", () => {
    expect(CARDS).toHaveLength(WORK_SHAPES.length);
    CARDS.forEach((card, index) => {
      for (const local of [0, 0.25, 0.5, 0.75, 0.9]) {
        const position = card.start + local * (card.end - card.start);
        const step = workStep(workProgress(position, CARDS));
        expect(step.index).toBe(index);
        // The first row holds its shape whole from its start (firstPlace):
        // its span up to the turn is laid over the step's whole stretch.
        const expected =
          index === 0 && local < 1 - STEP_EDGE
            ? STEP_EDGE + (local / (1 - STEP_EDGE)) * (1 - 2 * STEP_EDGE)
            : local;
        expect(step.local).toBeCloseTo(expected, 10);
      }
    });
  });

  it("REQ-SCR-01 with no screen height, above the first row the first shape has not begun", () => {
    expect(workProgress(1950, CARDS)).toBe(0);
    expect(workStep(workProgress(1950, CARDS))).toEqual({
      index: 0,
      local: 0,
    });
  });

  it("REQ-SCR-01 REQ-NAV-01 the first study's shape forms as its row comes up the screen and is whole before the row reaches the middle", () => {
    // An 800 px screen: the first row's top shows at the bottom at 1700 and
    // reaches the middle at 2100.
    const height = 800;
    const [first, second] = CARDS as [Span, Span, Span];
    const shows = first.start - height / 2;
    const whole = shows + (height / 2) * FIRST_RISE;
    expect(workProgress(shows - 50, CARDS, WORK_SHAPES.length, height)).toBe(0);
    const forming = workStep(
      workProgress((shows + whole) / 2, CARDS, WORK_SHAPES.length, height),
    );
    expect(forming.index).toBe(0);
    expect(forming.local).toBeCloseTo(STEP_EDGE / 2, 10);
    // Whole from there through the row's own span up to the turn, wherever
    // a jump lands: Skip intro puts the row's top anywhere in this stretch.
    const turn = first.start + (1 - STEP_EDGE) * 200;
    let before = -1;
    for (let position = whole; position <= turn; position += 10) {
      const step = workStep(
        workProgress(position, CARDS, WORK_SHAPES.length, height),
      );
      expect(step.index).toBe(0);
      expect(step.local).toBeGreaterThanOrEqual(STEP_EDGE - 1e-9);
      expect(step.local).toBeLessThanOrEqual(1 - STEP_EDGE + 1e-9);
      expect(step.local).toBeGreaterThanOrEqual(before);
      before = step.local;
    }
    // The turn to the next study starts where it always did.
    const late = first.start + 0.9 * 200;
    expect(
      workStep(workProgress(late, CARDS, WORK_SHAPES.length, height)).local,
    ).toBeCloseTo(0.9, 10);
    // Only the first row: the others keep their own spans.
    const middle = second.start + 0.1 * 200;
    expect(
      workStep(workProgress(middle, CARDS, WORK_SHAPES.length, height)).local,
    ).toBeCloseTo(0.1, 10);
  });

  it("REQ-SCR-01 the work chapter's first rise reaches resolveStory with the screen's height", () => {
    const story = resolveStory(1950, PAGE, CARDS, 800);
    expect(story?.chapter).toBe("work");
    expect(workStep(story?.progress ?? -1).local).toBeCloseTo(STEP_EDGE, 10);
  });

  it("REQ-SCR-01 between two rows the next shape is at its start", () => {
    const step = workStep(workProgress(2350, CARDS));
    expect(step.index).toBe(1);
    expect(step.local).toBeCloseTo(0, 10);
  });

  it("REQ-SCR-01 past the last row the last shape is complete", () => {
    expect(workProgress(4000, CARDS)).toBe(1);
    expect(workStep(1)).toEqual({ index: WORK_SHAPES.length - 1, local: 1 });
  });

  it("REQ-SCR-01 extra items beyond the shapes are ignored", () => {
    const extra = [...CARDS, { start: 3600, end: 3800 }];
    expect(workProgress(3700, extra)).toBe(1);
  });
});

describe("rowInView", () => {
  it("REQ-SCR-01 the frame the shape forms in belongs to the same study as the shape, at every position", () => {
    for (let position = 1800; position <= 3200; position += 25) {
      expect(rowInView(position, CARDS)).toBe(
        workStep(workProgress(position, CARDS)).index,
      );
      expect(rowInView(position, CARDS)).toBe(
        workStep(workProgress(position, CARDS, WORK_SHAPES.length, 800)).index,
      );
    }
  });

  it("REQ-SCR-01 above the first row the first; inside a row that row; between rows the next; past the last the last", () => {
    expect(rowInView(1000, CARDS)).toBe(0);
    expect(rowInView(2200, CARDS)).toBe(0);
    expect(rowInView(2300, CARDS)).toBe(1);
    expect(rowInView(2350, CARDS)).toBe(1);
    expect(rowInView(2899, CARDS)).toBe(2);
    expect(rowInView(9000, CARDS)).toBe(2);
  });

  it("REQ-SCR-01 fewer rows than shapes never name a row that is not there, and no rows give the first", () => {
    expect(rowInView(9000, CARDS.slice(0, 2))).toBe(1);
    expect(rowInView(9000, [])).toBe(0);
  });
});

describe("sameStory", () => {
  it("REQ-SCR-01 only a new chapter or a real change in progress counts as new", () => {
    const story = { chapter: "bloom", progress: 0.5 } as const;
    expect(sameStory(null, story)).toBe(false);
    expect(sameStory(story, { chapter: "bloom", progress: 0.50001 })).toBe(
      true,
    );
    expect(sameStory(story, { chapter: "bloom", progress: 0.51 })).toBe(false);
    expect(sameStory(story, { chapter: "work", progress: 0.5 })).toBe(false);
  });
});

describe("isReached", () => {
  it("REQ-SCR-05 REQ-CNT-01 a title on screen or above is left as it is; one below the fold waits", () => {
    expect(isReached(-200, 800)).toBe(true);
    expect(isReached(0, 800)).toBe(true);
    expect(isReached(799, 800)).toBe(true);
    expect(isReached(800, 800)).toBe(false);
    expect(isReached(1500, 800)).toBe(false);
  });
});
