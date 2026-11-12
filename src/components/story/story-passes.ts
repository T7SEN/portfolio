import { PASSES, type PassId } from "@/engine/story";
import type { PassCard, Point } from "@/engine/types";

import { FACE_CORNERS, type FaceCorner } from "./pass-face";
import { hasArea, pageRect, type LayoutView } from "./story-stage";
import type { ClearRect, PageRect } from "./story-veil";

// The making-of pass viewer as the field needs it (REQ-ENG-09). A card whose
// pass the field draws live is a window with no fill, its face marked
// data-live (pass-face.ts); the field draws the pass inside the four corners
// of that face. Every other card shows a still of its pass, so the field has
// nothing to draw there.

/** The viewer and its live faces, in page coordinates, from the layout. */
export type PassLayout = {
  /** The whole viewer's box; null when the page has none. */
  viewer: PageRect | null;
  /** Each live face's box, with its corner radius: the plates keep clear of it. */
  faces: ClearRect[];
};

/**
 * How far past the screen's top and bottom the viewer still counts as near,
 * in screen heights: near enough that its cards are measured on every scroll
 * frame, so the passes are in place before the cards reach the screen.
 */
export const PASS_REACH = 0.5;

const PASS_IDS: ReadonlySet<string> = new Set<string>(PASSES);

function isPassId(value: string | undefined): value is PassId {
  return value !== undefined && PASS_IDS.has(value);
}

/**
 * The marks to read for a card's corners in the order the engine takes them:
 * top left, top right, bottom right, bottom left of the face as it stands
 * unturned. The marks are named by reading direction, so on a right to left
 * page the face's left corners are its end corners.
 */
export function cornerOrder(isRtl: boolean): readonly FaceCorner[] {
  const [topStart, topEnd, bottomEnd, bottomStart] = FACE_CORNERS;
  return isRtl ? [topEnd, topStart, bottomStart, bottomEnd] : FACE_CORNERS;
}

/**
 * A point on the screen, in CSS pixels from its top left corner, in
 * normalised device coordinates: -1 to 1 on both axes, y up.
 */
export function screenPoint(
  x: number,
  y: number,
  width: number,
  height: number,
): Point {
  return { x: (2 * x) / width - 1, y: 1 - (2 * y) / height };
}

function liveFaces(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("[data-pass-face][data-live]")];
}

/**
 * The viewer's box and the live faces' boxes, read with the rest of the
 * layout. A turned face's box is the box round it as the screen draws it.
 */
export function measurePassLayout(
  root: ParentNode,
  view: LayoutView,
): PassLayout {
  const element = root.querySelector("[data-pass-viewer]");
  const box = element === null ? null : pageRect(element, view);
  const faces = liveFaces(root).flatMap((face) => {
    const faceBox = pageRect(face, view);
    if (!hasArea(faceBox)) return [];
    const radius = Number.parseFloat(
      view.getComputedStyle(face).borderTopLeftRadius,
    );
    return [{ ...faceBox, radius: Number.isFinite(radius) ? radius : 0 }];
  });
  return { viewer: box !== null && hasArea(box) ? box : null, faces };
}

/**
 * The radius of a face's corners inside its border, in CSS pixels: where the
 * marks sit and the face clips its contents. The face's corners share one
 * radius; 0 when it has none or it cannot be read.
 */
export function innerRadius(
  style: Pick<CSSStyleDeclaration, "borderTopLeftRadius" | "borderTopWidth">,
): number {
  const radius = Number.parseFloat(style.borderTopLeftRadius);
  const border = Number.parseFloat(style.borderTopWidth);
  const inner =
    (Number.isFinite(radius) ? radius : 0) -
    (Number.isFinite(border) ? border : 0);
  return Math.max(inner, 0);
}

/**
 * Every live card as the screen shows it now: its pass, the four corners of
 * its face, read from the marks in them, the face's own size inside its
 * border, which no turn changes, and its corner radius there. Read on every
 * scroll frame while the viewer is near, since a card's face can change
 * without a new layout (its turn, a border). A card whose pass or corners
 * cannot be read is left out, and a screen with no size gives none.
 */
export function measurePassCards(
  root: ParentNode,
  view: Pick<LayoutView, "innerHeight" | "getComputedStyle"> & {
    document: Pick<Document, "documentElement">;
  },
): PassCard[] {
  const width = view.document.documentElement.clientWidth;
  const height = view.innerHeight;
  if (!(width > 0) || !(height > 0)) return [];
  return liveFaces(root).flatMap((face) => {
    const pass = face.dataset.passFace;
    if (!isPassId(pass)) return [];
    const style = view.getComputedStyle(face);
    const isRtl = style.direction === "rtl";
    const [a, b, c, d] = cornerOrder(isRtl).map((corner) => {
      const mark = face.querySelector(`[data-corner="${corner}"]`);
      if (mark === null) return null;
      const rect = mark.getBoundingClientRect();
      return screenPoint(
        (rect.left + rect.right) / 2,
        (rect.top + rect.bottom) / 2,
        width,
        height,
      );
    });
    if (!a || !b || !c || !d) return [];
    // The marks sit in the corners of the face's box inside its border.
    const own = { width: face.clientWidth, height: face.clientHeight };
    const radius = innerRadius(style);
    return [
      {
        pass,
        corners: [a, b, c, d] as const,
        ...(own.width > 0 && own.height > 0 ? { size: own } : {}),
        ...(radius > 0 ? { radius } : {}),
      },
    ];
  });
}

/** Whether the viewer is on the screen or within PASS_REACH of it. */
export function isViewerNear(
  viewer: PageRect | null | undefined,
  position: number,
  height: number,
): boolean {
  if (viewer === null || viewer === undefined || !(height > 0)) return false;
  const reach = height * PASS_REACH;
  return (
    viewer.top < position + height + reach && viewer.bottom > position - reach
  );
}

// Smaller moves than this are the same place: a ten-thousandth of the half
// screen is far under a pixel.
const CORNER_EPSILON = 1e-4;

/** Whether two sets of cards give the field the same windows. */
export function samePasses(
  a: readonly PassCard[] | null,
  b: readonly PassCard[] | null,
): boolean {
  if (a === null || b === null) return a === b;
  if (a.length !== b.length) return false;
  return a.every((card, index) => {
    const other = b[index];
    if (other === undefined || other.pass !== card.pass) return false;
    return card.corners.every((corner, place) => {
      const match = other.corners[place];
      return (
        match !== undefined &&
        Math.abs(corner.x - match.x) <= CORNER_EPSILON &&
        Math.abs(corner.y - match.y) <= CORNER_EPSILON
      );
    });
  });
}
