// The chapters' choreography as numbers: which targets the field is pulled
// to, how strongly, and where the camera sits, for a chapter and how far
// through it the page is. No three.js here, so it is unit tested in Node;
// the runtime turns these numbers into uniforms.

import { WORK_SHAPES, workStep, type ShapeId } from "../story";
import type { ChapterId, Stage, Stages } from "../types";

export interface StoryTargets {
  /**
   * How far the hero's dot has let the field go: 0 keeps every particle
   * parked in the dot, 1 sends every one to the field. Particles go in
   * order of how far their home is from the centre, so the field blooms
   * outward.
   */
  release: number;
  /** The two sampled shapes a formation morphs between. */
  shapeFrom: ShapeId;
  shapeTo: ShapeId;
  /** 0 is shapeFrom, 1 is shapeTo. */
  shapeMix: number;
  /**
   * Weights of the three formations. What they leave goes to the homes of
   * the ambient field, and at most one of them is above 0.
   */
  shape: number;
  sheet: number;
  wave: number;
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
  wave: 0,
  noise: 1,
  push: 0,
};

// Bloom (REQ-SCR-07): the dot lets the field go, the field gathers into the
// mark, the mark dissolves back into the flow.
const BLOOM_RELEASED = 0.35;
const LOGO_GATHERED = 0.52;
const LOGO_HOLDS_UNTIL = 0.7;
const LOGO_GONE = 0.95;
// Making-of and about: the formation takes the first quarter to gather and
// lets go from 0.85, so the next chapter starts from the flow.
const FORM_IN = 0.25;
const FORM_OUT = 0.85;
// Work: a shape is whole across the middle half of its step. Between two
// steps the field keeps this share of the formation while one shape morphs
// into the next, so the move reads as one shape turning into another.
const STEP_EDGE = 0.25;
const STEP_DIP = 0.55;
// The contact field rests: its drift is gentler than the ambient flow's.
const CONTACT_NOISE = 0.6;

/** The calm frame of a bloom: the mark, whole. */
const BLOOM_CALM = 0.6;

function unit(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : 0;
}

/** 0 at edge0, 1 at edge1, eased; the GLSL and WGSL smoothstep. */
export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = unit((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function shapeAt(index: number): ShapeId {
  const last = WORK_SHAPES.length - 1;
  return WORK_SHAPES[Math.min(Math.max(index, 0), last)] ?? "making-of";
}

function bloom(progress: number): StoryTargets {
  return {
    ...AMBIENT,
    release: smoothstep(0, BLOOM_RELEASED, progress),
    shape:
      smoothstep(BLOOM_RELEASED, LOGO_GATHERED, progress) *
      (1 - smoothstep(LOGO_HOLDS_UNTIL, LOGO_GONE, progress)),
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
      return { ...AMBIENT, wave: formation(at) };
    case "contact":
      return { ...AMBIENT, noise: CONTACT_NOISE };
  }
}

/**
 * Calm mode shows one still frame per chapter, and one per study in the
 * work chapter (REQ-A11Y-03). The frame is the chapter at its fullest, not
 * wherever the scroll happened to be when it began: the dot, the whole
 * mark, each study's shape whole, the sheet, the wave, the field at rest.
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
}

export interface Frame {
  /** Half the frame at the camera's focus plane, in world units. */
  halfWidth: number;
  halfHeight: number;
}

/** Formed shapes keep this share of the frame's half width and height. */
export const SHAPE_FIT = 0.8;
/** The making-of sheet is the frame's own shape at this share of it. */
export const SHEET_FIT = 0.7;
/** The about wave: amplitude and band half thickness, as shares of the half height. */
export const WAVE_AMPLITUDE = 0.24;
export const WAVE_THICKNESS = 0.07;
/** The wave reaches this far past each side of the frame, as a share of the half width. */
export const WAVE_REACH = 1.1;

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

/**
 * A formation packs every particle into part of the frame, so each sprite
 * must add less light for the formed area to stay about as bright as the
 * ambient field behind the page's text. This is the share of the frame the
 * formation covers; the gain lets a formation read a little brighter than
 * the field without packing light.
 */
export const FORMED_GAIN = 1.6;
const MIN_LIGHT = 0.04;

/**
 * The share of the frame a formation covers. shapeFrame is the part of the
 * frame the shapes are fitted to: the work chapter's stage, or the whole
 * frame.
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
    (1 - targets.shapeMix) * from.area * fitScale(from, shapeFrame) ** 2 +
    targets.shapeMix * to.area * fitScale(to, shapeFrame) ** 2;
  const sheetArea = SHEET_FIT * SHEET_FIT * frameArea;
  // The band runs the whole reach of the wave at twice its half thickness.
  const waveArea =
    2 * WAVE_REACH * frame.halfWidth * 2 * WAVE_THICKNESS * frame.halfHeight;

  const form = targets.shape + targets.sheet + targets.wave;
  if (form <= 0) return 1;
  const area =
    (targets.shape * shapeArea +
      targets.sheet * sheetArea +
      targets.wave * waveArea) /
    form;
  return Math.min(area / frameArea, 1);
}

/** What each sprite's light is multiplied by while a formation holds. */
export function formedLight(
  targets: StoryTargets,
  extents: Readonly<Record<ShapeId, ShapeExtent>>,
  frame: Frame,
  shapeFrame: Frame = frame,
): number {
  const form = Math.min(targets.shape + targets.sheet + targets.wave, 1);
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
 * stage, the place the visitor first saw it, through the bloom too; study
 * shapes form inside the work stage; everything else uses the whole screen.
 */
export function formationStage(chapter: ChapterId | null, stages: Stages) {
  return chapter === "work" ? stages.work : undefined;
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
