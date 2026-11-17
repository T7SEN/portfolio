// The part of the sound that loads only when it is first turned on
// (REQ-SND-01, REQ-PERF-04): the output chains, the bed and the ticks. The
// sound store imports it by dynamic import inside the first press, so no
// visitor who leaves sound off downloads any of it; the bed's recording is
// fetched only when the background is first turned on (D-179).

import {
  BED,
  BEDS,
  createOutput,
  loadBed,
  loopBed,
  playTick,
  TICK_ROOM_S,
  type Bed,
  type TickKind,
} from "./voices";

export type SoundSession = {
  /** Taps the bed alone: the strands' levels, the level bars, the waveform. */
  readonly analyser: AnalyserNode;
  /**
   * Starts the bed when none plays and fades its mix in. Resolves once the
   * bed plays: the first time, after its recording loads; rejects when the
   * recording cannot load or decode, or has not within LOAD_LIMIT_MS, and
   * the next call tries again.
   */
  play(): Promise<void>;
  /** Fades the bed's mix out and lets the bed go; the context stays. */
  pause(): void;
  tick(kind: TickKind): void;
  dispose(): void;
};

export type SoundSessionOptions = {
  /**
   * Fetches and decodes the bed's recording (voices.ts loadBed); the
   * signal aborts its fetch once the load is given up.
   */
  load?: (ctx: AudioContext, signal: AbortSignal) => Promise<AudioBuffer>;
};

/**
 * How long the bed's recording may take to load and decode, in
 * milliseconds, before the start fails and says so (rule A11): about
 * twice what the larger file takes on a slow phone connection, 552 KB at
 * 400 kbit/s. A fetch that stalls part way would otherwise leave the sound
 * starting, and silent, for good (D-180).
 */
export const LOAD_LIMIT_MS = 20_000;

function loadRecording(
  ctx: AudioContext,
  signal: AbortSignal,
): Promise<AudioBuffer> {
  return loadBed(ctx, BEDS[BED], (url) => fetch(url, { signal }));
}

/**
 * Two output chains, each the same as voices.ts builds it: one for the bed,
 * whose analyser the strands and bars read, and one for the ticks, so a
 * tick never moves them [T7SEN, 15 Nov 2026: the strands and the /about
 * waveform follow the background only]. The bed's chain has no room, its
 * room being in its recording; the ticks' has a short one (TICK_ROOM_S). The
 * ticks' chain is turned up once, here, and left up: the store plays a tick
 * only while the interface sounds are on, and a chain faded in again at
 * each turn on would swallow the tick of the press that turned it on.
 */
export function createSoundSession(
  ctx: AudioContext,
  { load = loadRecording }: SoundSessionOptions = {},
): SoundSession {
  const bedOutput = createOutput(ctx);
  const tickOutput = createOutput(ctx, TICK_ROOM_S);
  // At once, not faded: the press that wakes the sound plays its own tick.
  tickOutput.setLevel(1, 0);
  let bed: Bed | null = null;
  let recording: Promise<AudioBuffer> | null = null;
  let loading: AbortController | null = null;
  let isWanted = false;
  let isDisposed = false;

  // The load, given up after LOAD_LIMIT_MS: its fetch is aborted and it
  // rejects, so the store shows the failure and the next play fetches
  // again.
  function limitedLoad(): Promise<AudioBuffer> {
    const controller = new AbortController();
    loading = controller;
    return new Promise<AudioBuffer>((resolve, reject) => {
      const limit = setTimeout(() => {
        controller.abort();
        reject(new Error(`the recording did not load in ${LOAD_LIMIT_MS} ms`));
      }, LOAD_LIMIT_MS);
      load(ctx, controller.signal).then(
        (buffer) => {
          clearTimeout(limit);
          resolve(buffer);
        },
        (error: unknown) => {
          clearTimeout(limit);
          reject(error);
        },
      );
    }).finally(() => {
      if (loading === controller) loading = null;
    });
  }

  return {
    analyser: bedOutput.analyser,

    play() {
      isWanted = true;
      bedOutput.setLevel(1);
      // Loaded once; a load that failed is tried again by the next play.
      recording ??= limitedLoad().catch((error: unknown) => {
        recording = null;
        throw error;
      });
      return recording.then((buffer) => {
        // Paused, or gone, while the recording loaded: nothing starts.
        if (!isWanted || isDisposed) return;
        // A bed that is still fading out from the last pause frees itself;
        // a new one fades in over it.
        bed ??= loopBed(ctx, bedOutput.input, buffer, BEDS[BED].gain);
      });
    },

    pause() {
      isWanted = false;
      bedOutput.setLevel(0);
      bed?.stop();
      bed = null;
    },

    tick(kind) {
      playTick(ctx, tickOutput.input, kind);
    },

    dispose() {
      isDisposed = true;
      isWanted = false;
      loading?.abort();
      bed?.stop();
      bed = null;
      bedOutput.dispose();
      tickOutput.dispose();
    },
  };
}
