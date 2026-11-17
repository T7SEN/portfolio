// The sound itself (REQ-SND-03). The bed is rain at sea, T7SEN's pick on 14
// Nov 2026 after three rounds of listening on a page outside the site: calm
// sea and soft rain "Both blended", then "Softer overall ... quieter and
// darker" with the sea's shower-like hiss removed, then "Use it but make it
// very low by default". It was made live with Web Audio until 16 Nov 2026,
// when a phone could not keep up with its 3.2 s room and broke it up; it is
// now that same bed, recorded from the code that made it, played from a file
// (D-179). The ticks are still made here, with plain Web Audio and only
// erasable types, so a page outside the site can run a copy with its types
// stripped and play exactly what the site plays.

export type BedId = "rain-at-sea";

export type TickKind = "move" | "select" | "open" | "close" | "hover";

/** A playing bed. stop fades it out and frees its nodes. */
export interface Bed {
  stop(): void;
}

/** One recording of a bed, and the media type a browser is asked about. */
export interface BedFile {
  url: string;
  type: string;
}

export interface BedVoice {
  label: string;
  /** The recording in each format, in the order to try them. */
  files: readonly BedFile[];
  /**
   * The gain that plays the recording, normalised to -1 dBFS for its
   * encoding, at the bed's own level.
   */
  gain: number;
}

/** The output chain every sound goes through, with the analyser on it. */
export interface Output {
  /** Where beds and ticks connect. */
  input: AudioNode;
  /** Taps the mix for the strands' levels and the /about waveform. */
  analyser: AnalyserNode;
  /**
   * Fades the whole mix in or out over a short ramp; seconds 0 sets it at
   * once, for the ticks' chain, whose first tick a fade would swallow.
   */
  setLevel(level: number, seconds?: number): void;
  dispose(): void;
}

/** The bed the site plays. */
export const BED: BedId = "rain-at-sea";

// The whole mix sits well below full scale: the bed is a background, and the
// limiter only catches a tick landing on a swell.
const MIX_LEVEL = 0.5;
const MIX_RAMP_S = 0.6;
const BED_FADE_IN_S = 2.5;
const BED_FADE_OUT_S = 1.2;

/**
 * The ticks' room, in seconds. The bed had a 3.2 s room, which is in its
 * recording now; a second room that long, live for the ticks alone, cost a
 * phone as much again (D-179).
 */
export const TICK_ROOM_S = 1;

/**
 * Copies of the recording overlap by this much, the one ending fading out as
 * the next fades in, so the loop has no seam to hear.
 */
export const CROSSFADE_S = 4;

// The recording is the bed at RAIN_AT_SEA_LEVEL (0.07, "very low by default",
// then halved on 15 Nov 2026: "Lower by 25% more so it becomes 50% of what it
// was") through its room, its peak of 0.01283 raised to -1 dBFS for the
// encoding; this gain takes it back down, so the site plays it as loud as the
// live bed was.
const RAIN_AT_SEA_FILE_GAIN = 0.014404;

export const BEDS: Record<BedId, BedVoice> = {
  "rain-at-sea": {
    label: "Rain at sea",
    // Opus in WebM is the smaller (384 KB); AAC in MP4 (540 KB) is for a
    // browser that cannot decode Opus.
    files: [
      { url: "/sound/rain-at-sea.webm", type: 'audio/webm; codecs="opus"' },
      { url: "/sound/rain-at-sea.m4a", type: 'audio/mp4; codecs="mp4a.40.2"' },
    ],
    gain: RAIN_AT_SEA_FILE_GAIN,
  },
};

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    // Brown noise: white noise summed and leaking back to zero, soft and low
    // rather than the hiss of white noise.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

// A room made from decaying noise, so the reverb needs no recorded file.
function roomBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number,
): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/**
 * An output chain: a master level, a limiter and the analyser. With a room
 * of some seconds the sound also goes through a reverb that long (the
 * ticks); with none it goes straight to the master (the bed, whose room is
 * in its recording).
 */
export function createOutput(ctx: AudioContext, room = 0): Output {
  const input = ctx.createGain();
  const master = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  const analyser = ctx.createAnalyser();
  const nodes: AudioNode[] = [input, master, limiter, analyser];

  master.gain.value = 0;
  limiter.threshold.value = -18;
  limiter.ratio.value = 4;
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.8;

  if (room > 0) {
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = roomBuffer(ctx, room, 2.6);
    dry.gain.value = 0.8;
    wet.gain.value = 0.35;
    input.connect(dry).connect(master);
    input.connect(reverb).connect(wet).connect(master);
    nodes.push(dry, wet, reverb);
  } else {
    input.connect(master);
  }
  master.connect(limiter).connect(analyser).connect(ctx.destination);

  return {
    input,
    analyser,
    setLevel(level, seconds = MIX_RAMP_S) {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      if (seconds <= 0) {
        master.gain.setValueAtTime(level * MIX_LEVEL, now);
        return;
      }
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(level * MIX_LEVEL, now + seconds);
    },
    dispose() {
      for (const node of nodes) node.disconnect();
    },
  };
}

/** Whether the browser says it can play a media type, where it can say. */
function canPlayType(type: string): boolean {
  if (typeof Audio !== "function") return false;
  return new Audio().canPlayType(type) !== "";
}

/**
 * Fetches and decodes a bed's recording: the formats the browser says it
 * can play first, each of the others after, the next tried when one fails to
 * load or decode. Rejects with the last failure when none plays.
 */
export async function loadBed(
  ctx: BaseAudioContext,
  voice: BedVoice,
  fetchFile: (url: string) => Promise<Response> = (url) => fetch(url),
  canPlay: (type: string) => boolean = canPlayType,
): Promise<AudioBuffer> {
  const ordered = [
    ...voice.files.filter((file) => canPlay(file.type)),
    ...voice.files.filter((file) => !canPlay(file.type)),
  ];
  let failure: unknown = new Error("no recording to load");
  for (const file of ordered) {
    try {
      const response = await fetchFile(file.url);
      if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
      return await ctx.decodeAudioData(await response.arrayBuffer());
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

// Equal-power fades: two unrelated noises crossing keep their loudness.
const FADE_STEPS = 64;
const FADE_IN = Float32Array.from({ length: FADE_STEPS }, (_, i) =>
  Math.sin(((i / (FADE_STEPS - 1)) * Math.PI) / 2),
);
const FADE_OUT = Float32Array.from({ length: FADE_STEPS }, (_, i) =>
  Math.cos(((i / (FADE_STEPS - 1)) * Math.PI) / 2),
);

/**
 * Plays a recording as an endless loop at a level: copies of it start one
 * crossfade short of its length apart, each fading out over its last
 * CROSSFADE_S as the next fades in over its first, so no seam is heard,
 * whatever silence an encoder left at the file's ends. The first fades in
 * over BED_FADE_IN_S, as the live bed did. Two copies are always scheduled,
 * each one's end scheduling the next, so no timer keeps it going and a
 * hidden tab cannot starve it.
 */
export function loopBed(
  ctx: AudioContext,
  out: AudioNode,
  buffer: AudioBuffer,
  level: number,
): Bed {
  const gain = ctx.createGain();
  const start = ctx.currentTime + 0.05;
  // Silent from the start, not from start: a gain is made at 1, and a
  // stop before start would cancel the 0 and fade the recording out from
  // full level (D-180).
  gain.gain.value = 0;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + BED_FADE_IN_S);
  gain.connect(out);

  const span = buffer.duration;
  const fade = Math.min(CROSSFADE_S, span / 4);
  const every = span - fade;
  const playing = new Set<{
    source: AudioBufferSourceNode;
    amp: GainNode;
  }>();
  let next = start;
  let isFirst = true;
  let stopped = false;

  const play = () => {
    const at = next;
    next += every;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const amp = ctx.createGain();
    if (isFirst) {
      amp.gain.setValueAtTime(1, at);
      isFirst = false;
    } else {
      amp.gain.setValueCurveAtTime(FADE_IN, at, fade);
    }
    amp.gain.setValueCurveAtTime(FADE_OUT, at + every, fade);
    source.connect(amp).connect(gain);
    source.start(at);
    source.stop(at + span);
    const copy = { source, amp };
    playing.add(copy);
    source.onended = () => {
      playing.delete(copy);
      source.disconnect();
      amp.disconnect();
      if (!stopped) play();
    };
  };
  play();
  play();

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + BED_FADE_OUT_S);
      for (const { source } of playing) {
        source.stop(now + BED_FADE_OUT_S + 0.05);
      }
      setTimeout(
        () => {
          for (const { source, amp } of playing) {
            source.disconnect();
            amp.disconnect();
          }
          gain.disconnect();
        },
        (BED_FADE_OUT_S + 0.25) * 1000,
      );
    },
  };
}

function blip(
  ctx: AudioContext,
  out: AudioNode,
  frequency: number,
  at: number,
  level: number,
  decay: number,
): void {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(level, at + 0.002);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(amp).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.02);
  osc.onended = () => {
    osc.disconnect();
    amp.disconnect();
  };
}

// A short breath of filtered noise, sweeping up for open and down for close.
function sweep(
  ctx: AudioContext,
  out: AudioNode,
  from: number,
  to: number,
  level: number,
): void {
  const at = ctx.currentTime + 0.005;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.2);
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + 0.14);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(level, at + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  noise.connect(filter).connect(amp).connect(out);
  noise.start(at);
  noise.stop(at + 0.2);
  noise.onended = () => {
    noise.disconnect();
    filter.disconnect();
    amp.disconnect();
  };
}

// The hover sound [T7SEN, 15 Nov 2026]: "it needs to be a new sound, and it
// needs to be very soft". A rounded touch rather than a click: a low sine and
// its fifth, swelling in over 6 ms instead of striking, a quarter of a
// press's loudness, gone in under a tenth of a second.
function touch(ctx: AudioContext, out: AudioNode, at: number): void {
  for (const [frequency, level] of [
    [740, 0.012],
    [1110, 0.004],
  ] as const) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(level, at + 0.006);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
    osc.connect(amp).connect(out);
    osc.start(at);
    osc.stop(at + 0.1);
    osc.onended = () => {
      osc.disconnect();
      amp.disconnect();
    };
  }
}

/** One soft interface sound; the caller plays it only while sound is on. */
export function playTick(
  ctx: AudioContext,
  out: AudioNode,
  kind: TickKind,
): void {
  const at = ctx.currentTime + 0.005;
  switch (kind) {
    case "move":
      blip(ctx, out, 1800, at, 0.035, 0.04);
      break;
    case "select":
      blip(ctx, out, 1320, at, 0.045, 0.07);
      blip(ctx, out, 1760, at + 0.045, 0.04, 0.09);
      break;
    case "open":
      sweep(ctx, out, 400, 2000, 0.09);
      blip(ctx, out, 660, at + 0.06, 0.02, 0.12);
      break;
    case "close":
      sweep(ctx, out, 2000, 400, 0.07);
      break;
    case "hover":
      touch(ctx, out, at);
      break;
  }
}
