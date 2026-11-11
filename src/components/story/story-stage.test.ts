import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BESIDE_GAP,
  measureLayout,
  sameStages,
  type LayoutView,
} from "./story-stage";

// jsdom has no layout, so every box the measure reads is set by hand: a
// 1280 by 800 window at the top of the page.
const WIDTH = 1280;
const HEIGHT = 800;

type Box = { top: number; bottom: number; left: number; right: number };

function place(element: Element, box: Box) {
  element.getBoundingClientRect = () =>
    ({
      ...box,
      width: box.right - box.left,
      height: box.bottom - box.top,
      x: box.left,
      y: box.top,
    }) as DOMRect;
}

let root: HTMLElement;
let wide = true;

function view(scrollY = 0): LayoutView {
  return {
    scrollX: 0,
    scrollY,
    innerHeight: HEIGHT,
    matchMedia: (() => ({ matches: wide })) as unknown as Window["matchMedia"],
    document,
  };
}

beforeEach(() => {
  wide = true;
  root = document.createElement("main");
  root.innerHTML = `
    <section data-chapter="hero">
      <h1>Real-time worlds</h1>
      <div data-stage="dot-above"><a href="/work">See the work</a></div>
      <a href="#work" data-stage="dot-below">Skip intro</a>
      <p data-scene="hero" class="sr-only">A scene line</p>
    </section>
    <section data-chapter="work">
      <div id="content"><div data-stage="beside"><p>A card</p></div></div>
    </section>`;
  document.body.append(root);
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: WIDTH,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: 5000,
  });
  place(root.querySelector('[data-stage="dot-above"]')!, {
    top: 540,
    bottom: 584,
    left: 88,
    right: 420,
  });
  place(root.querySelector('[data-stage="dot-below"]')!, {
    top: 744,
    bottom: 788,
    left: 88,
    right: 190,
  });
  place(root.querySelector("#content")!, {
    top: 2600,
    bottom: 4600,
    left: 88,
    right: 1192,
  });
  place(root.querySelector('[data-stage="beside"]')!, {
    top: 2600,
    bottom: 4600,
    left: 88,
    right: 664,
  });
  // jsdom's Range has no getClientRects: every text line is given one box.
  Object.defineProperty(Range.prototype, "getClientRects", {
    configurable: true,
    value: function (this: Range) {
      const element = this.startContainer.parentElement;
      const box = element?.closest("[data-scene]")
        ? { top: 300, bottom: 301, left: 0, right: 1 }
        : { top: 100, bottom: 140, left: 0, right: 200 };
      return [{ ...box, width: box.right - box.left, height: 40 }];
    },
  });
});

afterEach(() => {
  root.remove();
  Reflect.deleteProperty(Range.prototype, "getClientRects");
});

describe("the page's layout for the field", () => {
  it("REQ-SCR-01 the dot sits in the middle of the band between the actions and Skip intro", () => {
    const { stages } = measureLayout(root, view());
    // (584 + 744) / 2 = 664 px from the top of 800: y = 1 - 2 * 664 / 800.
    expect(stages.hero?.x).toBe(0);
    expect(stages.hero?.y).toBeCloseTo(1 - (2 * 664) / HEIGHT, 9);
    // Measured in the page, so the same wherever the page is scrolled.
    const scrolled = measureLayout(root, view(0));
    expect(scrolled.stages.hero).toEqual(stages.hero);
  });

  it("REQ-SCR-01 REQ-I18N-01 from the lg breakpoint the work stage is the side the cards leave free, mirrored right to left", () => {
    const ltr = measureLayout(root, view()).stages.work;
    const start = 664 + BESIDE_GAP;
    expect(ltr?.x).toBeCloseTo((start + 1192) / WIDTH - 1, 9);
    expect(ltr?.halfWidth).toBeCloseTo((1192 - start) / WIDTH, 9);

    // The same layout read right to left: the cards at the inline start,
    // now the right, and the free side on the left.
    const column = root.querySelector<HTMLElement>('[data-stage="beside"]')!;
    column.style.direction = "rtl";
    place(column, { top: 2600, bottom: 4600, left: 616, right: 1192 });
    const rtl = measureLayout(root, view()).stages.work;
    expect(rtl?.x).toBeCloseTo(-(ltr?.x ?? 0), 9);
    expect(rtl?.halfWidth).toBeCloseTo(ltr?.halfWidth ?? 0, 9);
  });

  it("REQ-SCR-01 below the lg breakpoint, or with too little room beside the cards, the shapes keep the whole frame", () => {
    wide = false;
    expect(measureLayout(root, view()).stages.work).toBeUndefined();
    wide = true;
    place(root.querySelector('[data-stage="beside"]')!, {
      top: 2600,
      bottom: 4600,
      left: 88,
      right: 1000,
    });
    expect(measureLayout(root, view()).stages.work).toBeUndefined();
  });

  it("REQ-A11Y-06 every text element's whole box is measured in page coordinates, once; the clipped scene lines are not", () => {
    const heading = root.querySelector("h1")!;
    const card = root.querySelector('[data-stage="beside"] p')!;
    const action = root.querySelector('[data-stage="dot-above"] a')!;
    place(heading, { top: 270, bottom: 420, left: 88, right: 1192 });
    place(card, { top: 2620, bottom: 2700, left: 112, right: 640 });
    place(action, { top: 540, bottom: 584, left: 88, right: 234 });
    // A link inside a paragraph is covered by the paragraph's box.
    card.innerHTML = 'A card with <a href="/work">a link</a> in it';

    const { lines } = measureLayout(root, view(1000));
    expect(lines).toEqual([
      { top: 1270, bottom: 1420, left: 88, right: 1192 },
      { top: 1540, bottom: 1584, left: 88, right: 234 },
      { top: 1744, bottom: 1788, left: 88, right: 190 },
      { top: 3620, bottom: 3700, left: 112, right: 640 },
    ]);
  });

  it("REQ-A11Y-06 text straight in a list item is held by the item; text in no element falls back to its line boxes", () => {
    root.innerHTML =
      '<ul><li id="offer">An offer</li></ul><div id="loose">Loose words</div>';
    place(root.querySelector("#offer")!, {
      top: 10,
      bottom: 50,
      left: 0,
      right: 300,
    });
    const { lines } = measureLayout(root, view(0));
    expect(lines).toEqual([
      { top: 10, bottom: 50, left: 0, right: 300 },
      // The loose words read their line box from the stubbed range.
      { top: 100, bottom: 140, left: 0, right: 200 },
    ]);
  });

  it("REQ-SCR-01 stages that moved by less than a hair are the same stages", () => {
    const stage = { x: 0.5, y: 0, halfWidth: 0.4, halfHeight: 0.85 };
    expect(sameStages(null, {})).toBe(false);
    expect(
      sameStages({ work: stage }, { work: { ...stage, x: 0.50001 } }),
    ).toBe(true);
    expect(sameStages({ work: stage }, { work: { ...stage, x: 0.6 } })).toBe(
      false,
    );
    expect(sameStages({ work: stage }, {})).toBe(false);
  });
});
