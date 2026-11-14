// Many small strokes in few calls: each item gets a style key, and one path
// per key is stroked or filled. Typed arrays and a counting sort, so a frame
// allocates nothing.

export const LINE = 0;
export const ARC = 1;
export const DOT = 2;
type Kind = typeof LINE | typeof ARC | typeof DOT;

const FULL_TURN = Math.PI * 2;

export class Batch {
  private readonly data: Float32Array;
  private readonly keyOf: Uint16Array;
  private readonly order: Uint32Array;
  private readonly counts: Uint32Array;
  private n = 0;

  constructor(
    private readonly capacity: number,
    private readonly keys: number,
    private readonly kind: Kind,
  ) {
    this.data = new Float32Array(capacity * 6);
    this.keyOf = new Uint16Array(capacity);
    this.order = new Uint32Array(capacity);
    this.counts = new Uint32Array(keys + 1);
  }

  get size(): number {
    return this.n;
  }

  /** LINE: x0, y0, x1, y1. ARC: cx, cy, rx, ry, from, to. DOT: x, y, radius. */
  add(key: number, a: number, b: number, c: number, d = 0, e = 0, f = 0): void {
    if (this.n >= this.capacity || key < 0 || key >= this.keys) return;
    const o = this.n * 6;
    this.data[o] = a;
    this.data[o + 1] = b;
    this.data[o + 2] = c;
    this.data[o + 3] = d;
    this.data[o + 4] = e;
    this.data[o + 5] = f;
    this.keyOf[this.n++] = key;
  }

  /** Draws every item, one path per key; style sets the context's style for a key. */
  flush(
    ctx: CanvasRenderingContext2D,
    style: (ctx: CanvasRenderingContext2D, key: number) => void,
  ): void {
    const { n, counts, order, keyOf, data } = this;
    if (n === 0) return;
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const k = (keyOf[i] as number) + 1;
      counts[k] = (counts[k] as number) + 1;
    }
    for (let k = 1; k <= this.keys; k++) {
      counts[k] = (counts[k] as number) + (counts[k - 1] as number);
    }
    for (let i = 0; i < n; i++) {
      const k = keyOf[i] as number;
      const at = counts[k] as number;
      order[at] = i;
      counts[k] = at + 1;
    }
    let i = 0;
    while (i < n) {
      const key = keyOf[order[i] as number] as number;
      style(ctx, key);
      ctx.beginPath();
      for (; i < n; i++) {
        const item = order[i] as number;
        if (keyOf[item] !== key) break;
        const o = item * 6;
        const a = data[o] as number;
        const b = data[o + 1] as number;
        const c = data[o + 2] as number;
        if (this.kind === LINE) {
          ctx.moveTo(a, b);
          ctx.lineTo(c, data[o + 3] as number);
        } else if (this.kind === DOT) {
          ctx.moveTo(a + c, b);
          ctx.arc(a, b, c, 0, FULL_TURN);
        } else {
          const ry = data[o + 3] as number;
          const from = data[o + 4] as number;
          ctx.moveTo(a + Math.cos(from) * c, b + Math.sin(from) * ry);
          ctx.ellipse(a, b, c, ry, 0, from, data[o + 5] as number);
        }
      }
      if (this.kind === DOT) ctx.fill();
      else ctx.stroke();
    }
    this.n = 0;
  }

  clear(): void {
    this.n = 0;
  }
}
