import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PassCard } from "@/engine/types";

import { FACE_CORNERS } from "./pass-face";
import {
  cornerOrder,
  innerRadius,
  isViewerNear,
  measureMiddleStage,
  measurePassCards,
  measurePassLayout,
  PASS_REACH,
  samePasses,
  screenPoint,
} from "./story-passes";
import type { LayoutView } from "./story-stage";

// jsdom has no layout, so every box is set by hand: a 1280 by 800 window,
// boxes given where the screen shows them now.
const WIDTH = 1280;
const HEIGHT = 800;

type Box = { top: number; bottom: number; left: number; right: number };

let root: HTMLElement;

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

/** A point on the screen as a zero-size box, as a corner mark has. */
function at(x: number, y: number): Box {
  return { top: y, bottom: y, left: x, right: x };
}

function view({
  scrollY = 0,
  direction = "ltr",
  radius = "12px",
}: { scrollY?: number; direction?: string; radius?: string } = {}) {
  return {
    scrollX: 0,
    scrollY,
    innerHeight: HEIGHT,
    getComputedStyle: () =>
      ({
        direction,
        borderTopLeftRadius: radius,
      }) as CSSStyleDeclaration,
    document,
  } as unknown as LayoutView;
}

/** A card of the sliding row as pass-card.tsx draws it. */
function card(pass: string, { live = true, middle = false } = {}) {
  const marks = FACE_CORNERS.map(
    (corner) => `<span data-corner="${corner}"></span>`,
  ).join("");
  const marked = [live && 'data-live=""', middle && 'data-middle=""']
    .filter(Boolean)
    .join(" ");
  return `
    <li data-pass="${pass}">
      <button type="button" aria-label="${pass}">
        <span data-pass-face="${pass}" aria-hidden="true" ${marked}>${marks}</span>
      </button>
      <div><div data-plate="own"><h3>${pass}</h3></div></div>
    </li>`;
}

/** Cards equal to the expected ones, each coordinate to nine places. */
function expectCards(
  actual: readonly PassCard[],
  expected: ReadonlyArray<{
    pass: string;
    corners: ReadonlyArray<{ x: number; y: number }>;
  }>,
) {
  expect(actual.map((card) => card.pass)).toEqual(
    expected.map((card) => card.pass),
  );
  actual.forEach((card, index) => {
    const corners = expected[index]?.corners ?? [];
    expect(card.corners).toHaveLength(corners.length);
    card.corners.forEach((corner, place) => {
      expect(corner.x).toBeCloseTo(corners[place]?.x ?? Number.NaN, 9);
      expect(corner.y).toBeCloseTo(corners[place]?.y ?? Number.NaN, 9);
    });
  });
}

function face(pass: string) {
  return root.querySelector<HTMLElement>(`[data-pass-face="${pass}"]`)!;
}

/** Puts a face's four marks where the screen shows them, by their names. */
function placeMarks(pass: string, points: Record<string, Box>) {
  for (const [corner, box] of Object.entries(points)) {
    place(face(pass).querySelector(`[data-corner="${corner}"]`)!, box);
  }
}

beforeEach(() => {
  root = document.createElement("main");
  root.innerHTML = `
    <div data-pass-viewer="">
      <ol>${card("points", { live: false })}${card("velocity", { middle: true })}${card("glow")}</ol>
    </div>`;
  document.body.append(root);
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: WIDTH,
  });
});

afterEach(() => {
  root.remove();
});

describe("corners in normalised device coordinates", () => {
  it("REQ-ENG-09 a point on the screen maps to -1 to 1 on both axes, y up", () => {
    expect(screenPoint(0, 0, WIDTH, HEIGHT)).toEqual({ x: -1, y: 1 });
    expect(screenPoint(WIDTH, HEIGHT, WIDTH, HEIGHT)).toEqual({ x: 1, y: -1 });
    expect(screenPoint(640, 400, WIDTH, HEIGHT)).toEqual({ x: 0, y: 0 });
    expect(screenPoint(320, 200, WIDTH, HEIGHT)).toEqual({ x: -0.5, y: 0.5 });
    // Off the screen stays off it: a card below the fold is still a card.
    expect(screenPoint(640, 1200, WIDTH, HEIGHT)).toEqual({ x: 0, y: -2 });
  });

  it("REQ-ENG-09 REQ-I18N-01 the corners go top left, top right, bottom right, bottom left of the face, in either reading direction", () => {
    expect(cornerOrder(false)).toEqual([
      "top-start",
      "top-end",
      "bottom-end",
      "bottom-start",
    ]);
    // Right to left, the start corners are on the right.
    expect(cornerOrder(true)).toEqual([
      "top-end",
      "top-start",
      "bottom-start",
      "bottom-end",
    ]);
  });

  it("REQ-ENG-09 each live card is read from the marks in its face's corners, as the screen shows them now", () => {
    // A face turned about its upright axis: its left edge nearer, so taller.
    placeMarks("velocity", {
      "top-start": at(320, 100),
      "top-end": at(480, 120),
      "bottom-end": at(480, 360),
      "bottom-start": at(320, 380),
    });
    placeMarks("glow", {
      "top-start": at(640, 100),
      "top-end": at(800, 100),
      "bottom-end": at(800, 400),
      "bottom-start": at(640, 400),
    });

    expectCards(measurePassCards(root, view()), [
      {
        pass: "velocity",
        corners: [
          { x: -0.5, y: 0.75 },
          { x: -0.25, y: 0.7 },
          { x: -0.25, y: 0.1 },
          { x: -0.5, y: 0.05 },
        ],
      },
      {
        pass: "glow",
        corners: [
          { x: 0, y: 0.75 },
          { x: 0.25, y: 0.75 },
          { x: 0.25, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ]);
  });

  it("REQ-ENG-09 REQ-I18N-01 a face laid out right to left gives the same corners on the screen, so its pass is never mirrored", () => {
    // The same face, its marks named by the right to left direction: the
    // start corners on the right.
    placeMarks("velocity", {
      "top-end": at(320, 100),
      "top-start": at(480, 120),
      "bottom-start": at(480, 360),
      "bottom-end": at(320, 380),
    });
    placeMarks("glow", {
      "top-end": at(640, 100),
      "top-start": at(800, 100),
      "bottom-start": at(800, 400),
      "bottom-end": at(640, 400),
    });

    expectCards(measurePassCards(root, view({ direction: "rtl" })), [
      {
        pass: "velocity",
        corners: [
          { x: -0.5, y: 0.75 },
          { x: -0.25, y: 0.7 },
          { x: -0.25, y: 0.1 },
          { x: -0.5, y: 0.05 },
        ],
      },
      {
        pass: "glow",
        corners: [
          { x: 0, y: 0.75 },
          { x: 0.25, y: 0.75 },
          { x: 0.25, y: 0 },
          { x: 0, y: 0 },
        ],
      },
    ]);
  });

  it("REQ-ENG-09 each card carries its face's own size inside the border, which no turn changes, and its corner radius there", () => {
    placeMarks("velocity", {
      "top-start": at(320, 100),
      "top-end": at(486, 120),
      "bottom-end": at(486, 360),
      "bottom-start": at(320, 380),
    });
    // The face as laid out, before its turn: 198 by 268 inside a 1 px border.
    for (const [name, value] of [
      ["clientWidth", 198],
      ["clientHeight", 268],
    ] as const) {
      Object.defineProperty(face("velocity"), name, {
        configurable: true,
        value,
      });
    }
    const bordered = {
      ...view(),
      getComputedStyle: () =>
        ({
          direction: "ltr",
          borderTopLeftRadius: "12px",
          borderTopWidth: "1px",
        }) as CSSStyleDeclaration,
    } as unknown as LayoutView;

    const [velocity, glow] = measurePassCards(root, bordered);
    expect(velocity?.size).toEqual({ width: 198, height: 268 });
    expect(velocity?.radius).toBe(11);
    // jsdom lays nothing out, so a face with no size sends none, and the
    // engine takes the width over height the corners draw.
    expect(glow?.size).toBeUndefined();
    expect(glow?.radius).toBe(11);

    const square = {
      ...view(),
      getComputedStyle: () =>
        ({
          direction: "ltr",
          borderTopLeftRadius: "0px",
          borderTopWidth: "1px",
        }) as CSSStyleDeclaration,
    } as unknown as LayoutView;
    expect(measurePassCards(root, square)[0]?.radius).toBeUndefined();
  });

  it("REQ-ENG-09 the radius inside a border is the border's radius less its width, never below 0", () => {
    expect(
      innerRadius({ borderTopLeftRadius: "12px", borderTopWidth: "1px" }),
    ).toBe(11);
    expect(
      innerRadius({ borderTopLeftRadius: "10px 10px", borderTopWidth: "1px" }),
    ).toBe(9);
    expect(
      innerRadius({ borderTopLeftRadius: "0px", borderTopWidth: "2px" }),
    ).toBe(0);
    expect(innerRadius({ borderTopLeftRadius: "", borderTopWidth: "" })).toBe(
      0,
    );
  });

  it("REQ-ENG-09 a card showing its still, an unknown pass, a missing mark or a screen with no size gives no card", () => {
    for (const pass of ["velocity", "glow"]) {
      placeMarks(pass, {
        "top-start": at(0, 0),
        "top-end": at(10, 0),
        "bottom-end": at(10, 10),
        "bottom-start": at(0, 10),
      });
    }
    // points shows its still: not live, so never read.
    expect(measurePassCards(root, view()).map((card) => card.pass)).toEqual([
      "velocity",
      "glow",
    ]);

    face("glow").dataset.passFace = "bloom";
    face("velocity").querySelector('[data-corner="bottom-end"]')?.remove();
    expect(measurePassCards(root, view())).toEqual([]);

    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 0,
    });
    expect(measurePassCards(root, view())).toEqual([]);
  });
});

describe("the making-of stage", () => {
  it("REQ-ENG-09 the stage is the middle card's face as the screen shows it now, in normalised device coordinates", () => {
    // A 320 by 400 face in the middle of the screen.
    place(face("velocity"), { top: 200, bottom: 600, left: 480, right: 800 });
    expect(measureMiddleStage(root, view())).toEqual({
      x: 0,
      y: 0,
      halfWidth: 0.25,
      halfHeight: 0.5,
    });

    // The row slid it up and to the left: the stage follows on the next read.
    place(face("velocity"), { top: 100, bottom: 300, left: 160, right: 480 });
    expect(measureMiddleStage(root, view())).toEqual({
      x: -0.5,
      y: 0.5,
      halfWidth: 0.25,
      halfHeight: 0.25,
    });
  });

  it("REQ-ENG-09 A14 the stage comes from the middle card alone, live or on its still, so the mark keeps its place as the row passes a still", () => {
    place(face("velocity"), { top: 200, bottom: 600, left: 480, right: 800 });
    // glow is live but not in the middle: never the stage.
    place(face("glow"), { top: 0, bottom: 800, left: 0, right: 640 });
    const stage = measureMiddleStage(root, view());
    expect(stage?.halfWidth).toBe(0.25);

    // Tier 2 shows velocity's still in the middle card.
    delete face("velocity").dataset.live;
    expect(measureMiddleStage(root, view())).toEqual(stage);
  });

  it("REQ-ENG-09 REQ-SCR-01 the stage is sent only while the face is wholly on the screen from top to bottom, so no particle waits in a card out of sight; sideways it may run off, as it does while the row glides", () => {
    const height = view().innerHeight;
    // Wholly on the screen, to the pixel, and within a pixel of rounding.
    place(face("velocity"), { top: 0, bottom: height, left: 480, right: 800 });
    expect(measureMiddleStage(root, view())).toBeDefined();
    place(face("velocity"), {
      top: -0.5,
      bottom: height + 0.5,
      left: 480,
      right: 800,
    });
    expect(measureMiddleStage(root, view())).toBeDefined();
    // Still rising from below, or scrolled away above: the flow.
    place(face("velocity"), {
      top: height - 300,
      bottom: height + 100,
      left: 480,
      right: 800,
    });
    expect(measureMiddleStage(root, view())).toBeUndefined();
    place(face("velocity"), { top: -10, bottom: 390, left: 480, right: 800 });
    expect(measureMiddleStage(root, view())).toBeUndefined();
    // Half off the screen's end mid glide: still the stage.
    place(face("velocity"), {
      top: 200,
      bottom: 600,
      left: WIDTH - 160,
      right: WIDTH + 160,
    });
    expect(measureMiddleStage(root, view())?.x).toBeCloseTo(1, 6);
  });

  it("REQ-ENG-09 REQ-A11Y-03 no middle card (the still grid, no viewer), a face with no size or a screen with no size gives no stage", () => {
    // jsdom lays nothing out: the face has no size yet.
    expect(measureMiddleStage(root, view())).toBeUndefined();

    place(face("velocity"), { top: 200, bottom: 600, left: 480, right: 800 });
    expect(measureMiddleStage(root, view())).toBeDefined();
    expect(
      measureMiddleStage(root, { ...view(), innerHeight: 0 }),
    ).toBeUndefined();
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 0,
    });
    expect(measureMiddleStage(root, view())).toBeUndefined();
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: WIDTH,
    });

    // The still grid marks no card.
    delete face("velocity").dataset.middle;
    expect(measureMiddleStage(root, view())).toBeUndefined();
    root.innerHTML = "<p>No viewer</p>";
    expect(measureMiddleStage(root, view())).toBeUndefined();
  });
});

describe("the viewer in the page's layout", () => {
  it("REQ-ENG-09 REQ-A11Y-06 the viewer's box and each live face's box, in page coordinates, with the face's corner radius", () => {
    place(root.querySelector("[data-pass-viewer]")!, {
      top: 100,
      bottom: 900,
      left: 88,
      right: 1192,
    });
    place(face("points"), { top: 124, bottom: 394, left: 100, right: 266 });
    place(face("velocity"), { top: 124, bottom: 394, left: 274, right: 440 });
    place(face("glow"), { top: 124, bottom: 394, left: 448, right: 614 });

    expect(measurePassLayout(root, view({ scrollY: 4000 }))).toEqual({
      viewer: { top: 4100, bottom: 4900, left: 88, right: 1192 },
      faces: [
        { top: 4124, bottom: 4394, left: 274, right: 440, radius: 12 },
        { top: 4124, bottom: 4394, left: 448, right: 614, radius: 12 },
      ],
    });
  });

  it("REQ-ENG-09 a page without the viewer, or one not laid out, has no viewer and no faces", () => {
    expect(measurePassLayout(root, view({ radius: "" }))).toEqual({
      viewer: null,
      faces: [],
    });
    root.innerHTML = "<p>No viewer</p>";
    expect(measurePassLayout(root, view())).toEqual({
      viewer: null,
      faces: [],
    });
  });

  it("REQ-ENG-09 the viewer counts as near from half a screen above the screen to half a screen below it", () => {
    const viewer = { top: 4100, bottom: 4900, left: 88, right: 1192 };
    expect(PASS_REACH).toBe(0.5);
    // Its top is half a screen below the screen's bottom at 2,900.
    expect(isViewerNear(viewer, 2900, HEIGHT)).toBe(false);
    expect(isViewerNear(viewer, 2901, HEIGHT)).toBe(true);
    expect(isViewerNear(viewer, 4500, HEIGHT)).toBe(true);
    // Its bottom is half a screen above the screen's top at 5,300.
    expect(isViewerNear(viewer, 5299, HEIGHT)).toBe(true);
    expect(isViewerNear(viewer, 5300, HEIGHT)).toBe(false);
    expect(isViewerNear(null, 4500, HEIGHT)).toBe(false);
    expect(isViewerNear(undefined, 4500, HEIGHT)).toBe(false);
    expect(isViewerNear(viewer, 4500, 0)).toBe(false);
  });
});

describe("samePasses", () => {
  const velocity: PassCard = {
    pass: "velocity",
    corners: [
      { x: -0.5, y: 0.75 },
      { x: -0.25, y: 0.7 },
      { x: -0.25, y: 0.1 },
      { x: -0.5, y: 0.05 },
    ],
  };

  it("REQ-ENG-09 cards that moved by less than a hair are the same cards", () => {
    const nudged: PassCard = {
      ...velocity,
      corners: [
        { x: -0.50001, y: 0.75 },
        velocity.corners[1],
        velocity.corners[2],
        velocity.corners[3],
      ],
    };
    const moved: PassCard = {
      ...velocity,
      corners: [
        { x: -0.5, y: 0.76 },
        velocity.corners[1],
        velocity.corners[2],
        velocity.corners[3],
      ],
    };
    expect(samePasses(null, null)).toBe(true);
    expect(samePasses(null, [velocity])).toBe(false);
    expect(samePasses([velocity], null)).toBe(false);
    expect(samePasses([velocity], [nudged])).toBe(true);
    expect(samePasses([velocity], [moved])).toBe(false);
    expect(samePasses([velocity], [{ ...velocity, pass: "glow" }])).toBe(false);
    expect(samePasses([velocity], [velocity, velocity])).toBe(false);
  });
});
