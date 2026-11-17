// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { BEDS, CROSSFADE_S, loadBed, loopBed, type BedVoice } from "./voices";

const voice: BedVoice = {
  label: "Test bed",
  files: [
    { url: "/a.webm", type: "audio/webm" },
    { url: "/b.m4a", type: "audio/mp4" },
  ],
  gain: 0.5,
};

function response(ok: boolean, name: string) {
  return {
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: () => Promise.resolve(name as unknown as ArrayBuffer),
  } as unknown as Response;
}

function decoder(fails: readonly string[] = []) {
  return {
    decodeAudioData: vi.fn((data: ArrayBuffer) => {
      const name = data as unknown as string;
      return fails.includes(name)
        ? Promise.reject(new Error(`cannot decode ${name}`))
        : Promise.resolve({ name } as unknown as AudioBuffer);
    }),
  } as unknown as BaseAudioContext;
}

describe("the bed's recording", () => {
  it("REQ-SND-03 the site's bed is one recording in two formats, Opus first, with the gain that gives back its level", () => {
    const bed = BEDS["rain-at-sea"];
    expect(bed.files.map((file) => file.url)).toEqual([
      "/sound/rain-at-sea.webm",
      "/sound/rain-at-sea.m4a",
    ]);
    expect(bed.gain).toBeGreaterThan(0);
    expect(bed.gain).toBeLessThan(0.1);
  });

  it("REQ-SND-01 loads the first format the browser says it can play, and decodes it", async () => {
    const fetchFile = vi.fn((url: string) =>
      Promise.resolve(response(true, url)),
    );
    const buffer = await loadBed(
      decoder(),
      voice,
      fetchFile,
      (type) => type === "audio/mp4",
    );
    expect(fetchFile).toHaveBeenCalledExactlyOnceWith("/b.m4a");
    expect(buffer).toEqual({ name: "/b.m4a" });
  });

  it("REQ-SND-01 A11 a file that will not load or decode gives way to the next; with none, the last failure", async () => {
    const missing = vi.fn((url: string) =>
      Promise.resolve(response(url !== "/a.webm", url)),
    );
    await expect(
      loadBed(decoder(), voice, missing, () => true),
    ).resolves.toEqual({ name: "/b.m4a" });

    const undecodable = vi.fn((url: string) =>
      Promise.resolve(response(true, url)),
    );
    await expect(
      loadBed(decoder(["/a.webm"]), voice, undecodable, () => true),
    ).resolves.toEqual({ name: "/b.m4a" });

    const offline = vi.fn(() => Promise.reject(new Error("offline")));
    await expect(
      loadBed(decoder(), voice, offline, () => true),
    ).rejects.toThrow("offline");
    expect(offline).toHaveBeenCalledTimes(2);
  });
});

type Recorded = Array<[string, ...number[]]>;

/**
 * An AudioParam that records its calls and, like a real one, reads back the
 * value its automation gives at the context's time: a gain is made at 1,
 * value sets it until an event, a set holds from its time, a ramp runs
 * linearly from the event before it, a curve ends on its last value, and a
 * cancel drops every event at or after its time. As in a browser, the value
 * read is the one last rendered, so a cancel leaves it as it was until the
 * context's time moves on.
 */
function fakeParam(calls: Recorded, clock: () => number) {
  let base = 1;
  let held: { at: number; value: number } | null = null;
  const events: Array<{ kind: "set" | "ramp"; value: number; at: number }> = [];
  const valueAt = (time: number) => {
    let value = base;
    let from = { value: base, at: Number.NEGATIVE_INFINITY };
    for (const event of [...events].sort((a, b) => a.at - b.at)) {
      if (event.at <= time) {
        value = event.value;
        from = event;
        continue;
      }
      if (event.kind === "ramp" && Number.isFinite(from.at)) {
        const share = (time - from.at) / (event.at - from.at);
        value = from.value + share * (event.value - from.value);
      }
      break;
    }
    return value;
  };
  return {
    get value() {
      const now = clock();
      return held !== null && held.at === now ? held.value : valueAt(now);
    },
    set value(value: number) {
      base = value;
    },
    setValueAtTime: (value: number, at: number) => {
      events.push({ kind: "set", value, at });
      calls.push(["set", value, at]);
    },
    linearRampToValueAtTime: (value: number, at: number) => {
      events.push({ kind: "ramp", value, at });
      calls.push(["ramp", value, at]);
    },
    setValueCurveAtTime: (curve: Float32Array, at: number, seconds: number) => {
      events.push({ kind: "set", value: curve.at(-1) ?? 0, at: at + seconds });
      calls.push([(curve[0] ?? 0) < 0.5 ? "fade in" : "fade out", at, seconds]);
    },
    cancelScheduledValues: (at: number) => {
      held = { at: clock(), value: valueAt(clock()) };
      for (let index = events.length - 1; index >= 0; index -= 1) {
        if ((events[index]?.at ?? 0) >= at) events.splice(index, 1);
      }
      calls.push(["cancel", at]);
    },
  };
}

function fakeContext(now = 10) {
  const master: Recorded = [];
  const copies: Array<{
    gain: Recorded;
    starts: number[];
    stops: number[];
    end: () => void;
  }> = [];
  let gains = 0;
  const made: Array<{ disconnect: ReturnType<typeof vi.fn> }> = [];
  const node = () => {
    const entry = { connect: (next: unknown) => next, disconnect: vi.fn() };
    made.push(entry);
    return entry;
  };
  const clock = () => ctx.currentTime;
  const ctx = {
    currentTime: now,
    createGain: () => {
      gains += 1;
      // The bed's own gain is made first; each copy's after its source.
      const calls: Recorded = gains === 1 ? master : [];
      if (gains > 1) {
        const copy = copies.at(-1);
        if (copy) copy.gain = calls;
      }
      return { ...node(), gain: fakeParam(calls, clock) };
    },
    createBufferSource: () => {
      const copy: (typeof copies)[number] = {
        gain: [],
        starts: [],
        stops: [],
        end: () => undefined,
      };
      copies.push(copy);
      const source = {
        ...node(),
        buffer: null as unknown,
        onended: null as null | (() => void),
        start: (at: number) => copy.starts.push(at),
        stop: (at: number) => copy.stops.push(at),
      };
      copy.end = () => source.onended?.();
      return source;
    },
  };
  return { ctx: ctx as unknown as AudioContext, master, copies, made };
}

const recording = { duration: 54 } as unknown as AudioBuffer;
const out = {} as AudioNode;

describe("the bed's loop", () => {
  it("REQ-SND-03 fades the bed in, then plays copies of the recording a crossfade short of its length apart, each fading out as the next fades in", () => {
    const { ctx, master, copies } = fakeContext(10);
    loopBed(ctx, out, recording, 0.5);
    const start = 10.05;
    const every = 54 - CROSSFADE_S;
    expect(master).toEqual([
      ["set", 0, start],
      ["ramp", 0.5, start + 2.5],
    ]);
    expect(copies).toHaveLength(2);
    expect(copies[0]?.starts).toEqual([start]);
    expect(copies[0]?.stops).toEqual([start + 54]);
    expect(copies[0]?.gain).toEqual([
      ["set", 1, start],
      ["fade out", start + every, CROSSFADE_S],
    ]);
    expect(copies[1]?.starts).toEqual([start + every]);
    expect(copies[1]?.gain).toEqual([
      ["fade in", start + every, CROSSFADE_S],
      ["fade out", start + 2 * every, CROSSFADE_S],
    ]);
  });

  it("REQ-SND-03 each copy's end schedules the next, so two are always ahead and no timer keeps it going", () => {
    const { ctx, copies } = fakeContext(10);
    loopBed(ctx, out, recording, 0.5);
    copies[0]?.end();
    expect(copies).toHaveLength(3);
    expect(copies[2]?.starts).toEqual([10.05 + 2 * (54 - CROSSFADE_S)]);
  });

  it("REQ-SND-01 stop fades the bed out from its level, stops every copy after the fade, schedules no more and lets every node go", () => {
    vi.useFakeTimers();
    try {
      const { ctx, master, copies, made } = fakeContext(10);
      const bed = loopBed(ctx, out, recording, 0.5);
      (ctx as unknown as { currentTime: number }).currentTime = 20;
      bed.stop();
      expect(master.slice(-3)).toEqual([
        ["cancel", 20],
        ["set", 0.5, 20],
        ["ramp", 0, 21.2],
      ]);
      expect(copies[0]?.stops.at(-1)).toBeCloseTo(21.25, 5);
      expect(copies[1]?.stops.at(-1)).toBeCloseTo(21.25, 5);
      copies[0]?.end();
      expect(copies).toHaveLength(2);
      bed.stop();
      expect(master).toHaveLength(5);
      vi.advanceTimersByTime(1_450);
      for (const node of made) expect(node.disconnect).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("REQ-SND-01 a stop before the bed has started fades out from silence, never from full level (D-180)", () => {
    const { ctx, master } = fakeContext(10);
    const bed = loopBed(ctx, out, recording, 0.5);
    (ctx as unknown as { currentTime: number }).currentTime = 10.01;
    bed.stop();
    expect(master.slice(-3)).toEqual([
      ["cancel", 10.01],
      ["set", 0, 10.01],
      ["ramp", 0, 10.01 + 1.2],
    ]);
    // Half way through the fade in it fades out from half the level.
    const later = fakeContext(10);
    const fading = loopBed(later.ctx, out, recording, 0.5);
    (later.ctx as unknown as { currentTime: number }).currentTime = 11.3;
    fading.stop();
    expect(later.master.at(-2)).toEqual(["set", 0.25, 11.3]);
  });

  it("REQ-SND-03 a short recording still crosses over, a quarter of its length", () => {
    const { ctx, copies } = fakeContext(0);
    loopBed(ctx, out, { duration: 8 } as unknown as AudioBuffer, 0.5);
    expect(copies[1]?.starts).toEqual([0.05 + 6]);
    expect(copies[1]?.gain[0]).toEqual(["fade in", 6.05, 2]);
  });
});
