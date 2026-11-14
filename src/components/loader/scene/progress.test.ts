import { describe, expect, test } from "vitest";

import { ProgressTrack, STREAM_MAX_MS, WAVE_MS, WAVES } from "./progress";
import type { SceneProgress } from "./types";

const at = (
  done: number,
  test: number | null = null,
  ready = false,
): SceneProgress => ({
  done,
  test,
  ready,
});

const flights = (track: ProgressTrack, now: number): number[] =>
  Array.from({ length: WAVES }, (_, k) => track.flight(k, now));

describe("the loader's progress", () => {
  test("REQ-LOAD-01 nothing moves before a step finishes", () => {
    const track = new ProgressTrack();
    track.update(at(0), 0);
    for (const now of [0, 500, 5000, 60_000]) expect(track.level(now)).toBe(0);
  });

  test("REQ-LOAD-01 each finished step sends one wave in, then nothing moves until the next", () => {
    const track = new ProgressTrack();
    track.update(at(1), 1000);
    expect(flights(track, 1000)).toEqual([0, 0, 0, 0]);
    const mid = track.flight(0, 1000 + WAVE_MS / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(flights(track, 1000 + WAVE_MS)).toEqual([1, 0, 0, 0]);
    expect(track.level(1000 + WAVE_MS)).toBe(1);
    expect(track.level(20_000)).toBe(1);

    track.update(at(1), 21_000);
    expect(track.level(30_000)).toBe(1);
    track.update(at(2), 30_000);
    expect(flights(track, 30_000 + WAVE_MS)).toEqual([1, 1, 0, 0]);
  });

  test("REQ-LOAD-01 steps reported together each send their wave, and steps never go back", () => {
    const track = new ProgressTrack();
    track.update(at(3), 0);
    expect(flights(track, WAVE_MS)).toEqual([1, 1, 1, 0]);
    track.update(at(1), WAVE_MS);
    expect(track.level(WAVE_MS * 3)).toBe(3);
  });

  test("REQ-LOAD-01 during the GPU test its wave streams in steadily with the test's share", () => {
    const track = new ProgressTrack();
    track.update(at(2), 0);
    let last = 0;
    for (let i = 1; i <= 20; i++) {
      const now = WAVE_MS + i * 100;
      track.update(at(2, i / 20), now);
      const f = track.flight(2, now);
      expect(f).toBeGreaterThanOrEqual(last);
      // Never ahead of the share reported.
      expect(f).toBeLessThanOrEqual(i / 20);
      // Once reports come steadily, at most one report behind.
      if (i > 2) expect(f).toBeGreaterThanOrEqual((i - 1) / 20 - 1e-9);
      last = f;
    }
    expect(track.flight(2, WAVE_MS + 2000 + STREAM_MAX_MS)).toBeCloseTo(1, 9);
    expect(track.flight(3, 10_000)).toBe(0);
  });

  test("REQ-LOAD-01 a share that goes back, or one with no test running, moves nothing", () => {
    const track = new ProgressTrack();
    track.update(at(2, 0.5), 0);
    expect(track.flight(2, 1000)).toBeCloseTo(0.5, 9);
    track.update(at(2, 0.3), 1000);
    expect(track.flight(2, 2000)).toBeCloseTo(0.5, 9);
    track.update(at(2, null), 2000);
    expect(track.flight(2, 3000)).toBeCloseTo(0.5, 9);
  });

  test("REQ-LOAD-01 when the test finishes, its wave lands from where the stream had reached", () => {
    const track = new ProgressTrack();
    track.update(at(2, 0.6), 0);
    const before = track.flight(2, 1000);
    track.update(at(3), 1000);
    expect(track.flight(2, 1000)).toBeCloseTo(before, 9);
    expect(track.flight(2, 1000 + WAVE_MS)).toBe(1);
  });

  test("REQ-LOAD-01 ready is a full disk and the deepest well", () => {
    const track = new ProgressTrack();
    track.update(at(1), 0);
    track.update(at(1, null, true), 100);
    expect(track.level(100 + WAVE_MS)).toBe(4);
    expect(flights(track, 100 + WAVE_MS)).toEqual([1, 1, 1, 1]);
  });
});
