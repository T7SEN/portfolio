// What the scene is made of: its layout for a screen, and the seeded stars,
// disk streaks, matter and grid it draws, built once. The numbers are the
// mockup's (black-hole-combined.html, version "1 + 4 Combined").

import { seeded, smooth } from "./math";

interface Sizing {
  hole: number;
  spacing: number;
  gridRadius: number;
  /** The well's reach, in hole radii. */
  reach: number;
  /** The hole sits this far above the screen's middle. */
  lift: number;
  /** The label's top, below the hole's centre. */
  label: number;
  plate: readonly [number, number];
  matter: readonly [number, number];
  stars: number;
  streaks: number;
  pieces: number;
}

const DESKTOP: Sizing = {
  hole: 19,
  spacing: 28,
  gridRadius: 620,
  reach: 9,
  lift: 46,
  label: 178,
  plate: [300, 46],
  matter: [140, 420],
  stars: 170,
  streaks: 700,
  pieces: 60,
};

const PHONE: Sizing = {
  hole: 15,
  spacing: 22,
  gridRadius: 300,
  reach: 7,
  lift: 40,
  label: 150,
  plate: [190, 44],
  matter: [70, 240],
  stars: 80,
  streaks: 420,
  pieces: 40,
};

export const SEED = 23;
/** The disk's outer edge beyond its inner edge, in hole radii. */
export const DISK_SPAN = 3.6;
export const DISK_INNER = 1.6;
export const TILT = 0.26;
/** Grid points along a line, in CSS pixels. */
export const GRID_STEP = 8;

export interface SceneLayout {
  width: number;
  height: number;
  cx: number;
  cy: number;
  hole: number;
  spacing: number;
  gridRadius: number;
  /** The label block's top, in CSS pixels from the top of the screen. */
  labelTop: number;
  /** The centre and radii of the soft dark patch under the label. */
  plateY: number;
  plateW: number;
  plateH: number;
}

export function sceneLayout(
  width: number,
  height: number,
  phone: boolean,
): SceneLayout {
  const s = phone ? PHONE : DESKTOP;
  const cy = height / 2 - s.lift;
  return {
    width,
    height,
    cx: width / 2,
    cy,
    hole: s.hole,
    spacing: s.spacing,
    gridRadius: s.gridRadius,
    labelTop: cy + s.label,
    plateY: cy + s.label + 18,
    plateW: s.plate[0],
    plateH: s.plate[1],
  };
}

export const STAR = 7;
export const STREAK = 5;
export const PIECE = 6;

export interface World {
  /** Per star: x and y as shares of the screen, size, opacity, entrance delay, twinkle phase, tint. */
  stars: Float32Array;
  /** Per streak: radius in hole radii, start angle, angular speed (rad/ms), heat, arc length. */
  streaks: Float32Array;
  /** Per piece: wave, stagger, start angle, start radius, twist, size. */
  pieces: Float32Array;
  starCount: number;
  streakCount: number;
  pieceCount: number;
  mesh: Mesh;
}

/** The grid's points before it bends: horizontal lines; vertical lines are the same points mirrored. */
export interface Mesh {
  lines: number;
  points: number;
  r: Float32Array;
  angle: Float32Array;
  /** How strongly the well pulls the point, 1 at the hole and near 0 far out. */
  pull: Float32Array;
  /** Fades the grid out towards its rim. */
  edge: Float32Array;
}

export function buildWorld(phone: boolean): World {
  const s = phone ? PHONE : DESKTOP;
  const r = seeded(SEED);

  const stars = new Float32Array(s.stars * STAR);
  for (let i = 0; i < stars.length; i += STAR) {
    stars[i] = r();
    stars[i + 1] = r();
    stars[i + 2] = 0.35 + r() * 0.85;
    stars[i + 3] = 0.07 + r() * 0.26;
    stars[i + 4] = r();
    stars[i + 5] = r() * 6.3;
    stars[i + 6] = r();
  }

  const streaks = new Float32Array(s.streaks * STREAK);
  for (let i = 0; i < streaks.length; i += STREAK) {
    const rr = DISK_INNER + DISK_SPAN * r() ** 1.35;
    streaks[i] = rr;
    streaks[i + 1] = r() * 6.283;
    r();
    streaks[i + 2] = 0.0019 * (rr / DISK_INNER) ** -1.5;
    streaks[i + 3] = Math.max(
      0,
      Math.min(1, 1 - (rr - DISK_INNER) / DISK_SPAN),
    );
    streaks[i + 4] = Math.min(0.9, 0.14 + 0.5 * (DISK_INNER / rr) ** 1.5);
  }

  const count = s.pieces * 4;
  const pieces = new Float32Array(count * PIECE);
  for (let i = 0; i < count; i++) {
    const o = i * PIECE;
    pieces[o] = Math.floor(i / s.pieces);
    pieces[o + 1] = r();
    pieces[o + 2] = r() * 6.283;
    pieces[o + 3] = s.matter[0] + r() * (s.matter[1] - s.matter[0]);
    pieces[o + 4] = 0.38 + r() * 0.22;
    pieces[o + 5] = 0.7 + r() * 0.7;
  }

  return {
    stars,
    streaks,
    pieces,
    starCount: s.stars,
    streakCount: s.streaks,
    pieceCount: count,
    mesh: buildMesh(s),
  };
}

function buildMesh(s: Sizing): Mesh {
  const R = s.gridRadius;
  const half = Math.floor(R / s.spacing - 0.5) + 1;
  const lines = half * 2;
  const points = Math.floor((2 * R) / GRID_STEP) + 1;
  const reach = s.hole * s.reach;
  const n = lines * points;
  const mesh: Mesh = {
    lines,
    points,
    r: new Float32Array(n),
    angle: new Float32Array(n),
    pull: new Float32Array(n),
    edge: new Float32Array(n),
  };
  for (let j = 0; j < lines; j++) {
    const y = (j - half + 0.5) * s.spacing;
    for (let i = 0; i < points; i++) {
      const x = -R + i * GRID_STEP;
      const k = j * points + i;
      const d = Math.hypot(x, y);
      mesh.r[k] = d;
      mesh.angle[k] = Math.atan2(y, x);
      mesh.pull[k] = Math.exp(-((d / reach) ** 0.9));
      mesh.edge[k] = 1 - smooth(R * 0.5, R, d);
    }
  }
  return mesh;
}
