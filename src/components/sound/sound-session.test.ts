// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSoundSession, LOAD_LIMIT_MS } from "./sound-session";

// The voices' bodies are the sound itself; here only how the session drives
// them counts, so they are replaced by records of each call. Each output
// chain is named by the order it is made in: the bed's, then the ticks'.
const voices = vi.hoisted(() => {
  const calls: string[] = [];
  const names = ["bed", "tick"];
  type FakeOutput = {
    input: { name: string };
    analyser: { name: string };
    setLevel: (level: number, seconds?: number) => void;
    dispose: () => void;
  };
  const outputs: FakeOutput[] = [];
  const bed = { stop: vi.fn(() => calls.push("bed stop")) };
  return {
    calls,
    outputs,
    bed,
    createOutput: vi.fn(() => {
      const name = names[outputs.length] ?? `chain ${outputs.length}`;
      const output: FakeOutput = {
        input: { name: `${name} input` },
        analyser: { name: `${name} analyser` },
        setLevel: (level: number, seconds?: number) =>
          calls.push(
            `${name} level ${level}${seconds === undefined ? "" : ` in ${seconds} s`}`,
          ),
        dispose: () => calls.push(`${name} dispose`),
      };
      outputs.push(output);
      return output;
    }),
    loopBed: vi.fn(() => {
      calls.push("bed start");
      return bed;
    }),
    loadBed: vi.fn(),
    playTick: vi.fn(),
  };
});

vi.mock("./voices", () => ({
  BED: "rain-at-sea",
  BEDS: {
    "rain-at-sea": { label: "Rain at sea", files: [], gain: 0.5 },
  },
  TICK_ROOM_S: 1,
  createOutput: voices.createOutput,
  loadBed: voices.loadBed,
  loopBed: voices.loopBed,
  playTick: voices.playTick,
}));

const ctx = { name: "context" } as unknown as AudioContext;
const recording = { name: "recording" } as unknown as AudioBuffer;

/** A load that resolves or rejects when the test says. */
function controlledLoad() {
  let resolve: (buffer: AudioBuffer) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const load = vi.fn(
    () =>
      new Promise<AudioBuffer>((done, fail) => {
        resolve = done;
        reject = fail;
      }),
  );
  return {
    load,
    resolve: (buffer: AudioBuffer) => resolve(buffer),
    reject: (error: Error) => reject(error),
  };
}

beforeEach(() => {
  voices.calls.length = 0;
  voices.outputs.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sound session", () => {
  it("REQ-SND-03 builds two chains on the context, the bed's with no room (its room is in its recording) and the ticks' with a short one, and exposes the bed's analyser alone", () => {
    const session = createSoundSession(ctx, { load: vi.fn() });
    expect(voices.createOutput.mock.calls).toEqual([[ctx], [ctx, 1]]);
    expect(session.analyser).toBe(voices.outputs[0]?.analyser);
    // The ticks' chain is turned up once, at once, as it is made.
    expect(voices.calls).toEqual(["tick level 1 in 0 s"]);
  });

  it("REQ-SND-03 play loads the recording once, then loops it into the bed's chain at the bed's gain and resolves; the mix fades in", async () => {
    const load = vi.fn(() => Promise.resolve(recording));
    const session = createSoundSession(ctx, { load });
    voices.calls.length = 0;
    await session.play();
    expect(load).toHaveBeenCalledExactlyOnceWith(ctx, expect.any(AbortSignal));
    expect(voices.loopBed).toHaveBeenCalledExactlyOnceWith(
      ctx,
      voices.outputs[0]?.input,
      recording,
      0.5,
    );
    expect(voices.calls).toEqual(["bed level 1", "bed start"]);
    // A second play keeps the bed that plays, and loads nothing.
    await session.play();
    expect(voices.loopBed).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 the recording is loaded by default with voices.ts loadBed, for the bed the site plays, its fetch given the load's signal", async () => {
    voices.loadBed.mockResolvedValue(recording);
    const session = createSoundSession(ctx);
    await session.play();
    expect(voices.loadBed).toHaveBeenCalledExactlyOnceWith(
      ctx,
      { label: "Rain at sea", files: [], gain: 0.5 },
      expect.any(Function),
    );
    const fetchFile = voices.loadBed.mock.calls[0]?.[2] as (
      url: string,
    ) => Promise<Response>;
    const fetched = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetched);
    await fetchFile("/sound/bed.webm");
    expect(fetched).toHaveBeenCalledExactlyOnceWith("/sound/bed.webm", {
      signal: expect.any(AbortSignal),
    });
  });

  it("REQ-SND-01 A11 a recording that has not loaded in LOAD_LIMIT_MS is given up: its fetch aborted, the play rejected, and the next play fetches again (D-180)", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const load = vi.fn(
      (_context: AudioContext, signal: AbortSignal) =>
        new Promise<AudioBuffer>(() => {
          signals.push(signal);
        }),
    );
    const session = createSoundSession(ctx, { load });
    const first = session.play();
    const failed = expect(first).rejects.toThrow("did not load");
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS - 1);
    expect(signals[0]?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(signals[0]?.aborted).toBe(true);
    expect(voices.loopBed).not.toHaveBeenCalled();

    load.mockImplementationOnce(() => Promise.resolve(recording));
    await session.play();
    expect(load).toHaveBeenCalledTimes(2);
    expect(voices.loopBed).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 dispose aborts a load still under way (D-180)", () => {
    const signals: AbortSignal[] = [];
    const session = createSoundSession(ctx, {
      load: (_context, signal) =>
        new Promise<AudioBuffer>(() => {
          signals.push(signal);
        }),
    });
    void session.play().catch(() => undefined);
    session.dispose();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("REQ-SND-01 paused while its recording loads, nothing starts; the next play starts it with no second load", async () => {
    const recordingLoad = controlledLoad();
    const session = createSoundSession(ctx, { load: recordingLoad.load });
    const first = session.play();
    session.pause();
    recordingLoad.resolve(recording);
    await first;
    expect(voices.loopBed).not.toHaveBeenCalled();
    await session.play();
    expect(voices.loopBed).toHaveBeenCalledTimes(1);
    expect(recordingLoad.load).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 A11 a recording that will not load rejects the play, and the next play loads it again", async () => {
    const load = vi
      .fn<
        (context: AudioContext, signal: AbortSignal) => Promise<AudioBuffer>
      >()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(recording);
    const session = createSoundSession(ctx, { load });
    await expect(session.play()).rejects.toThrow("offline");
    expect(voices.loopBed).not.toHaveBeenCalled();
    await session.play();
    expect(load).toHaveBeenCalledTimes(2);
    expect(voices.loopBed).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 pause fades the bed's mix out and lets the bed go, leaving the ticks' chain up; the next play starts a new bed", async () => {
    const session = createSoundSession(ctx, {
      load: () => Promise.resolve(recording),
    });
    voices.calls.length = 0;
    await session.play();
    session.pause();
    expect(voices.calls).toEqual([
      "bed level 1",
      "bed start",
      "bed level 0",
      "bed stop",
    ]);
    session.pause();
    expect(voices.bed.stop).toHaveBeenCalledTimes(1);
    await session.play();
    expect(voices.loopBed).toHaveBeenCalledTimes(2);
  });

  it("REQ-SND-03 plays each tick into the ticks' chain, never the bed's, with no recording loaded", () => {
    const load = vi.fn();
    const session = createSoundSession(ctx, { load });
    session.tick("open");
    session.tick("hover");
    expect(voices.playTick).toHaveBeenCalledWith(
      ctx,
      voices.outputs[1]?.input,
      "open",
    );
    expect(voices.playTick).toHaveBeenLastCalledWith(
      ctx,
      voices.outputs[1]?.input,
      "hover",
    );
    expect(load).not.toHaveBeenCalled();
  });

  it("REQ-SND-01 dispose stops the bed and frees both chains, and a recording that arrives after starts nothing", async () => {
    const session = createSoundSession(ctx, {
      load: () => Promise.resolve(recording),
    });
    await session.play();
    session.dispose();
    expect(voices.calls.slice(-3)).toEqual([
      "bed stop",
      "bed dispose",
      "tick dispose",
    ]);

    const recordingLoad = controlledLoad();
    const late = createSoundSession(ctx, { load: recordingLoad.load });
    const playing = late.play();
    late.dispose();
    recordingLoad.resolve(recording);
    await playing;
    expect(voices.loopBed).toHaveBeenCalledTimes(1);
  });
});
