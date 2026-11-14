// How far each wave of matter has flown, from the steps the cover reports.
// A finished step launches its wave; the GPU test, the one step with a known
// length, streams its wave in as its share grows; nothing else moves (pillar
// 6, rule A14). The level, 0 to 4, is the sum of the flights: it feeds the
// disk and sets the well's depth.

import type { SceneProgress } from "./types";
import { clamp01, easeOut } from "./math";

export const WAVES = 4;
/**
 * One finished step's wave, from far out to the disk. The mockup's last wave
 * lands in 400 ms, so the disk is full for most of the hold on "Field ready"
 * (READY_HOLD_MS, 700) before the exit begins.
 */
export const WAVE_MS = 400;
/** The test's share is chased one report behind, over the gap between reports, within these bounds. */
export const STREAM_MIN_MS = 16;
export const STREAM_MAX_MS = 250;

interface Flight {
  from: number;
  to: number;
  at: number;
  ms: number;
  launched: boolean;
}

export class ProgressTrack {
  private readonly flights: Flight[] = [];
  private lastTest = -1;

  constructor() {
    for (let k = 0; k < WAVES; k++) {
      this.flights.push({ from: 0, to: 0, at: 0, ms: 1, launched: false });
    }
  }

  /** Takes a report at now (ms on the scene's clock). Steps never go back. */
  update(progress: SceneProgress, now: number): void {
    const steps = progress.ready
      ? WAVES
      : Math.max(0, Math.min(WAVES, Math.floor(progress.done)));
    for (let k = 0; k < steps; k++) {
      const f = this.flights[k];
      if (f && !f.launched) this.set(k, 1, now, WAVE_MS, true);
    }
    const f = this.flights[steps];
    if (progress.test === null || !f || f.launched) return;
    const share = clamp01(progress.test);
    if (share <= f.to) return;
    const gap = this.lastTest < 0 ? STREAM_MAX_MS : now - this.lastTest;
    this.lastTest = now;
    this.set(
      steps,
      share,
      now,
      Math.min(STREAM_MAX_MS, Math.max(STREAM_MIN_MS, gap)),
      false,
    );
  }

  /** Wave k's flight at now, 0 waiting far out as dust, 1 landed in the disk. */
  flight(k: number, now: number): number {
    const f = this.flights[k];
    if (!f) return 0;
    const x = clamp01((now - f.at) / f.ms);
    return f.from + (f.to - f.from) * (f.launched ? easeOut(x) : x);
  }

  level(now: number): number {
    let sum = 0;
    for (let k = 0; k < WAVES; k++) sum += this.flight(k, now);
    return sum;
  }

  private set(
    k: number,
    to: number,
    now: number,
    ms: number,
    launched: boolean,
  ): void {
    const f = this.flights[k];
    if (!f) return;
    f.from = this.flight(k, now);
    f.to = to;
    f.at = now;
    f.ms = ms;
    f.launched = launched;
  }
}
