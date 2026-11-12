import type { ShapeId } from "../../story";
import { arc, roundedRect, turn } from "./draw";
import type { Layer, Ring } from "./draw";

/**
 * The T7SEN wordmark, set in Unbounded Bold: the static
 * fonts/ttf/Unbounded-Bold.ttf of https://github.com/googlefonts/unbounded,
 * Copyright 2022 The Unbounded Project Authors, under the SIL Open Font
 * License 1.1. The font file is not in this repository. A one-off script
 * with no dependencies read its cmap, head, hhea, hmtx, loca and glyf tables
 * and its GPOS pair kerning (T to 7 is +5; the font has no kern table), set
 * the five letters with their advances and the field preview's 0.02 em
 * tracking, flattened the quadratic curves and dropped every point that
 * moved the outline by less than 0.25% of the word's width: 2.3 px where a
 * 1440 px screen draws the word, under a third of a halftone cell. Font
 * units (1,000 to the em), y down, one ring a letter; no letter of T7SEN
 * has a counter.
 */
const WORDMARK: Ring[] = [
  [0, 16, 780, 16, 780, 200, 494, 200, 494, 766, 286, 766, 286, 200, 0, 200],
  [947, 766, 1323, 180, 837, 180, 837, 16, 1549, 16, 1549, 181, 1184, 766],
  [
    1633, 520, 1844, 520, 1892, 589, 1998, 621, 2133, 610, 2195, 562, 2191, 519,
    2156, 493, 1821, 445, 1740, 413, 1683, 366, 1644, 282, 1649, 181, 1693, 103,
    1774, 44, 1940, 3, 2134, 12, 2278, 70, 2365, 166, 2386, 247, 2176, 247,
    2130, 186, 2021, 160, 1899, 175, 1852, 224, 1861, 262, 1894, 284, 2238, 332,
    2318, 362, 2372, 407, 2404, 489, 2394, 595, 2343, 676, 2258, 736, 2164, 768,
    2057, 781, 1833, 753, 1748, 712, 1686, 658, 1648, 594,
  ],
  [
    3171, 316, 3171, 466, 2751, 466, 2729, 598, 3204, 598, 3204, 766, 2507, 766,
    2564, 391, 2507, 16, 3199, 16, 3199, 184, 2729, 184, 2751, 316,
  ],
  [
    3915, 766, 3545, 239, 3545, 766, 3344, 766, 3344, 16, 3612, 16, 3975, 531,
    3975, 16, 4176, 16, 4176, 766,
  ],
];

const DEGREE = Math.PI / 180;

// The three study shapes come from the home preview's study frames, where
// each is drawn in CSS, not SVG: the sizes, offsets, corners and turns are
// the preview's, in its CSS pixels, and the layers keep its paint order. The
// layer in front, drawn there in the full accent with a glow, weighs 1. The
// sheets and cards behind it weigh their borders' share of the accent there
// (45 to 75 per cent). The preview draws each as a dotted border round a
// fainter dotted fill, so every layer has an outline (edge) and the ones
// behind a sparse fill, which the layers in front hide (shapes/index.ts).
// The front layer's fill sets the light (atlas.ts, fillArea), so it lands
// on the glow tone and only its outline and the crossings reach white.

/** A layer behind the front: a faint fill inside its dotted outline. */
const BACK_FILL = 0.3;
/** Every layer's outline, as the preview's 2 px dotted borders. */
const OUTLINE = 2;

/**
 * The preview's perspective for the making-of sheets: perspective(900px)
 * rotateY(-26deg) rotateX(8deg) about the centre of a 420 by 300 box.
 */
function seen(ring: Ring): Ring {
  const out: Ring = [];
  const tiltX = 8 * DEGREE;
  const tiltY = -26 * DEGREE;
  for (let index = 0; index < ring.length; index += 2) {
    const x = (ring[index] ?? 0) - 210;
    const y = (ring[index + 1] ?? 0) - 150;
    const turnedY = y * Math.cos(tiltX);
    const depthX = y * Math.sin(tiltX);
    const turnedX = x * Math.cos(tiltY) + depthX * Math.sin(tiltY);
    const depth = -x * Math.sin(tiltY) + depthX * Math.cos(tiltY);
    const w = 1 - depth / 900;
    out.push(turnedX / w, turnedY / w);
  }
  return out;
}

/** The making-of: four layered sheets stepping back, the front one at the top end. */
function sheets(): Layer[] {
  const weights = [0.45, 0.6, 0.75, 1];
  return weights.map((weight, index) => ({
    weight,
    fill: weight === 1 ? 1 : BACK_FILL,
    edge: OUTLINE,
    rings: [seen(roundedRect(46 * index, 120 - 36 * index, 260, 170, 10))],
  }));
}

/**
 * Coup Online: five cards fanned from one point below them (the preview's
 * transform origin, 50% 150%), the middle one the brightest.
 */
function cards(): Layer[] {
  const card = roundedRect(150, 50, 120, 170, 14);
  return [
    [-30, 0.55],
    [-15, 0.7],
    [0, 1],
    [15, 0.7],
    [30, 0.55],
  ].map(([degrees = 0, weight = 1]) => ({
    weight,
    fill: weight === 1 ? 1 : BACK_FILL,
    edge: OUTLINE,
    rings: [turn(card, degrees, 210, 305)],
  }));
}

/** Half the preview's 14 px line, so a line reads as one row of dots. */
const LINE_HEIGHT = 7;
/** A line is thinner than a halftone cell, so it is filled denser. */
const LINE_FILL = 2;

/**
 * ArcheLab: a chat bubble with its tail at the start side, three lines in
 * front. The preview draws the lines as rows of dots, the first in the
 * accent, the second in the text colour, the third between the two; here
 * each is half the preview's 14 px, so it reads as one row of dots, and
 * each is its own layer: the second in front, so only its rim turns white,
 * the third a step behind, part white, and the first further, in the
 * accent (halftone-rules.ts, RIM_FRONT_FROM).
 */
function bubble(): Layer[] {
  // A 400 by 190 bubble with 28 px corners. The tail is a 40 px square
  // turned 45 degrees about (48, 188); below the bubble it shows as a point
  // whose start side meets the bottom start corner at 105 degrees.
  const outline: Ring = [];
  arc(28, 28, 28, 180, 270, outline);
  arc(372, 28, 28, 270, 360, outline);
  arc(372, 162, 28, 0, 90, outline);
  const tip = 188 + 20 * Math.SQRT2;
  outline.push(48 + (tip - 190), 190, 48, tip);
  arc(28, 162, 28, 105, 180, outline);

  // The lines sit inside the bubble's 2 px border and 40 by 36 px padding,
  // centred where the preview's 14 px lines are.
  const line = (middle: number, width: number) =>
    roundedRect(38, middle - LINE_HEIGHT / 2, width, LINE_HEIGHT, 3.5);

  return [
    { weight: 0.7, fill: 0.3, edge: 1.6, rings: [outline] },
    { weight: 0.86, fill: LINE_FILL, rings: [line(49, 280)] },
    { weight: 1, fill: LINE_FILL, rings: [line(81, 210)] },
    { weight: 0.9, fill: LINE_FILL, rings: [line(113, 150)] },
  ];
}

/**
 * Every shape the field forms, one entry per id: its layers, each with its
 * weight, 1 for the layer in front. A layer's rings are in any units with y
 * down, filled by the even-odd rule, so a ring inside another of the same
 * layer cuts a hole; all the layers of one shape share one coordinate space.
 * The sampler fits any size to the frame and needs no change when an entry
 * does.
 */
export const MARKS: Record<ShapeId, Layer[]> = {
  // The single polygon of public/brand/t7sen-purple.svg, as written there.
  logo: [
    {
      weight: 1,
      rings: [
        [
          464.22, 0, 464.22, 7.43, 411.18, 73.13, 186.22, 351.77, 113.09,
          442.36, 113.09, 325.94, 186.22, 235.35, 317.19, 73.13, 186.22, 73.13,
          186.22, 164.38, 113.09, 254.97, 113.09, 73.13, 0, 73.13, 0, 0, 464.22,
          0,
        ],
      ],
    },
  ],
  wordmark: [{ weight: 1, rings: WORDMARK }],
  "making-of": sheets(),
  "coup-online": cards(),
  archelab: bubble(),
};
