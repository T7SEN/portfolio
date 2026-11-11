import { colors } from "@/tokens/colors";

// The veil over the field is two layers. The wrapper's veil, a void layer
// across the whole field, opens to VEIL_OPEN while the story runs on a live
// tier, so a formation with nothing written over it shows its light. Behind
// every block of the page's text a soft plate of void brings the veil there
// back to VEIL_TEXT, the 0.7 the contrast runs measured (accessibility.md
// section 7). The plates sit in the page, so they scroll with the text
// natively, and outside header, main and footer, so the contrast spec, which
// hides those three, still sees them.

/** The veil behind text: the measured 0.7. */
export const VEIL_TEXT = 0.7;
/** The veil everywhere else while the story runs on a live tier. */
export const VEIL_OPEN = 0.35;
/**
 * A plate's own opacity: over VEIL_OPEN it makes VEIL_TEXT, since two void
 * layers let through (1 - a)(1 - b) of the field.
 */
export const PLATE_ALPHA = 1 - (1 - VEIL_TEXT) / (1 - VEIL_OPEN);
/** Room around each line of text that its plate covers in full, in px. */
export const PLATE_PAD = 16;
/** How far a plate's edge fades out beyond that, in px. */
export const PLATE_SOFT = 80;

/** A box on the page, in page coordinates, px. */
export type PageRect = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

function touches(a: PageRect, b: PageRect): boolean {
  return (
    a.left <= b.right &&
    b.left <= a.right &&
    a.top <= b.bottom &&
    b.top <= a.bottom
  );
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

/** The plate colour: the void token at PLATE_ALPHA. */
export function plateColour(): string {
  const hex = colors.void.slice(1);
  const channel = (index: number) => parseInt(hex.slice(index, index + 2), 16);
  return `rgb(${channel(0)} ${channel(2)} ${channel(4)} / ${PLATE_ALPHA.toFixed(4)})`;
}
