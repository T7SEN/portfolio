// The chapters' choreography as numbers: which targets the field is pulled
// to, how strongly, and where the camera sits, for a chapter and how far
// through it the page is; and the ambient flow lines, the about strands and
// the contact rings the simulation draws. No three.js here, so it is unit
// tested in Node; the runtime turns these numbers into uniforms, and
// simulation.ts mirrors the per-particle rules below in TSL.

import { WORK_SHAPES, workStep, type ShapeId } from "../story";
import type { ChapterId, Stage, Stages } from "../types";

export interface StoryTargets {
  /**
   * How far the hero's dot has let the field go: 0 keeps every particle
   * parked in the dot, 1 sends every one to the field. Particles go in
   * order of how far their home is from the dot, so the field blooms
   * outward.
   */
  release: number;
  /** The two sampled shapes a formation morphs between. */
  shapeFrom: ShapeId;
  shapeTo: ShapeId;
  /** 0 is shapeFrom, 1 is shapeTo. */
  shapeMix: number;
  /**
   * Weights of the four formations: a sampled shape, the making-of sheet,
   * the about strands and the contact rings. What they leave goes to the
   * ambient field, and at most one of them is above 0.
   */
  shape: number;
  sheet: number;
  strands: number;
  rings: number;
  /**
   * The share of the flow lines' particles that keep streaming while a
   * formation holds, so the lines still run round it. Only lines that may
   * keep (FLOW_LINES, keeps) are held back.
   */
  keep: number;
  /** Multiplies the noise drift of the particles that are released. */
  noise: number;
  /** 0 to 1: how far the camera has pushed into the field. */
  push: number;
}

/** The ambient field: every particle at large, no formation. */
export const AMBIENT: StoryTargets = {
  release: 1,
  shapeFrom: "logo",
  shapeTo: "logo",
  shapeMix: 0,
  shape: 0,
  sheet: 0,
  strands: 0,
  rings: 0,
  keep: 0,
  noise: 1,
  push: 0,
};

// Bloom (REQ-SCR-07): the dot lets the field go, the field gathers into the
// T7 mark, the mark morphs into the T7SEN wordmark, the wordmark holds and
// then dissolves back into the flow.
const BLOOM_RELEASED = 0.3;
const MARK_GATHERED = 0.42;
const MORPH_FROM = 0.5;
const MORPH_TO = 0.64;
const WORDMARK_HOLDS_UNTIL = 0.84;
const WORDMARK_GONE = 0.97;
/** While the wordmark forms, this share of the lines keeps running round it. */
export const BLOOM_KEEP = 0.5;
// Making-of and about: the formation takes the first quarter to gather and
// lets go from 0.85, so the next chapter starts from the flow. Contact
// gathers its rings the same way and keeps them to the end of the page.
const FORM_IN = 0.25;
const FORM_OUT = 0.85;
// Work: a shape is whole across the middle half of its step. Between two
// steps the field keeps this share of the formation while one shape morphs
// into the next, so the move reads as one shape turning into another.
const STEP_EDGE = 0.25;
const STEP_DIP = 0.55;
// The contact field rests: its drift is gentler than the ambient flow's.
const CONTACT_NOISE = 0.6;

/** The calm frame of a bloom: the wordmark, whole, with the lines round it. */
const BLOOM_CALM = 0.74;

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** 0 at edge0, 1 at edge1, eased; the GLSL and WGSL smoothstep. */
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = unit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** x minus its floor: the GLSL and WGSL fract, 0 to 1 for any sign. */
export function fract(value: number): number {
  return value - Math.floor(value);
}

function shapeAt(index: number): ShapeId {
  const last = WORK_SHAPES.length - 1;
  return WORK_SHAPES[Math.min(Math.max(index, 0), last)] ?? "making-of";
}

function bloom(progress: number): StoryTargets {
  const morph = smoothstep(MORPH_FROM, MORPH_TO, progress);
  return {
    ...AMBIENT,
    release: smoothstep(0, BLOOM_RELEASED, progress),
    shapeFrom: "logo",
    shapeTo: "wordmark",
    shapeMix: morph,
    shape:
      smoothstep(BLOOM_RELEASED, MARK_GATHERED, progress) *
      (1 - smoothstep(WORDMARK_HOLDS_UNTIL, WORDMARK_GONE, progress)),
    // The mark takes the whole flow; as it turns into the wordmark, part of
    // the lines go back to running round it.
    keep: BLOOM_KEEP * morph,
  };
}

function work(progress: number): StoryTargets {
  const { index, local } = workStep(progress);
  const last = WORK_SHAPES.length - 1;
  const rise = smoothstep(0, STEP_EDGE, local);
  const fall = 1 - smoothstep(1 - STEP_EDGE, 1, local);

  // The first half of a step finishes the morph from the shape before; the
  // second half starts the morph to the next one. Both halves meet halfway
  // through the morph at each step's edge, so nothing jumps there.
  const firstHalf = local < 0.5;
  const shapeFrom = shapeAt(firstHalf ? index - 1 : index);
  const shapeTo = shapeAt(firstHalf ? index : index + 1);
  let shapeMix: number;
  if (firstHalf) shapeMix = index === 0 ? 1 : 0.5 + 0.5 * rise;
  else shapeMix = index === last ? 0 : 0.5 * (1 - fall);

  // The chapter's own edges let the field go completely; the edges between
  // two studies only loosen it.
  let shape: number;
  if (firstHalf && index === 0) shape = rise;
  else if (!firstHalf && index === last) shape = fall;
  else shape = STEP_DIP + (1 - STEP_DIP) * (firstHalf ? rise : fall);

  return {
    ...AMBIENT,
    shapeFrom,
    shapeTo,
    shapeMix,
    shape,
    push: unit(progress),
  };
}

function formation(progress: number): number {
  return (
    smoothstep(0, FORM_IN, progress) * (1 - smoothstep(FORM_OUT, 1, progress))
  );
}

/**
 * The targets for a chapter at a progress from 0 to 1 through its section.
 * Progress outside 0 to 1, or not a number, is clamped.
 */
export function chapterTargets(
  chapter: ChapterId,
  progress: number,
): StoryTargets {
  const at = unit(progress);
  switch (chapter) {
    case "hero":
      return { ...AMBIENT, release: 0 };
    case "bloom":
      return bloom(at);
    case "work":
      return work(at);
    case "making-of":
      return { ...AMBIENT, sheet: formation(at) };
    case "about":
      return { ...AMBIENT, strands: formation(at) };
    case "contact":
      return {
        ...AMBIENT,
        rings: smoothstep(0, FORM_IN, at),
        noise: CONTACT_NOISE,
      };
  }
}

/**
 * Calm mode shows one still frame per chapter, and one per study in the
 * work chapter (REQ-A11Y-03). The frame is the chapter at its fullest, not
 * wherever the scroll happened to be when it began: the dot, the whole
 * wordmark, each study's shape whole, the sheet, the strands, the rings.
 */
export function calmProgress(chapter: ChapterId, progress: number): number {
  switch (chapter) {
    case "hero":
      return 0;
    case "bloom":
      return BLOOM_CALM;
    case "work": {
      const { index } = workStep(progress);
      return (index + 0.5) / WORK_SHAPES.length;
    }
    default:
      return 0.5;
  }
}

/**
 * Names the still a calm field shows for a chapter and progress. A calm
 * field is settled and drawn again only when this changes: a new chapter,
 * or a new study in the work chapter, never a scroll inside one.
 */
export function calmKey(chapter: ChapterId, progress: number): string {
  if (chapter !== "work") return chapter;
  return `work:${workStep(progress).index}`;
}

export interface ShapeExtent {
  /** Half the shape's width and height, in the sample space of -1 to 1. */
  halfWidth: number;
  halfHeight: number;
  /** The area the shape fills, in the same space (the square is 4). */
  area: number;
  /**
   * The area the shape's points would cover if they were all spread at the
   * density of a front layer's fill, in the same space. It sets the light,
   * so the front layer's fill lands on the glow tone whatever the layers
   * behind it, their outlines and their overlaps add (atlas.ts). Without
   * it, the area does.
   */
  fillArea?: number;
}

/** The area a shape's light is set by: its front layer's fill, else its area. */
export function lightArea(extent: ShapeExtent): number {
  return extent.fillArea ?? extent.area;
}

export interface Frame {
  /** Half the frame at the camera's focus plane, in world units. */
  halfWidth: number;
  halfHeight: number;
}

/** Formed shapes keep this share of their stage's half width and height. */
export const SHAPE_FIT = 0.8;
/** The making-of sheet is the frame's own shape at this share of it. */
export const SHEET_FIT = 0.7;

/**
 * World units per unit of sample space, so the shape's box fits inside
 * SHAPE_FIT of the frame on both axes, whatever the frame's aspect.
 */
export function fitScale(extent: ShapeExtent, frame: Frame): number {
  const width = Math.max(extent.halfWidth, 1e-3);
  const height = Math.max(extent.halfHeight, 1e-3);
  return Math.min(
    (frame.halfWidth * SHAPE_FIT) / width,
    (frame.halfHeight * SHAPE_FIT) / height,
  );
}

/** The shorter half of a frame: lines, strands and rings scale with it. */
export function shortHalf(frame: Frame): number {
  return Math.min(frame.halfWidth, frame.halfHeight);
}

// The ambient flow (phase P3.5): most particles stream along a few dotted
// lines that drift, the rest keep noise homes as a sparse backdrop. One line
// closes into a loose ellipse round the formation in the field chapter.

/** The share of all particles on the flow lines; the rest is the backdrop. */
export const FLOW_SHARE = 0.8;
/**
 * Every speed and drift of the flow repeats in this many seconds, so the
 * flow clock wraps at it without a seam and stays small enough for the
 * GPU's single precision.
 */
export const FLOW_PERIOD = 1200;
/** The flow clock runs only once the bloom's release has reached this. */
export const FLOW_RELEASE_DONE = 0.995;
/**
 * The lines take their particles over from the noise homes as the release
 * passes from here to FLOW_RELEASE_DONE, so the bloom still grows outward
 * from the dot by home distance.
 */
export const FLOW_FROM = 0.9;
/** Open lines run this far past each side of the frame, as a share of the half width. */
export const FLOW_REACH = 1.3;
/** Half the width of a line, as a share of the frame's shorter half. */
export const FLOW_WIDTH = 0.02;
/** How deep the open lines spread around the focus plane, in world units. */
export const FLOW_DEPTH = 0.25;

export interface FlowWave {
  amplitude: number;
  /** Radians per unit of frame width. */
  frequency: number;
  phase: number;
  /** Whole drift cycles per FLOW_PERIOD; the sign gives the direction. */
  drift: number;
}

export interface FlowLine {
  /** Closed: the ellipse round the formation. Open: a line across the frame. */
  closed: boolean;
  /** The share of the flow's particles on this line. */
  share: number;
  /** 1 when the line may keep its particles while a formation holds. */
  keeps: number;
  /** The line's light for the halftone: 1 the brightest. */
  light: number;
  /**
   * Whole passes along the line (or turns round the ellipse) per
   * FLOW_PERIOD; the sign gives the direction.
   */
  passes: number;
  /** An open line's height, as a share of the half height, y up. */
  centre: number;
  /**
   * An open line's two waves, on top of its centre. The ellipse uses the
   * first as the wobble of its radius, its frequency per turn.
   */
  waves: readonly [FlowWave, FlowWave];
}

/**
 * The lines, the ellipse first. Shares add up to 1. Their heights and
 * lights follow the home preview's field drawing: the brightest open line
 * low, one high, two near the edges, all clear of the wordmark's band.
 */
export const FLOW_LINES: readonly FlowLine[] = [
  {
    closed: true,
    share: 0.2,
    keeps: 1,
    light: 0.9,
    passes: 12,
    centre: 0,
    waves: [
      { amplitude: 0.06, frequency: 3, phase: 0, drift: 5 },
      { amplitude: 0, frequency: 0, phase: 0, drift: 0 },
    ],
  },
  {
    closed: false,
    share: 0.2,
    keeps: 1,
    light: 0.8,
    passes: 30,
    centre: -0.42,
    waves: [
      { amplitude: 0.14, frequency: 2.2, phase: 0.6, drift: 4 },
      { amplitude: 0.04, frequency: 5.1, phase: 1.7, drift: -6 },
    ],
  },
  {
    closed: false,
    share: 0.16,
    keeps: 1,
    light: 0.6,
    passes: -24,
    centre: 0.42,
    waves: [
      { amplitude: 0.14, frequency: 1.9, phase: -0.9, drift: 5 },
      { amplitude: 0.04, frequency: 4.3, phase: 0.4, drift: 7 },
    ],
  },
  {
    closed: false,
    share: 0.12,
    keeps: 1,
    light: 0.35,
    passes: 18,
    centre: 0.78,
    waves: [
      { amplitude: 0.08, frequency: 1.6, phase: 2.1, drift: -3 },
      { amplitude: 0.03, frequency: 3.7, phase: 0.2, drift: 4 },
    ],
  },
  {
    closed: false,
    share: 0.12,
    keeps: 1,
    light: 0.4,
    passes: -18,
    centre: -0.7,
    waves: [
      { amplitude: 0.1, frequency: 1.4, phase: 0.4, drift: 3 },
      { amplitude: 0.03, frequency: 4.1, phase: 2.5, drift: -5 },
    ],
  },
  // Through the middle of the frame: it joins every formation, so it never
  // runs across the wordmark.
  {
    closed: false,
    share: 0.2,
    keeps: 0,
    light: 0.5,
    passes: 36,
    centre: 0.02,
    waves: [
      { amplitude: 0.12, frequency: 2.6, phase: 2.8, drift: -4 },
      { amplitude: 0.04, frequency: 5.5, phase: 1.1, drift: 6 },
    ],
  },
];

/** The ellipse's half width as a share of the frame's half width. */
export const ORBIT_WIDTH = 0.75;
/**
 * On a narrow frame the wordmark takes nearly the whole width
 * (NARROW_BLOOM_STAGE), so the ellipse is wider there to close round it.
 */
export const ORBIT_WIDTH_NARROW = 0.92;
/** Its half height as a share of the half height, and at most this share of its half width. */
export const ORBIT_HEIGHT = 0.44;
export const ORBIT_ASPECT = 0.42;

/**
 * Width over height under which a frame counts as narrow: a phone held
 * upright, never a tablet's portrait (768 by 1024 is 0.75).
 */
export const NARROW_ASPECT = 0.7;

/** True for a frame narrower than NARROW_ASPECT. */
export function isNarrow(frame: Frame): boolean {
  return frame.halfWidth / Math.max(frame.halfHeight, 1e-6) < NARROW_ASPECT;
}

/** The ellipse's half axes in world units for a frame. */
export function orbitAxes(frame: Frame): { a: number; b: number } {
  const a =
    (isNarrow(frame) ? ORBIT_WIDTH_NARROW : ORBIT_WIDTH) * frame.halfWidth;
  return { a, b: Math.min(ORBIT_HEIGHT * frame.halfHeight, ORBIT_ASPECT * a) };
}

/**
 * Each particle's own random numbers, from its seed: the fract of a mix of
 * its three seed values. The mixes are far apart, so the numbers are close
 * to even from 0 to 1 and to independent of each other and of the seed's
 * place. simulation.ts uses the same mixes.
 */
export const TRAITS = {
  /** Flow line or backdrop, and which line, strand or ring. */
  pick: [37.31, 91.17, 13.73],
  /** Where along its line, strand or ring. */
  along: [53.93, 11.07, 17.29],
  /** Two halves of the offset across a line, added for a peaked spread. */
  acrossA: [3.17, 71.37, 29.11],
  acrossB: [19.73, 43.97, 5.83],
  /** Whether it is one of the particles a line keeps through a formation. */
  keep: [7.93, 23.31, 61.71],
} as const;

export function trait(
  mixes: readonly [number, number, number],
  seedX: number,
  seedY: number,
  seedZ: number,
): number {
  return fract(seedX * mixes[0] + seedY * mixes[1] + seedZ * mixes[2]);
}

/** The cumulative starts of a list of shares, for choosing by one number. */
export function shareStarts(shares: readonly number[]): number[] {
  const starts: number[] = [];
  let sum = 0;
  for (const share of shares) {
    starts.push(sum);
    sum += share;
  }
  return starts;
}

/** Which of the shares one number from 0 to 1 falls in. */
export function chooseShare(starts: readonly number[], value: number): number {
  let index = 0;
  for (let at = 1; at < starts.length; at += 1) {
    if (value >= (starts[at] ?? 1)) index = at;
  }
  return index;
}

/** The flow line a particle's pick puts it on, or -1 for the backdrop. */
export function flowLineOf(pick: number): number {
  if (!(pick < FLOW_SHARE)) return -1;
  return chooseShare(
    shareStarts(FLOW_LINES.map((line) => line.share)),
    pick / FLOW_SHARE,
  );
}

/** How far along its line a particle is at a flow clock, 0 to 1. */
export function flowAlong(along: number, passes: number, clock: number) {
  return fract(along + (clock * passes) / FLOW_PERIOD);
}

/**
 * True when the particle's place on an open line went past the end and
 * came back in at the start during the last step. It is worked out from
 * the particle's own numbers only, so the runtime can put that particle,
 * and no other, straight onto the start.
 */
export function flowWrapped(
  along: number,
  passes: number,
  clock: number,
  delta: number,
): boolean {
  return (
    Math.abs(
      flowAlong(along, passes, clock) - flowAlong(along, passes, clock - delta),
    ) > 0.5
  );
}

/** Radians a drift has turned at a flow clock. */
function drifted(wave: FlowWave, clock: number): number {
  return (2 * Math.PI * wave.drift * clock) / FLOW_PERIOD;
}

/**
 * A point of an open line in frame units (the frame is -1 to 1 on both
 * axes, y up) at a place t from 0 to 1 along it.
 */
export function openLinePoint(
  line: FlowLine,
  t: number,
  clock: number,
): { x: number; y: number } {
  const x = (2 * t - 1) * FLOW_REACH;
  let y = line.centre;
  for (const wave of line.waves) {
    y +=
      wave.amplitude *
      Math.sin(wave.frequency * x + wave.phase + drifted(wave, clock));
  }
  return { x, y };
}

/**
 * A point of the ellipse in world units around its centre, at a place t
 * from 0 to 1 round it.
 */
export function orbitPoint(
  line: FlowLine,
  t: number,
  clock: number,
  frame: Frame,
): { x: number; y: number } {
  const { a, b } = orbitAxes(frame);
  const angle = 2 * Math.PI * t;
  const wave = line.waves[0];
  const wobble =
    1 +
    wave.amplitude *
      Math.sin(wave.frequency * angle + wave.phase + drifted(wave, clock));
  return { x: a * Math.cos(angle) * wobble, y: b * Math.sin(angle) * wobble };
}

/**
 * One step of the flow clock: it runs only once the bloom's release is
 * complete, and wraps at FLOW_PERIOD. delta is how far it ran, which the
 * simulation needs to see which particles wrapped.
 */
export function flowClockStep(
  clock: number,
  seconds: number,
  release: number,
): { clock: number; delta: number } {
  if (!(seconds > 0) || !(release >= FLOW_RELEASE_DONE)) {
    return { clock, delta: 0 };
  }
  return { clock: (clock + seconds) % FLOW_PERIOD, delta: seconds };
}

/** The share of all particles a keep of 1 holds on their lines. */
export const KEPT_SHARE =
  FLOW_SHARE *
  FLOW_LINES.reduce((sum, line) => sum + line.share * line.keeps, 0);

// The about strands (phase P3.5): three thin dotted strands across the full
// width, one bright and two faint, offset in phase. Their waves are the home
// preview's own about strip (a 1440 by 200 drawing over a 900 px screen),
// measured in the frame's half height: the strip keeps its size and shows
// less of its width on a narrow screen, so a phone sees about one wave of
// the bright strand, not four squeezed together.

export interface Strand {
  /** The share of the particles on this strand. */
  share: number;
  light: number;
  /** As a share of the frame's half height. */
  amplitude: number;
  /** One whole wave's length, as a share of the frame's half height. */
  wavelength: number;
  phase: number;
}

// Each strand is under one halftone cell thick, so it reads as one thin
// dotted line, as the preview draws it; at 0.012 of the half height they
// were bands two or three rows deep. A thinner strand packs its light into
// fewer cells, so its area counts STRANDS_LIT times over when the light is
// set, and the bright strand still reaches lavender.
export const STRANDS: readonly Strand[] = [
  { share: 0.5, light: 1, amplitude: 0.117, wavelength: 0.8, phase: 0 },
  { share: 0.25, light: 0.4, amplitude: 0.03, wavelength: 0.533, phase: 2.1 },
  { share: 0.25, light: 0.3, amplitude: 0.167, wavelength: 1.6, phase: 4.2 },
];
/** The strands' middle, as a share of the half height above the centre. */
export const STRANDS_CENTRE = 0.37;
/** They run this far past each side of the frame, as a share of the half width. */
export const STRANDS_REACH = 1.1;
/** Half a strand's thickness, as a share of the frame's half height. */
export const STRAND_THICKNESS = 0.004;
/** The strands' area counts this many times over when their light is set. */
export const STRANDS_LIT = 2;
/** How fast the waves travel along the strands, in radians per second. */
export const STRANDS_SPEED = 0.35;

/**
 * A strand's point in world units, at a place from -1 to 1 along its reach
 * and an offset from -1 to 1 across its thickness.
 */
export function strandPoint(
  strand: Strand,
  place: number,
  offset: number,
  elapsedSeconds: number,
  frame: Frame,
): { x: number; y: number } {
  const x = place * STRANDS_REACH * frame.halfWidth;
  const wave = Math.sin(
    ((2 * Math.PI) / strand.wavelength) * (x / frame.halfHeight) +
      strand.phase -
      elapsedSeconds * STRANDS_SPEED,
  );
  return {
    x,
    y:
      (STRANDS_CENTRE + strand.amplitude * wave + offset * STRAND_THICKNESS) *
      frame.halfHeight,
  };
}

/** The band every strand stays inside, in world units: its middle and half height. */
export function strandsBand(frame: Frame): {
  centreY: number;
  halfHeight: number;
} {
  const widest = Math.max(...STRANDS.map((strand) => strand.amplitude));
  return {
    centreY: STRANDS_CENTRE * frame.halfHeight,
    halfHeight: (widest + STRAND_THICKNESS) * frame.halfHeight,
  };
}

// The contact rings (phase P3.5): thin dotted circles round the contact
// stage, very faint, fainter outward. The home preview draws them 600, 880
// and 1,160 px across on a 900 px screen, at 40, 24 and 12 per cent of the
// accent; measured in the frame's shorter half, so a phone keeps them round
// its panel instead of past the screen.

export interface ContactRing {
  share: number;
  light: number;
  /** As a share of the frame's shorter half. */
  radius: number;
}

export const RINGS: readonly ContactRing[] = [
  { share: 0.42, light: 1, radius: 0.667 },
  { share: 0.34, light: 0.6, radius: 0.978 },
  { share: 0.24, light: 0.3, radius: 1.289 },
];
/** Half a ring's thickness, as a share of the frame's shorter half. */
export const RING_THICKNESS = 0.005;
/** How fast the rings turn, in radians per second. */
export const RINGS_SPEED = 0.03;
/**
 * The rings count at this share of their area when the light is set, so
 * they read as very faint thin lines, as the preview draws them at 40, 24
 * and 12 per cent of the accent. A ring's light per cell follows this times
 * its thickness: at 0.4 and 0.01 they were bright dotted circles.
 */
export const RINGS_FAINT = 0.3;

/** Each ring's radius in world units. */
export function ringRadii(frame: Frame): number[] {
  return RINGS.map((ring) => ring.radius * shortHalf(frame));
}

/**
 * A formation packs its particles into part of the frame, so each one must
 * add less light for the formed area to stay about as bright as the ambient
 * field behind the page's text. formedArea is the share of the frame a
 * formation covers for its particles; the gain lets a formation read a
 * little brighter than the field without packing light.
 */
export const FORMED_GAIN = 1.6;
const MIN_LIGHT = 0.04;

function strandsArea(frame: Frame): number {
  const samples = 64;
  let area = 0;
  for (const strand of STRANDS) {
    let length = 0;
    let previous = strandPoint(strand, -1, 0, 0, frame);
    for (let step = 1; step <= samples; step += 1) {
      const next = strandPoint(strand, -1 + (2 * step) / samples, 0, 0, frame);
      length += Math.hypot(next.x - previous.x, next.y - previous.y);
      previous = next;
    }
    area += length * 2 * STRAND_THICKNESS * frame.halfHeight;
  }
  return area;
}

function ringsArea(frame: Frame): number {
  const thickness = 2 * RING_THICKNESS * shortHalf(frame);
  return ringRadii(frame).reduce(
    (sum, radius) => sum + 2 * Math.PI * radius * thickness,
    0,
  );
}

/**
 * The share of the frame a formation covers for the particles that form
 * it. shapeFrame is the part of the frame the shapes are fitted to: the
 * chapter's stage, or the whole frame. Particles the lines keep (keep) are
 * not in the formation, so the ones that are spread over more area each.
 */
export function formedArea(
  targets: StoryTargets,
  extents: Readonly<Record<ShapeId, ShapeExtent>>,
  frame: Frame,
  shapeFrame: Frame = frame,
): number {
  const frameArea = 4 * frame.halfWidth * frame.halfHeight;
  const from = extents[targets.shapeFrom];
  const to = extents[targets.shapeTo];
  const shapeArea =
    (1 - targets.shapeMix) * lightArea(from) * fitScale(from, shapeFrame) ** 2 +
    targets.shapeMix * lightArea(to) * fitScale(to, shapeFrame) ** 2;
  const sheetArea = SHEET_FIT * SHEET_FIT * frameArea;

  const form = targets.shape + targets.sheet + targets.strands + targets.rings;
  if (form <= 0) return 1;
  const area =
    (targets.shape * shapeArea +
      targets.sheet * sheetArea +
      targets.strands * strandsArea(frame) * STRANDS_LIT +
      targets.rings * ringsArea(frame) * RINGS_FAINT) /
    form;
  const formedShare = 1 - KEPT_SHARE * unit(targets.keep);
  return Math.min(area / (formedShare * frameArea), 1);
}

/** What each particle's light is multiplied by while a formation holds. */
export function formedLight(
  targets: StoryTargets,
  extents: Readonly<Record<ShapeId, ShapeExtent>>,
  frame: Frame,
  shapeFrame: Frame = frame,
): number {
  const form = Math.min(
    targets.shape + targets.sheet + targets.strands + targets.rings,
    1,
  );
  const packed = Math.min(
    Math.max(
      formedArea(targets, extents, frame, shapeFrame) * FORMED_GAIN,
      MIN_LIGHT,
    ),
    1,
  );
  return 1 + (packed - 1) * form;
}

/** The whole screen: the stage of a chapter the page gave none. */
export const FULL_STAGE: Stage = { x: 0, y: 0, halfWidth: 1, halfHeight: 1 };

/**
 * The field chapter's formation: the middle of the screen at this share of
 * it, so the mark and the wordmark leave room for the ellipse round them, as
 * the preview draws the wordmark at about two thirds of the half width.
 */
export const BLOOM_STAGE: Stage = {
  x: 0,
  y: 0,
  halfWidth: 0.8,
  halfHeight: 0.8,
};
/**
 * The field chapter's formation on a narrow frame: the whole width. At
 * BLOOM_STAGE the wordmark on a 375 px phone was about seven 6 px cells tall
 * and its S and E ran together; across the width it is a quarter larger.
 */
export const NARROW_BLOOM_STAGE: Stage = {
  x: 0,
  y: 0,
  halfWidth: 1,
  halfHeight: 0.8,
};

/** The field chapter's stage for a frame of this width over height. */
export function bloomStage(aspect: number): Stage {
  return Number.isFinite(aspect) && aspect > 0 && aspect < NARROW_ASPECT
    ? NARROW_BLOOM_STAGE
    : BLOOM_STAGE;
}

function finiteIn(value: number, low: number, high: number, fallback: number) {
  return Number.isFinite(value)
    ? Math.min(Math.max(value, low), high)
    : fallback;
}

/**
 * A stage the page sent, kept on the screen: its centre inside -1 to 1 and
 * its halves inside 0 to 1. Anything not a number falls back to the whole
 * screen's value, so a broken measure never throws a shape off screen.
 */
export function cleanStage(stage: Stage | undefined): Stage {
  if (stage === undefined) return FULL_STAGE;
  return {
    x: finiteIn(stage.x, -1, 1, 0),
    y: finiteIn(stage.y, -1, 1, 0),
    halfWidth: finiteIn(stage.halfWidth, 0, 1, 1),
    halfHeight: finiteIn(stage.halfHeight, 0, 1, 1),
  };
}

export interface StagedFrame {
  /** The stage's centre at the focus plane, in world units. */
  centreX: number;
  centreY: number;
  /** The stage's own half sizes at the focus plane, for fitting a shape. */
  frame: Frame;
}

/** A stage in world units at the camera's focus plane, where shapes form. */
export function stagedFrame(
  stage: Stage | undefined,
  frame: Frame,
): StagedFrame {
  const clean = cleanStage(stage);
  return {
    centreX: clean.x * frame.halfWidth,
    centreY: clean.y * frame.halfHeight,
    frame: {
      halfWidth: clean.halfWidth * frame.halfWidth,
      halfHeight: clean.halfHeight * frame.halfHeight,
    },
  };
}

/**
 * Which stage a chapter's formation uses. The dot always sits at the hero's
 * stage, the place the visitor first saw it, through the bloom too; the
 * field chapter forms in its bloom stage for the frame's width over height;
 * study shapes form inside the work stage, the frame of the row in view;
 * the contact rings centre on the contact stage; everything else uses the
 * whole screen.
 */
export function formationStage(
  chapter: ChapterId | null,
  stages: Stages,
  aspect: number,
): Stage | undefined {
  switch (chapter) {
    case "bloom":
      return bloomStage(aspect);
    case "work":
      return stages.work;
    case "contact":
      return stages.contact;
    default:
      return undefined;
  }
}

/**
 * The bloom lets particles go in order of how far their home is from the
 * dot, so the field grows out of the dot wherever it sits. Homes span -1 to
 * 1 on both axes of the seed square; this is 1 over the distance from the
 * dot to the square's farthest corner, so the last particle to leave has a
 * rank of 1. With the dot at the centre it is the square root of a half.
 */
export function releaseRankScale(dotX: number, dotY: number): number {
  const reachX = 1 + Math.min(Math.abs(dotX), 1);
  const reachY = 1 + Math.min(Math.abs(dotY), 1);
  return 1 / Math.hypot(reachX, reachY);
}

/**
 * Whether the pointer's swirl shows: only in the field chapter, while the
 * pointer stirs a running field. The pointer's push stirs the field in
 * every chapter (REQ-SCR-06); the swirl, the preview's dotted trail at the
 * pointer, belongs to the field chapter alone, and a still has none
 * (REQ-A11Y-03).
 */
export function swirlShows(
  chapter: ChapterId | null,
  active: boolean,
  still: boolean,
): boolean {
  return chapter === "bloom" && active && !still;
}

/** One step of an exponential follow: no overshoot, and frame-rate free. */
export function follow(
  value: number,
  target: number,
  seconds: number,
  timeConstant: number,
): number {
  if (!(seconds > 0)) return value;
  return target + (value - target) * Math.exp(-seconds / timeConstant);
}
