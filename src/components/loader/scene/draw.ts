// Draws one frame of the black hole: the void, the bent stars, the grid in
// its well, the hole with its disk and the far side's arc, the matter falling
// in, the label's dark patch, and during an exit its own parts and the
// opening cut out of the void.

import { Batch, ARC, DOT, LINE } from "./batch";
import {
  bend,
  clamp01,
  COOL,
  GLOW,
  gridTurn,
  matterAt,
  mix,
  MUTED,
  PAPER,
  rgba,
  smooth,
  spiral,
  HOLE,
  VIOLET,
  VOID,
  wellDepth,
  type Rgb,
} from "./math";
import { RIPPLE_EDGE, type RippleFrame } from "./ripple";
import {
  DISK_INNER,
  DISK_SPAN,
  PIECE,
  STAR,
  STREAK,
  TILT,
  type SceneLayout,
  type World,
} from "./world";

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
/** Opacity levels a batched stroke snaps to. */
const LEVELS = 48;
const GRID_LEVELS = 40;
const HEAT_LEVELS = 8;
const TRAIL_COLOURS = 10;
const TRAIL_WIDTHS = 8;
/** Dot colours: four star tints, the waiting dust, four heads. */
const DUST = 4;
const HEAD = 5;
const DOT_COLOURS = 9;

const level = (a: number): number => Math.round(clamp01(a) * LEVELS);

export interface FrameInput {
  /** ms since the scene's first frame: the twinkle, the disk's orbit, the grid's turn. */
  time: number;
  /** The entrance, 0 to 1. */
  enter: number;
  /** Steps fed in so far, 0 to 4, with fractions while waves fly. */
  level: number;
  /** Each wave's flight, 0 to 1. */
  flights: readonly number[];
  light: boolean;
  exit: RippleFrame | null;
}

export class Painter {
  private readonly lines: Batch;
  private readonly back: Batch;
  private readonly front: Batch;
  private readonly dots: Batch;
  private readonly at = new Float64Array(2);
  private readonly styles = new Map<number, string>();
  private readonly voidFill = rgba(VOID, 1);

  constructor(private readonly world: World) {
    const m = world.mesh;
    const segments = Math.max(
      m.lines * (m.points - 1) * 2,
      world.pieceCount * 10,
    );
    this.lines = new Batch(
      segments,
      TRAIL_COLOURS * (LEVELS + 1) * TRAIL_WIDTHS,
      LINE,
    );
    this.back = new Batch(world.streakCount, HEAT_LEVELS * (LEVELS + 1), ARC);
    this.front = new Batch(world.streakCount, HEAT_LEVELS * (LEVELS + 1), ARC);
    this.dots = new Batch(
      world.starCount + world.pieceCount,
      DOT_COLOURS * (LEVELS + 1),
      DOT,
    );
  }

  draw(ctx: CanvasRenderingContext2D, L: SceneLayout, f: FrameInput): void {
    const x = f.exit;
    const live = x ? 1 - x.fade : 1;
    const ring = clamp01((f.enter - 0.35) / 0.45);
    const pd = clamp01(f.level / 4);
    const hs = x ? x.hole : 1;

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.voidFill;
    ctx.fillRect(0, 0, L.width, L.height);

    if (live > 0) {
      this.stars(ctx, L, f, live);
      this.grid(ctx, L, f, live, pd, x);
    }
    if (ring > 0 && live > 0) {
      this.glowAround(ctx, L, pd, live * ring, hs);
      this.disk(L, f.time, pd, live * ring, hs);
      this.back.flush(ctx, this.diskStyle);
      this.edge(ctx, L, pd, live * ring, hs, false);
      this.lens(ctx, L, pd, live * ring, hs);
    }
    if (ring > 0 || x) this.horizon(ctx, L, pd, live, ring, x);
    if (ring > 0 && live > 0) {
      this.front.flush(ctx, this.diskStyle);
      this.edge(ctx, L, pd, live * ring, hs, true);
      if (!x) this.matter(ctx, L, f, live * ring);
    }
    if (x) this.ripple(ctx, L, x);
    this.plate(ctx, L, x ? x.plate : 1);
    if (x && x.cut > 0) this.cut(ctx, L, x.cut);
  }

  private stars(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    f: FrameInput,
    live: number,
  ): void {
    const s = this.world.stars;
    const ring = L.hole * 2.8;
    for (let o = 0; o < s.length; o += STAR) {
      const shown = clamp01((f.enter * 1.5 - (s[o + 4] as number)) / 0.35);
      if (shown <= 0) continue;
      const dx = (s[o] as number) * L.width - L.cx;
      const dy = (s[o + 1] as number) * L.height - L.cy;
      const r = Math.hypot(dx, dy) + 0.001;
      const k = bend(r, ring) / r;
      const twinkle =
        0.85 + 0.15 * Math.sin(f.time / 1300 + (s[o + 5] as number));
      const tint = Math.min(3, Math.floor((s[o + 6] as number) * 4));
      const a = (s[o + 3] as number) * shown * twinkle * live;
      this.dots.add(
        tint * (LEVELS + 1) + level(a),
        L.cx + dx * k,
        L.cy + dy * k,
        s[o + 2] as number,
      );
    }
    this.dots.flush(ctx, this.dotStyle);
  }

  private grid(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    f: FrameInput,
    live: number,
    pd: number,
    x: RippleFrame | null,
  ): void {
    const R = L.gridRadius;
    const rip = f.enter * R * 1.4;
    if (rip <= 0) return;
    const m = this.world.mesh;
    const flat = x ? x.flat : 0;
    const hole = L.hole * (x ? x.hole : 1);
    const inner = hole * 1.08;
    const nearK = 1 / (L.hole * 3.4);
    const depth = wellDepth(f.level) * (1 - flat);
    const turn = gridTurn(f.time) + 0.6 * depth;
    const wave = x ? x.wave : -1;
    const bump = x ? x.bump : 0;
    const lift = 0.35 + 0.65 * pd;
    const { cx, cy, width: W, height: H } = L;
    const step = f.light ? 2 : 1;
    const half = m.lines / 2;
    for (let dir = 0; dir < 2; dir++) {
      for (let j = 0; j < m.lines; j++) {
        if (f.light && (Math.abs(j - half + 0.5) - 0.5) % 2 !== 0) continue;
        let has = false;
        let ax = 0;
        let ay = 0;
        let ar = 0;
        let ag = 0;
        let ae = 0;
        for (let i = 0; i < m.points; i += step) {
          const k = j * m.points + i;
          const r = m.r[k] as number;
          const e = m.edge[k] as number;
          if (e <= 0 || r > rip) {
            has = false;
            continue;
          }
          const pull = m.pull[k] as number;
          const angle = m.angle[k] as number;
          let rr = r * (1 - depth * pull);
          const th = (dir ? HALF_PI - angle : angle) + turn * pull;
          let glow = 0;
          if (bump > 0 && wave >= 0) {
            const d = (rr - wave) / 26;
            if (d > -4 && d < 4) {
              const b = Math.exp(-d * d);
              rr += bump * b;
              glow = (b * bump) / 8;
            }
          }
          const px = cx + Math.cos(th) * rr;
          const py = cy + Math.sin(th) * rr;
          if (
            has &&
            ar >= inner &&
            rr >= inner &&
            !(
              (ax < 0 && px < 0) ||
              (ax > W && px > W) ||
              (ay < 0 && py < 0) ||
              (ay > H && py > H)
            )
          ) {
            const near =
              Math.exp(-(Math.min(ar, rr) - hole) * nearK) * (1 - flat);
            const lit = Math.max(near, ag, glow);
            const a = (0.045 + 0.42 * lit * lift) * Math.min(ae, e) * live;
            if (a >= 0.012) {
              const nq = Math.min(7, Math.floor(lit * 8));
              const aq = Math.min(
                GRID_LEVELS,
                Math.max(1, Math.round(a * GRID_LEVELS)),
              );
              this.lines.add(nq * (GRID_LEVELS + 1) + aq, ax, ay, px, py);
            }
          }
          has = true;
          ax = px;
          ay = py;
          ar = rr;
          ag = glow;
          ae = e;
        }
      }
    }
    this.lines.flush(ctx, this.gridStyle);
  }

  private glowAround(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    pd: number,
    a: number,
    hs: number,
  ): void {
    const R = L.hole * (3.8 + 1.4 * pd) * hs;
    if (R <= 1) return;
    const g = ctx.createRadialGradient(
      L.cx,
      L.cy,
      Math.max(0.1, L.hole * 0.9 * hs),
      L.cx,
      L.cy,
      R,
    );
    g.addColorStop(0, rgba(VIOLET, (0.07 + 0.11 * pd) * a));
    g.addColorStop(1, rgba(VIOLET, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, R, 0, TAU);
    ctx.fill();
  }

  private disk(
    L: SceneLayout,
    time: number,
    pd: number,
    a: number,
    hs: number,
  ): void {
    const s = this.world.streaks;
    const shown = this.world.streakCount * pd;
    const rh = L.hole * hs;
    if (rh * DISK_INNER > 0.5) {
      for (let i = 0; i < shown; i++) {
        const o = i * STREAK;
        const rr = (s[o] as number) * rh;
        const ph = (s[o + 1] as number) + (s[o + 2] as number) * time;
        const hot = s[o + 3] as number;
        const alpha =
          (0.07 + 0.42 * hot) *
          (1 + 0.45 * Math.cos(ph)) *
          clamp01(shown - i) *
          a;
        if (alpha <= 0.004) continue;
        const key =
          Math.round(hot * (HEAT_LEVELS - 1)) * (LEVELS + 1) + level(alpha);
        (Math.sin(ph) > 0 ? this.front : this.back).add(
          key,
          L.cx,
          L.cy,
          rr,
          rr * TILT,
          ph - (s[o + 4] as number),
          ph,
        );
      }
    }
  }

  /** The disk's bright inner edge, the half behind the hole or the half in front. */
  private edge(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    pd: number,
    a: number,
    hs: number,
    front: boolean,
  ): void {
    const r = L.hole * DISK_INNER * hs;
    if (r <= 0.5) return;
    ctx.strokeStyle = rgba(PAPER, (front ? 0.5 : 0.35) * pd * a);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(
      L.cx,
      L.cy,
      r,
      r * TILT,
      0,
      front ? 0 : Math.PI,
      front ? Math.PI : TAU,
    );
    ctx.stroke();
  }

  /** The disk's far side, bent over the top of the hole, and its thin image under it. */
  private lens(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    pd: number,
    a: number,
    hs: number,
  ): void {
    const { cx, cy } = L;
    ctx.lineWidth = 1;
    for (let j = 0; j < 6; j++) {
      const rx = L.hole * (1.42 + j * 0.09) * hs;
      if (rx <= 0.5) continue;
      ctx.strokeStyle = rgba(
        mix(PAPER, VIOLET, j / 6),
        (0.1 + 0.32 * pd) * (1 - j / 6) * a,
      );
      if (j === 0) {
        ctx.shadowColor = rgba(GLOW, 0.9);
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.9, 0, Math.PI, TAU);
      ctx.stroke();
      if (j === 0) ctx.shadowBlur = 0;
    }
    ctx.lineWidth = 0.9;
    for (let j = 0; j < 2; j++) {
      const rx = L.hole * (1.2 + j * 0.08) * hs;
      if (rx <= 0.5) continue;
      ctx.strokeStyle = rgba(
        mix(PAPER, VIOLET, j / 2),
        (0.08 + 0.22 * pd) * (1 - j / 2) * a,
      );
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, rx * 0.86, 0, 0, Math.PI);
      ctx.stroke();
    }
  }

  /** The hole, its ring drawing itself round in the entrance. */
  private horizon(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    pd: number,
    live: number,
    ring: number,
    x: RippleFrame | null,
  ): void {
    const r = L.hole * (x ? x.hole : 1);
    if (r <= 0.3) return;
    ctx.fillStyle = rgba(HOLE, 1);
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, r, 0, TAU);
    ctx.fill();
    const a = (0.55 + 0.45 * pd) * live;
    if (a <= 0 || ring <= 0) return;
    ctx.strokeStyle = rgba(mix(GLOW, PAPER, 0.5), a);
    ctx.lineWidth = 1.3;
    ctx.shadowColor = rgba(GLOW, 1);
    ctx.shadowBlur = 7 + 8 * pd;
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, r * 1.07, -HALF_PI, -HALF_PI + ring * TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  private matter(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    f: FrameInput,
    a: number,
  ): void {
    const p = this.world.pieces;
    const at = this.at;
    const end = L.hole * (DISK_INNER + DISK_SPAN);
    const steps = f.light ? 6 : 10;
    const stride = f.light ? 2 : 1;
    const { cx, cy } = L;
    for (let i = 0; i < this.world.pieceCount; i += stride) {
      const o = i * PIECE;
      const angle = p[o + 2] as number;
      const start = p[o + 3] as number;
      const twist = p[o + 4] as number;
      const size = p[o + 5] as number;
      const t = matterAt(f.flights[p[o] as number] ?? 0, p[o + 1] as number);
      if (t >= 1) continue;
      if (t <= 0) {
        spiral(at, 0, angle, start, end, twist, TILT);
        const drift = Math.sin(f.time / 1300 + angle * 3) * 2;
        this.dots.add(
          DUST * (LEVELS + 1) + level(0.16 * a),
          cx + (at[0] as number) + drift,
          cy + (at[1] as number),
          size * 0.7,
        );
        continue;
      }
      const fin = (1 - smooth(0.82, 1, t)) * a;
      const from = Math.max(0, t - 0.14);
      spiral(at, from, angle, start, end, twist, TILT);
      let px = cx + (at[0] as number);
      let py = cy + (at[1] as number);
      let u = 1;
      for (let s = 1; s <= steps; s++) {
        const k = s / steps;
        u = spiral(at, from + (t - from) * k, angle, start, end, twist, TILT);
        const nx = cx + (at[0] as number);
        const ny = cy + (at[1] as number);
        const colour = Math.round(k * (TRAIL_COLOURS - 1));
        const width = Math.min(
          TRAIL_WIDTHS - 1,
          Math.round((k * size * 0.7) / 0.14),
        );
        this.lines.add(
          (colour * (LEVELS + 1) + level(0.42 * k * fin)) * TRAIL_WIDTHS +
            width,
          px,
          py,
          nx,
          ny,
        );
        px = nx;
        py = ny;
      }
      const head = HEAD + Math.min(3, Math.floor((1 - u) * 4));
      this.dots.add(head * (LEVELS + 1) + level(0.9 * fin), px, py, size * 0.7);
    }
    this.lines.flush(ctx, this.trailStyle);
    this.dots.flush(ctx, this.dotStyle);
  }

  /** The ripple's flash and its wave, a thin ring with a soft glow drawn as wider faint strokes. */
  private ripple(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    x: RippleFrame,
  ): void {
    if (x.flash > 0) {
      const g = ctx.createRadialGradient(
        L.cx,
        L.cy,
        0,
        L.cx,
        L.cy,
        L.hole * 2.4,
      );
      g.addColorStop(0, rgba(PAPER, 0.55 * x.flash));
      g.addColorStop(1, rgba(GLOW, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, L.hole * 2.4, 0, TAU);
      ctx.fill();
    }
    if (x.ring <= 0 || x.wave <= 0) return;
    const bands: readonly (readonly [number, number, Rgb])[] = [
      [12, 0.07, GLOW],
      [5, 0.18, GLOW],
      [1.4, 1, mix(GLOW, PAPER, 0.5)],
    ];
    for (const [width, a, c] of bands) {
      ctx.strokeStyle = rgba(c, a * x.ring);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(L.cx, L.cy, x.wave, 0, TAU);
      ctx.stroke();
    }
  }

  /** The soft dark patch under the label, so nothing crosses its words. */
  private plate(
    ctx: CanvasRenderingContext2D,
    L: SceneLayout,
    a: number,
  ): void {
    if (a <= 0) return;
    ctx.save();
    ctx.translate(L.cx, L.plateY);
    ctx.scale(1, L.plateH / L.plateW);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L.plateW);
    g.addColorStop(0, rgba(VOID, 0.92 * a));
    g.addColorStop(0.6, rgba(VOID, 0.75 * a));
    g.addColorStop(1, rgba(VOID, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, L.plateW, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** The opening, radius r: cut out of the void with a soft edge, so the page shows through the canvas. */
  private cut(ctx: CanvasRenderingContext2D, L: SceneLayout, r: number): void {
    ctx.globalCompositeOperation = "destination-out";
    const g = ctx.createRadialGradient(
      L.cx,
      L.cy,
      Math.max(0, r - RIPPLE_EDGE),
      L.cx,
      L.cy,
      r,
    );
    g.addColorStop(0, rgba(VOID, 1));
    g.addColorStop(1, rgba(VOID, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(L.cx, L.cy, r, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }

  private paint(key: number, make: (key: number) => string): string {
    let s = this.styles.get(key);
    if (s === undefined) {
      s = make(key);
      this.styles.set(key, s);
    }
    return s;
  }

  private readonly gridStyle = (
    ctx: CanvasRenderingContext2D,
    key: number,
  ): void => {
    ctx.strokeStyle = this.paint(key, gridColour);
    ctx.lineWidth = 0.6 + 0.5 * gridNear(key);
  };

  private readonly diskStyle = (
    ctx: CanvasRenderingContext2D,
    key: number,
  ): void => {
    ctx.strokeStyle = this.paint(DISK_KEYS + key, diskColour);
    ctx.lineWidth = 0.45 + 0.8 * diskHeat(key);
  };

  private readonly trailStyle = (
    ctx: CanvasRenderingContext2D,
    key: number,
  ): void => {
    ctx.strokeStyle = this.paint(
      TRAIL_KEYS + Math.floor(key / TRAIL_WIDTHS),
      trailColour,
    );
    ctx.lineWidth = 0.4 + (key % TRAIL_WIDTHS) * 0.14;
  };

  private readonly dotStyle = (
    ctx: CanvasRenderingContext2D,
    key: number,
  ): void => {
    ctx.fillStyle = this.paint(DOT_KEYS + key, dotFill);
  };
}

// Style strings are made once per key and kept; each layer has its own range.
const DISK_KEYS = 10000;
const TRAIL_KEYS = 20000;
const DOT_KEYS = 30000;

const gridNear = (key: number): number =>
  (Math.floor(key / (GRID_LEVELS + 1)) + 0.5) / 8;

function gridColour(key: number): string {
  const near = gridNear(key);
  const c = mix(
    MUTED,
    mix(VIOLET, PAPER, near * 0.45),
    Math.min(1, near * 1.5),
  );
  return rgba(c, (key % (GRID_LEVELS + 1)) / GRID_LEVELS);
}

const diskHeat = (key: number): number =>
  Math.floor(key / (LEVELS + 1)) / (HEAT_LEVELS - 1);

function diskColour(key: number): string {
  const k = key - DISK_KEYS;
  return rgba(
    mix(VIOLET, PAPER, diskHeat(k) * 0.85),
    (k % (LEVELS + 1)) / LEVELS,
  );
}

function trailColour(key: number): string {
  const k = key - TRAIL_KEYS;
  const c = Math.floor(k / (LEVELS + 1)) / (TRAIL_COLOURS - 1);
  return rgba(mix(VIOLET, GLOW, c), (k % (LEVELS + 1)) / LEVELS);
}

function dotFill(key: number): string {
  const k = key - DOT_KEYS;
  return rgba(
    dotColour(Math.floor(k / (LEVELS + 1))),
    (k % (LEVELS + 1)) / LEVELS,
  );
}

function dotColour(c: number): Rgb {
  if (c < DUST) return mix(COOL, PAPER, ((c + 0.5) / 4) * 0.6);
  if (c === DUST) return mix(COOL, VIOLET, 0.35);
  return mix(GLOW, PAPER, (c - HEAD + 0.5) / 4);
}
