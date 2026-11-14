import type { ChapterId } from "@/engine/types";
import { colors } from "@/tokens/colors";

// The veil over the field is two layers. The wrapper's veil, a void layer
// across the whole field, opens to VEIL_OPEN while the story runs on a live
// tier, so a formation with nothing written over it shows its light. Behind
// every block of the page's text a soft plate of void brings the veil there
// to VEIL_TEXT (accessibility.md section 7). The plates sit in the page, so
// they scroll with the text natively, and outside header, main and footer,
// so the contrast spec, which hides those three, still sees them. A study
// frame holds no text and is where the field forms the study's shape, so no
// plate reaches into it: the frame shows the field under the open veil alone.
// The face of a making-of card the field draws a pass in is kept clear the
// same way.

/**
 * The veil behind text. 0.7 until the halftone: a full glow cell behind
 * muted text then measured 4.49 to 1, so it went to 0.75 (5.01 to 1), as the
 * P3.5 plan set for that case. The headed contrast spec then found a white
 * dot of the making-of sheet behind muted text on a phone at 0.75: 4.42 and
 * 4.31 to 1 in two runs (12 Nov 2026). A white pixel needs 0.8 (REQ-A11Y-06).
 */
export const VEIL_TEXT = 0.8;
/** The veil everywhere else while the story runs on a live tier. */
export const VEIL_OPEN = 0.35;
/**
 * A plate's own opacity: over VEIL_OPEN it makes VEIL_TEXT, since two void
 * layers let through (1 - a)(1 - b) of the field.
 */
export const PLATE_ALPHA = 1 - (1 - VEIL_TEXT) / (1 - VEIL_OPEN);
/**
 * The veil over the contact chapter's sky (D-146): open, so the real stars
 * show at their own light where no text is [T7SEN, 14 Nov 2026]. The plates
 * darken to match, so text keeps VEIL_TEXT_SKY.
 */
export const VEIL_SKY = 0;
/**
 * What text keeps behind it over the sky. More than VEIL_TEXT: the sky's
 * brightest stars are white points, brighter than any formation's cells,
 * and one under muted text read 4.47 to 1 through 0.8 at gate run 1.
 */
export const VEIL_TEXT_SKY = 0.85;
/** A plate's own opacity while the sky's veil is open: over it, VEIL_TEXT_SKY. */
export const PLATE_ALPHA_SKY = 1 - (1 - VEIL_TEXT_SKY) / (1 - VEIL_SKY);
/**
 * How long the field's veil takes to fade to a new strength, ms
 * (engine-host.tsx). Plates that lighten wait for it, so text never sits on
 * less than VEIL_TEXT while the veil closes.
 */
export const VEIL_FADE_MS = 700;

/** The open veil and the plates' own opacity for the chapter in view. */
export function veilFor(chapter: ChapterId | null): {
  veil: number;
  plate: number;
} {
  return chapter === "contact"
    ? { veil: VEIL_SKY, plate: PLATE_ALPHA_SKY }
    : { veil: VEIL_OPEN, plate: PLATE_ALPHA };
}

/**
 * The veil behind the hero's eyebrow: violet capitals at 13 px, the faintest
 * text on the page (5.08 to 1 on the void), which the hero's dot glides past
 * on a narrow screen (D-128). The dot's glow disc behind them at VEIL_TEXT
 * measured 3.86 to 1; at 0.94 it leaves about 4.8.
 */
export const VEIL_DENSE = 0.94;
/**
 * The dense plate's own opacity (globals.css, the dense plate): over the
 * page's plate, at VEIL_TEXT, it makes VEIL_DENSE.
 */
export const DENSE_ALPHA = 1 - (1 - VEIL_DENSE) / (1 - VEIL_TEXT);
/** How far the dense plate's edge fades out beyond its box, in px. */
export const DENSE_SOFT = 16;
/** Room around each line of text that its plate covers in full, in px. */
export const PLATE_PAD = 16;
/** How far a plate's edge fades out beyond that, in px. */
export const PLATE_SOFT = 80;
/**
 * How far a plate paints past its box, in px, with room to spare: its soft
 * edge is a shadow spread by PLATE_SOFT / 2 and blurred by PLATE_SOFT, which
 * paints at most PLATE_SOFT * 1.5 past the box.
 */
export const PLATE_REACH = PLATE_SOFT * 2;

/** A box on the page, in page coordinates, px. */
export type PageRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

/** A part of the page the plates keep clear, with its corner radius in px. */
export type ClearRect = PageRect & { radius: number };

function touches(a: PageRect, b: PageRect): boolean {
  return (
    a.left <= b.right &&
    b.left <= a.right &&
    a.top <= b.bottom &&
    b.top <= a.bottom
  );
}

function grown(box: PageRect, by: number): PageRect {
  return {
    top: box.top - by,
    bottom: box.bottom + by,
    left: box.left - by,
    right: box.right + by,
  };
}

/**
 * The parts of the page the plates keep clear: the study frames, where the
 * field forms each study's shape on tiers 1 and 2, and the live pass cards'
 * faces, where it draws each pass. A frame that any line of text reaches
 * into is left out, so a plate is never cut where text sits and text keeps
 * the measured veil behind it (REQ-A11Y-06).
 */
export function clearAreas(
  frames: readonly ClearRect[],
  lines: readonly PageRect[],
): ClearRect[] {
  return frames.filter((frame) => !lines.some((line) => touches(frame, line)));
}

const coordinate = (value: number) => String(Math.round(value * 10) / 10);

/** A rounded rectangle as path commands, clockwise. */
function roundedRect(box: PageRect, radius: number): string {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  const r = Number.isFinite(radius)
    ? Math.max(0, Math.min(radius, width / 2, height / 2))
    : 0;
  const [x0, x1, y0, y1] = [box.left, box.right, box.top, box.bottom].map(
    coordinate,
  );
  if (r === 0) return `M ${x0} ${y0} H ${x1} V ${y1} H ${x0} Z`;
  const arc = `A ${coordinate(r)} ${coordinate(r)} 0 0 1`;
  return [
    `M ${coordinate(box.left + r)} ${y0}`,
    `H ${coordinate(box.right - r)}`,
    `${arc} ${x1} ${coordinate(box.top + r)}`,
    `V ${coordinate(box.bottom - r)}`,
    `${arc} ${coordinate(box.right - r)} ${y1}`,
    `H ${coordinate(box.left + r)}`,
    `${arc} ${x0} ${coordinate(box.bottom - r)}`,
    `V ${coordinate(box.top + r)}`,
    `${arc} ${coordinate(box.left + r)} ${y0}`,
    "Z",
  ].join(" ");
}

/**
 * The clip that keeps a plate and its soft edge out of the clear parts of
 * the page: an even-odd path over everything the plate paints, with a hole
 * for each clear part that its edge reaches, in the plate's own coordinates.
 * Null when none reaches it. The hole follows the frame's own corners, so
 * the field inside the frame is open right up to its rounded border.
 */
export function plateClip(
  plate: PageRect,
  clear: readonly ClearRect[],
): string | null {
  const reach = grown(plate, PLATE_REACH);
  const holes = clear.filter((area) => touches(area, reach));
  if (holes.length === 0) return null;
  const local = (box: PageRect): PageRect => ({
    top: box.top - plate.top,
    bottom: box.bottom - plate.top,
    left: box.left - plate.left,
    right: box.right - plate.left,
  });
  const paths = [
    roundedRect(local(reach), 0),
    ...holes.map((hole) => roundedRect(local(hole), hole.radius)),
  ];
  return `path(evenodd, "${paths.join(" ")}")`;
}

/**
 * The plates for the page's lines of text: each line grown by PLATE_PAD,
 * then lines that touch merged into one block, until no two blocks touch.
 * A plate is a positioned box, so one that reached past the page's sides
 * would make the page scroll sideways; each is kept within 0 and pageWidth
 * and below the page's top. Their soft edges are shadows, which never
 * extend the page.
 */
export function plates(
  lines: readonly PageRect[],
  pageWidth = Number.POSITIVE_INFINITY,
): PageRect[] {
  let blocks = lines.map((line) => ({
    top: Math.max(line.top - PLATE_PAD, 0),
    bottom: line.bottom + PLATE_PAD,
    left: Math.max(line.left - PLATE_PAD, 0),
    right: Math.min(line.right + PLATE_PAD, pageWidth),
  }));
  let merged = true;
  while (merged) {
    merged = false;
    const next: PageRect[] = [];
    for (const block of blocks) {
      const into = next.find((other) => touches(other, block));
      if (into === undefined) {
        next.push({ ...block });
        continue;
      }
      into.top = Math.min(into.top, block.top);
      into.bottom = Math.max(into.bottom, block.bottom);
      into.left = Math.min(into.left, block.left);
      into.right = Math.max(into.right, block.right);
      merged = true;
    }
    blocks = next;
  }
  return blocks;
}

/**
 * The plate colour: the void token at the plate layer's --plate-alpha, which
 * the story sets for the chapter in view (veilFor), PLATE_ALPHA without it.
 */
export function plateColour(): string {
  const hex = colors.void.slice(1);
  const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16);
  return `rgb(${channel(0)} ${channel(2)} ${channel(4)} / var(--plate-alpha, ${PLATE_ALPHA.toFixed(4)}))`;
}
