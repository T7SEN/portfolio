import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  measureLayout,
  measureStages,
  sameStages,
  screenStage,
  stagesAt,
  workStage,
  type LayoutView,
} from "./story-stage";

// jsdom has no layout, so every box the measure reads is set by hand, in
// page coordinates: a 1280 by 800 window over a 5,000 px page, its boxes
// moved by the scroll position as a browser moves them.
const WIDTH = 1280;
const HEIGHT = 800;
const PAGE_HEIGHT = 5000;

type Box = { top: number; bottom: number; left: number; right: number };

let root: HTMLElement;
let scrolled = 0;

function place(element: Element, box: Box) {
  element.getBoundingClientRect = () =>
    ({
      top: box.top - scrolled,
      bottom: box.bottom - scrolled,
      left: box.left,
      right: box.right,
      width: box.right - box.left,
      height: box.bottom - box.top,
      x: box.left,
      y: box.top - scrolled,
    }) as DOMRect;
}

function view(scrollY = 0): LayoutView {
  scrolled = scrollY;
  return {
    scrollX: 0,
    scrollY,
    innerHeight: HEIGHT,
    getComputedStyle: window.getComputedStyle.bind(window),
    document,
  };
}

/** Mirrors a box across the page, as a right to left layout places it. */
function mirrored(box: Box): Box {
  return { ...box, left: WIDTH - box.right, right: WIDTH - box.left };
}

// The hero's dot room from 1024 px: a 16rem square at the inline end.
const DOT = { top: 300, bottom: 556, left: 856, right: 1112 };
// Three study rows, each with its frame at the inline start.
const ROWS = [0, 1, 2].map((index) => ({
  item: { top: 2600 + index * 700, bottom: 3100 + index * 700 },
  frame: {
    top: 2600 + index * 700,
    bottom: 3040 + index * 700,
    left: 88,
    right: 700,
  },
}));
// The contact panel at the inline end, near the page's foot.
const PANEL = { top: 4700, bottom: 4950, left: 600, right: 1192 };

function layOut(mirror = false) {
  const at = (box: Box) => (mirror ? mirrored(box) : box);
  place(root.querySelector('[data-stage="dot"]')!, at(DOT));
  root
    .querySelectorAll<HTMLElement>("[data-work-step]")
    .forEach((item, index) => {
      const row = ROWS[index]!;
      place(item, { ...row.item, left: 88, right: 1192 });
      place(item.querySelector('[data-stage="frame"]')!, at(row.frame));
      // The details beside the frame, past a 56 px gap.
      place(
        item.querySelector("h3")!,
        at({
          top: row.frame.top + 100,
          bottom: row.frame.top + 140,
          left: 756,
          right: 1192,
        }),
      );
    });
  place(root.querySelector('[data-stage="contact"]')!, at(PANEL));
}

beforeEach(() => {
  root = document.createElement("main");
  root.innerHTML = `
    <section data-chapter="hero">
      <h1>Real-time worlds</h1>
      <div aria-hidden="true"><div data-stage="dot"></div></div>
      <a href="#work">Skip intro</a>
      <p data-scene="hero" class="sr-only">A scene line</p>
    </section>
    <section data-chapter="work">
      <ol>
        ${[0, 1, 2]
          .map(
            (index) => `
          <li data-work-step="${index}">
            <article>
              <div aria-hidden="true" data-stage="frame" style="border-top-left-radius: 16px"></div>
              <div><h3>Study ${index}</h3></div>
            </article>
          </li>`,
          )
          .join("")}
      </ol>
    </section>
    <section data-chapter="contact">
      <div data-stage="contact"><p>Send a message</p></div>
    </section>`;
  document.body.append(root);
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: WIDTH,
  });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: PAGE_HEIGHT,
  });
  layOut();
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
  scrolled = 0;
  Reflect.deleteProperty(Range.prototype, "getClientRects");
});

describe("a box as a stage", () => {
  it("REQ-SCR-01 a box's centre and halves in normalised device coordinates, y up, the whole screen 1 and 1", () => {
    expect(
      screenStage({ top: 0, bottom: 800, left: 0, right: 1280 }, 0, 1280, 800),
    ).toEqual({ x: 0, y: 0, halfWidth: 1, halfHeight: 1 });
    // A 256 px square whose top start corner is at the screen's middle.
    const square = screenStage(
      { top: 1400, bottom: 1656, left: 640, right: 896 },
      1000,
      1280,
      800,
    );
    expect(square?.x).toBeCloseTo(0.2, 9);
    expect(square?.y).toBeCloseTo(-0.32, 9);
    expect(square?.halfWidth).toBeCloseTo(0.2, 9);
    expect(square?.halfHeight).toBeCloseTo(0.32, 9);
    expect(screenStage(DOT, 0, 0, 800)).toBeUndefined();
  });
});

describe("the stages that keep one place", () => {
  it("REQ-SCR-01 the dot is the centre of its empty box and the halo reaches its edges, as the screen shows it at the top of the page", () => {
    const { stages } = measureLayout(root, view());
    expect(stages.hero?.x).toBeCloseTo((856 + 1112) / WIDTH - 1, 9);
    expect(stages.hero?.y).toBeCloseTo(1 - (300 + 556) / HEIGHT, 9);
    expect(stages.hero?.halfWidth).toBeCloseTo(256 / WIDTH, 9);
    expect(stages.hero?.halfHeight).toBeCloseTo(256 / HEIGHT, 9);
    // The canvas is fixed, so the dot stays where the visitor first saw it
    // wherever the page is when it is measured.
    expect(measureLayout(root, view(1800)).stages.hero).toEqual(stages.hero);
  });

  it("REQ-SCR-01 the dot stays inside the screen's top and bottom", () => {
    place(root.querySelector('[data-stage="dot"]')!, {
      top: 900,
      bottom: 1000,
      left: 0,
      right: 1280,
    });
    expect(measureLayout(root, view()).stages.hero?.y).toBe(-0.9);
  });

  it("REQ-SCR-01 D-146 the contact panel sends no stage: the sky has its own band", () => {
    const { stages } = measureLayout(root, view(1200));
    expect(stages).not.toHaveProperty("contact");
  });

  it("REQ-SCR-01 a page without the dot, or one not laid out, sends no stage for it", () => {
    place(root.querySelector('[data-stage="dot"]')!, {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    });
    const { stages } = measureLayout(root, view());
    expect(stages).not.toHaveProperty("hero");
  });

  it("REQ-SCR-01 REQ-I18N-01 a layout read right to left gives mirrored stages, with nothing to swap", () => {
    const ltr = measureLayout(root, view()).stages;
    layOut(true);
    const rtl = measureLayout(root, view()).stages;
    expect(rtl.hero?.x).toBeCloseTo(-(ltr.hero?.x ?? 0), 9);
    expect(rtl.hero?.y).toBeCloseTo(ltr.hero?.y ?? 0, 9);
    const at = { position: 2500, height: HEIGHT, row: 0, calm: false };
    layOut(false);
    const left = workStage(measureLayout(root, view()), at);
    layOut(true);
    const right = workStage(measureLayout(root, view()), at);
    expect(right?.x).toBeCloseTo(-(left?.x ?? 0), 9);
    expect(right?.y).toBeCloseTo(left?.y ?? 0, 9);
  });
});

describe("the work stage", () => {
  it("REQ-SCR-01 each study row's frame is measured in page coordinates, in step order, with its corner radius", () => {
    const { frames } = measureLayout(root, view(1500));
    expect(frames).toEqual(ROWS.map(({ frame }) => ({ ...frame, radius: 16 })));
  });

  it("REQ-SCR-01 the work stage is the frame of the row in view where the screen shows it, so the shape moves with its frame", () => {
    const layout = measureLayout(root, view());
    const at = (position: number, row = 0) =>
      workStage(layout, { position, height: HEIGHT, row, calm: false });
    // Scrolled to 2,500 px the first frame shows from 100 to 540 px down.
    expect(at(2500)).toEqual({
      x: (88 + 700) / WIDTH - 1,
      y: 1 - (100 + 540) / HEIGHT,
      halfWidth: 612 / WIDTH,
      halfHeight: 440 / HEIGHT,
    });
    // Ten pixels more and it is ten pixels higher: a small move the engine
    // takes at once.
    expect((at(2510)?.y ?? 0) - (at(2500)?.y ?? 0)).toBeCloseTo(
      (2 * 10) / HEIGHT,
      9,
    );
    // The next row's frame is a different place: a jump the engine glides.
    expect(at(2500, 1)?.y).toBeCloseTo(1 - (800 + 1240) / HEIGHT, 9);
  });

  it("REQ-A11Y-03 in calm the work stage is the frame with its middle at the screen's middle, wherever the page is", () => {
    const layout = measureLayout(root, view());
    const calm = (position: number) =>
      workStage(layout, { position, height: HEIGHT, row: 1, calm: true });
    expect(calm(2000)).toEqual(calm(3700));
    expect(calm(2000)).toEqual({
      x: (88 + 700) / WIDTH - 1,
      y: 0,
      halfWidth: 612 / WIDTH,
      halfHeight: 440 / HEIGHT,
    });
  });

  it("REQ-SCR-01 a row without a frame, or a row that is not there, has no work stage and keeps the stages that stay", () => {
    root.querySelector('[data-work-step="1"] [data-stage="frame"]')?.remove();
    const layout = measureLayout(root, view());
    expect(layout.frames[1]).toBeNull();
    const scroll = { position: 3000, height: HEIGHT, calm: false };
    expect(workStage(layout, { ...scroll, row: 1 })).toBeUndefined();
    expect(workStage(layout, { ...scroll, row: 7 })).toBeUndefined();
    expect(stagesAt(layout, { ...scroll, row: 1 })).toEqual(layout.stages);
    expect(stagesAt(layout, { ...scroll, row: 0 })).toEqual({
      ...layout.stages,
      work: workStage(layout, { ...scroll, row: 0 }),
    });
  });

  it("REQ-SCR-01 on mount the stages carry the frame of the row the story picks at the scroll position now", () => {
    // Scrolled to 2,900 px, the second row's top is at the screen's middle.
    const stages = measureStages(root, view(2900));
    expect(stages.hero).toEqual(measureLayout(root, view()).stages.hero);
    expect(stages.work?.y).toBeCloseTo(1 - (400 + 840) / HEIGHT, 9);
    expect(measureStages(root, view(2900), true).work?.y).toBe(0);
  });
});

describe("the page's text, for the plates", () => {
  it("REQ-A11Y-06 every text element's whole box is measured in page coordinates, once; the clipped scene lines are not", () => {
    root.innerHTML = `
      <section data-chapter="hero">
        <h1>Real-time worlds</h1>
        <a href="#work">Skip intro</a>
        <p data-scene="hero" class="sr-only">A scene line</p>
      </section>
      <p id="card">A card</p>`;
    const heading = root.querySelector("h1")!;
    const action = root.querySelector("a")!;
    const card = root.querySelector("#card")!;
    place(heading, { top: 1270, bottom: 1420, left: 88, right: 1192 });
    place(action, { top: 1744, bottom: 1788, left: 88, right: 190 });
    place(card, { top: 3620, bottom: 3700, left: 112, right: 640 });
    // A link inside a paragraph is covered by the paragraph's box.
    card.innerHTML = 'A card with <a href="/work">a link</a> in it';

    const { lines } = measureLayout(root, view(1000));
    expect(lines).toEqual([
      { top: 1270, bottom: 1420, left: 88, right: 1192 },
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

  it("REQ-A11Y-06 text that holds on screen with its own plate adds no line, since a plate laid on the page could not follow it", () => {
    root.innerHTML = `
      <section data-chapter="bloom">
        <div data-plate="own"><h2 id="label">Field</h2></div>
        <div data-plate="own"><p id="note">Move the cursor to stir the field</p></div>
        <p id="free">Free words</p>
      </section>`;
    for (const id of ["label", "note", "free"]) {
      place(root.querySelector(`#${id}`)!, {
        top: 10,
        bottom: 30,
        left: 0,
        right: 200,
      });
    }

    const { lines } = measureLayout(root, view(0));
    expect(lines).toEqual([{ top: 10, bottom: 30, left: 0, right: 200 }]);
  });

  it("REQ-A11Y-06 D-146 text that is not the page's own, the loader's label and the sky's name, adds no line", () => {
    root.innerHTML = `
      <div data-plate="none"><p id="cover">Field ready</p></div>
      <section data-chapter="contact">
        <div data-plate="none"><span id="name">Orion</span></div>
        <p id="free">Free words</p>
      </section>`;
    for (const id of ["cover", "name", "free"]) {
      place(root.querySelector(`#${id}`)!, {
        top: 10,
        bottom: 30,
        left: 0,
        right: 200,
      });
    }

    const { lines } = measureLayout(root, view(0));
    expect(lines).toEqual([{ top: 10, bottom: 30, left: 0, right: 200 }]);
  });

  it("REQ-A11Y-06 REQ-ENG-09 a pass card's label is its own text box, so the card's face, where the field draws, adds no line", () => {
    root.innerHTML = `
      <div role="group">
        <button id="card" type="button">
          <span id="face" aria-hidden="true" data-pass-face="velocity" data-live=""></span>
          <span id="label" data-plate="box"><span>2 <span aria-hidden="true">·</span> Velocity</span></span>
        </button>
      </div>
      <button id="plain" type="button">Calm mode</button>`;
    place(root.querySelector("#card")!, {
      top: 4100,
      bottom: 4410,
      left: 300,
      right: 500,
    });
    place(root.querySelector("#label")!, {
      top: 4392,
      bottom: 4410,
      left: 350,
      right: 450,
    });
    place(root.querySelector("#plain")!, {
      top: 10,
      bottom: 54,
      left: 0,
      right: 120,
    });

    const { lines } = measureLayout(root, view(4000));
    // One line for the label, once for its three runs of text, and a button
    // with no marked box keeps its whole box.
    expect(lines).toEqual([
      { top: 4392, bottom: 4410, left: 350, right: 450 },
      { top: 10, bottom: 54, left: 0, right: 120 },
    ]);
  });

  it("REQ-A11Y-06 a study frame holds no text, so it adds no line", () => {
    const { lines, frames } = measureLayout(root, view());
    // The three titles beside the frames, and nothing from the frames.
    expect(lines).toHaveLength(3);
    for (const frame of frames) {
      for (const line of lines) {
        const overlaps =
          line.left < (frame?.right ?? 0) &&
          (frame?.left ?? 0) < line.right &&
          line.top < (frame?.bottom ?? 0) &&
          (frame?.top ?? 0) < line.bottom;
        expect(overlaps).toBe(false);
      }
    }
  });
});

describe("sameStages", () => {
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
