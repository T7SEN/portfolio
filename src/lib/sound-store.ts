import {
  createStrandMeter,
  follow,
  type Spectrum,
} from "@/components/sound/levels";
import type { SoundSession } from "@/components/sound/sound-session";
import type { TickKind } from "@/components/sound/voices";
import type { AudioLevels } from "@/engine/story";

import {
  readSoundChoice,
  readTicksChoice,
  writeSoundChoice,
  writeTicksChoice,
} from "./sound-choice";
import { storyBridge, type StoryBridge } from "./story-bridge";

/**
 * The background's state (the bed, rain at sea). off: silent, the state on
 * every load (REQ-SND-01). waiting: the visitor left the background on at an
 * earlier visit and this page has had no click, tap or key yet; still
 * silent, with no AudioContext, until the first one starts it. starting:
 * turned on, the context resuming or the sound's code still loading. on:
 * playing. failed: the browser has no Web Audio, or the context or the code
 * would not start; the pill and the panel show it and a press tries again
 * (rule A11).
 */
export type SoundStatus = "off" | "waiting" | "starting" | "on" | "failed";

/**
 * The interface sounds' state (the ticks). on: chosen, whether or not the
 * context runs yet; the first press that ticks starts it. failed: as for
 * the background.
 */
export type TicksStatus = "off" | "on" | "failed";

export type SoundSnapshot = {
  /** The background. */
  readonly status: SoundStatus;
  /** The interface sounds. */
  readonly ticks: TicksStatus;
};

/**
 * Called with each frame's spectrum while the background plays and the tab
 * shows, and the time since the last frame (0 on the first frame of a run).
 */
export type SpectrumReader = (spectrum: Spectrum, elapsedMs: number) => void;

export type SoundStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): SoundSnapshot;
  getServerSnapshot(): SoundSnapshot;
  /**
   * Turns the background over. Call it inside the click or key handler: the
   * first press creates and resumes the one AudioContext there, within the
   * gesture the browser asks for, then loads the rest by dynamic import.
   * While waiting it turns the background off, as the switch shows it on.
   */
  toggleBackground(): void;
  /** Turns the interface sounds over, inside the press, the same way. */
  toggleTicks(): void;
  /**
   * While the background waits, starts it inside the caller's press. The
   * pill's own click is a first click like any other, as its note says, but
   * the window's listener leaves sound controls to their handlers, so the
   * pill calls this before it opens its panel. Does nothing otherwise.
   */
  resumeWaiting(): void;
  /**
   * One interface sound, while the interface sounds are on. A press tick
   * (every kind but hover) is itself a gesture, so when the context is not
   * running yet it creates or resumes it inside the caller's handler and
   * plays once the sound's code is ready. A hover never wakes the sound: one
   * before any press this visit stays silent.
   */
  tick(kind: TickKind): void;
  /**
   * How many press ticks have been asked for, on or off: the tick listener
   * reads it before and after a click, so a press that already ticked (a
   * dialog opening, a palette row) is not ticked again.
   */
  ticksAsked(): number;
  /** The background's analyser while it plays, else null. */
  getAnalyser(): AnalyserNode | null;
  /**
   * Hands each frame's spectrum to the reader, from the store's one frame
   * loop (the bar's level bars, the /about waveform). Returns the
   * unsubscribe.
   */
  subscribeSpectrum(reader: SpectrumReader): () => void;
};

type SessionModule = {
  createSoundSession(ctx: AudioContext): SoundSession;
};

export type SoundStoreOptions = {
  /** The browser window; read when first needed, never at import. */
  win?: () => Window | undefined;
  /** Returns null where the browser has no Web Audio. */
  createContext?: (win: Window) => AudioContext | null;
  loadSession?: () => Promise<SessionModule>;
  bridge?: Pick<StoryBridge, "setAudio">;
  /** The clock for a press tick's freshness, in ms. */
  now?: () => number;
};

/** The bed fades out over 1.2 s (voices.ts); the context sleeps after it. */
export const SUSPEND_AFTER_MS = 1500;

/**
 * A context still not running this long after the press counts as failed:
 * the browser held it, which a press inside the gesture should never meet.
 */
export const START_LIMIT_MS = 5000;

/**
 * A press tick asked for while the sound's code loads plays once it is
 * ready, but only this soon after the press: later, it would no longer
 * sound like the press.
 */
export const LATE_TICK_MS = 250;

const SNAPSHOTS = new Map<string, SoundSnapshot>();

function snapshotOf(status: SoundStatus, ticks: TicksStatus): SoundSnapshot {
  const key = `${status}:${ticks}`;
  let snapshot = SNAPSHOTS.get(key);
  if (snapshot === undefined) {
    snapshot = Object.freeze({ status, ticks });
    SNAPSHOTS.set(key, snapshot);
  }
  return snapshot;
}

const SILENT: AudioLevels = [0, 0, 0];

/**
 * The events a browser counts as user activation (HTML's activation
 * triggering input events), which a Web Audio context needs before it may
 * play. A touch counts on its way up, so pointerup and touchend are heard as
 * well as the downs; mousedown follows pointerdown in case a browser counts
 * only the mouse event. Scrolling and the wheel never count.
 */
export const GESTURES = [
  "pointerdown",
  "mousedown",
  "pointerup",
  "touchend",
  "keydown",
] as const;

// Escape, and a modifier or lock key pressed alone: the browser does not
// count them, and none is a visitor reaching for the page.
const QUIET_KEYS: ReadonlySet<string> = new Set([
  "Escape",
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Super",
  "Hyper",
  "Fn",
  "FnLock",
  "CapsLock",
  "NumLock",
  "ScrollLock",
  "Symbol",
  "SymbolLock",
]);

/**
 * Marks a control of the sound itself: the pill, the panel's two switches,
 * the palette's two sound rows. While the background waits, the window
 * leaves a press on one to the control's own handler, so opening the panel
 * or turning a setting over never also starts the background.
 */
export const SOUND_CONTROL_ATTRIBUTE = "data-sound-control";
const SOUND_CONTROL = `[${SOUND_CONTROL_ATTRIBUTE}]`;

function elementOf(target: EventTarget | null): Element | null {
  return target !== null && typeof (target as Element).closest === "function"
    ? (target as Element)
    : null;
}

function countsAsActivation(event: Event): boolean {
  switch (event.type) {
    case "keydown":
      return !QUIET_KEYS.has((event as KeyboardEvent).key);
    case "pointerdown":
      return (event as PointerEvent).pointerType === "mouse";
    case "pointerup":
      return (event as PointerEvent).pointerType !== "mouse";
    default:
      return true;
  }
}

// A press that a sound control will act on: a pointer on it, Enter or Space
// on it (its click follows), or Enter in a search whose active option is one
// (the palette keeps focus in its search while Enter runs the active row).
function pressesSoundControl(event: Event): boolean {
  const element = elementOf(event.target);
  if (element === null) return false;
  if (event.type !== "keydown") return element.closest(SOUND_CONTROL) !== null;
  const { key } = event as KeyboardEvent;
  if (key !== "Enter" && key !== " ") return false;
  if (element.closest(SOUND_CONTROL) !== null) return true;
  const active = element.getAttribute("aria-activedescendant");
  if (key !== "Enter" || active === null || active === "") return false;
  const option = element.ownerDocument.getElementById(active);
  return option?.closest(SOUND_CONTROL) != null;
}

type ActivationNavigator = { userActivation?: { hasBeenActive: boolean } };

// Where the browser says whether the page has had user activation, believe
// it: an event it did not count leaves a context unable to play, so no
// context is made for it. Where it does not say, the start finds out.
function browserCounted(win: Window): boolean {
  const activation = (win.navigator as ActivationNavigator | undefined)
    ?.userActivation;
  return activation === undefined || activation.hasBeenActive;
}

// The constructors as a window holds them; older Safari has only the
// prefixed one.
type AudioWindow = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function browserContext(win: Window): AudioContext | null {
  const { AudioContext: Context = undefined, webkitAudioContext = undefined } =
    win as unknown as AudioWindow;
  const Made = Context ?? webkitAudioContext;
  return typeof Made === "function" ? new Made() : null;
}

const loadDefaultSession = (): Promise<SessionModule> =>
  import("@/components/sound/sound-session");

function browserWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

function logFailure(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("sound: failed", error);
  }
}

// The context made and resumed inside the press, and the session once the
// context runs and the code has loaded; or why it could not start.
type Wake =
  { ctx: AudioContext; ready: Promise<SoundSession> } | { error: unknown };

/**
 * The site's sound (phase P5), in two settings the visitor turns on and off
 * apart [T7SEN, 15 Nov 2026]: the background (the bed) and the interface
 * sounds (the ticks). Plain logic with no React, read through
 * useSyncExternalStore like the calm store. Silent on load: no AudioContext
 * exists before a press (REQ-SND-01), and the bed, the ticks and the output
 * chain arrive with the first press that needs them (REQ-PERF-04). Both
 * share the one context and the one session. While the background plays,
 * one frame loop reads its analyser, sends the strands their levels and
 * hands the spectrum to the bars that follow it; the ticks have a chain of
 * their own, so the strands and bars follow the background alone.
 *
 * Each setting is saved in the browser (sound-choice.ts): "on" once it
 * plays, "off" when it is turned off. Both are read by the first
 * subscriber, after hydration, so the server and the first client render
 * agree (off). A visitor who left the background on finds it waiting, and
 * the first click, tap or key on the page starts it inside that event
 * [T7SEN, 15 Nov 2026]; one who left the interface sounds on hears the first
 * press that ticks, which starts the context itself.
 */
export function createSoundStore(options: SoundStoreOptions = {}): SoundStore {
  const getWin = options.win ?? browserWindow;
  const createContext = options.createContext ?? browserContext;
  const loadSession = options.loadSession ?? loadDefaultSession;
  const bridge = options.bridge ?? storyBridge;
  const now = options.now ?? (() => Date.now());

  const listeners = new Set<() => void>();
  const readers = new Set<SpectrumReader>();
  let status: SoundStatus = "off";
  let ticks: TicksStatus = "off";
  let context: AudioContext | null = null;
  let session: SoundSession | null = null;
  let loading: Promise<SoundSession> | null = null;
  // Each press starts a new attempt; a later press makes an older one moot.
  let attempt = 0;
  let ticksAttempt = 0;
  // A start of the interface sounds is on its way: a press tick waits for it.
  let isWakingTicks = false;
  let pendingTick: { kind: TickKind; at: number } | null = null;
  let asked = 0;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let ticksTimer: ReturnType<typeof setTimeout> | null = null;

  let frame = 0;
  let lastFrameAt: number | null = null;
  let bins: Uint8Array<ArrayBuffer> | null = null;
  let levels: AudioLevels = SILENT;
  // Fresh for each time the background turns on, so its means start from it.
  let strands = createStrandMeter();
  let watchingVisibility = false;
  let watchingGestures = false;
  // The saved choices are read once, by the first subscriber.
  let isRestored = false;

  function notify() {
    for (const listener of [...listeners]) listener();
  }

  function setState(next: SoundStatus, nextTicks: TicksStatus = ticks) {
    if (next === status && nextTicks === ticks) return;
    status = next;
    ticks = nextTicks;
    watchGestures(status === "waiting");
    notify();
  }

  const setStatus = (next: SoundStatus) => setState(next);
  const setTicks = (next: TicksStatus) => setState(status, next);

  // While waiting: the first click, tap or key the browser counts starts the
  // background, inside its own handler. Capture on the window, so a control
  // that stops the event's travel still lets it through.
  const onGesture = (event: Event) => {
    if (status !== "waiting") return;
    if (!countsAsActivation(event) || pressesSoundControl(event)) return;
    const win = getWin();
    if (win === undefined || !browserCounted(win)) return;
    start(true);
  };

  function watchGestures(on: boolean) {
    const win = getWin();
    if (win === undefined || on === watchingGestures) return;
    watchingGestures = on;
    for (const type of GESTURES) {
      if (on) {
        win.addEventListener(type, onGesture, { capture: true, passive: true });
      } else {
        win.removeEventListener(type, onGesture, { capture: true });
      }
    }
  }

  function restore() {
    if (isRestored) return;
    isRestored = true;
    const win = getWin();
    const nextStatus =
      status === "off" && readSoundChoice(win) === "on" ? "waiting" : status;
    const nextTicks =
      ticks === "off" && readTicksChoice(win) === "on" ? "on" : ticks;
    setState(nextStatus, nextTicks);
  }

  // The context stays awake while either setting may play.
  function isWanted(): boolean {
    return status === "on" || status === "starting" || ticks === "on";
  }

  function clearSuspend() {
    if (suspendTimer !== null) clearTimeout(suspendTimer);
    suspendTimer = null;
  }

  function clearStart() {
    if (startTimer !== null) clearTimeout(startTimer);
    startTimer = null;
  }

  function clearTicksTimer() {
    if (ticksTimer !== null) clearTimeout(ticksTimer);
    ticksTimer = null;
  }

  // The frame loop: on while the background plays and the tab shows.
  function isHidden(): boolean {
    return getWin()?.document.visibilityState === "hidden";
  }

  function readFrame(at: number) {
    frame = 0;
    const win = getWin();
    const analyser = status === "on" ? (session?.analyser ?? null) : null;
    if (win === undefined || analyser === null || context === null) return;
    if (bins?.length !== analyser.frequencyBinCount) {
      bins = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(bins);
    const spectrum: Spectrum = {
      bins,
      binHz: context.sampleRate / analyser.fftSize,
    };
    const elapsed = lastFrameAt === null ? 0 : at - lastFrameAt;
    lastFrameAt = at;
    const heard = strands(spectrum, elapsed);
    levels = [
      follow(levels[0], heard[0], elapsed),
      follow(levels[1], heard[1], elapsed),
      follow(levels[2], heard[2], elapsed),
    ];
    bridge.setAudio(levels);
    for (const reader of [...readers]) reader(spectrum, elapsed);
    frame = win.requestAnimationFrame(readFrame);
  }

  function startFrames() {
    const win = getWin();
    if (win === undefined || frame !== 0 || isHidden()) return;
    lastFrameAt = null;
    frame = win.requestAnimationFrame(readFrame);
  }

  function stopFrames() {
    if (frame !== 0) getWin()?.cancelAnimationFrame(frame);
    frame = 0;
    lastFrameAt = null;
  }

  // A hidden tab draws no frames; the loop stops and picks up on return.
  const onVisibility = () => {
    if (isHidden()) stopFrames();
    else if (status === "on") startFrames();
  };

  function watchVisibility(on: boolean) {
    const doc = getWin()?.document;
    if (doc === undefined || on === watchingVisibility) return;
    watchingVisibility = on;
    if (on) doc.addEventListener("visibilitychange", onVisibility);
    else doc.removeEventListener("visibilitychange", onVisibility);
  }

  function silence() {
    stopFrames();
    watchVisibility(false);
    levels = SILENT;
    strands = createStrandMeter();
    bridge.setAudio(null);
  }

  function sleepLater(ctx: AudioContext) {
    clearSuspend();
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if (isWanted()) return;
      ctx.suspend().catch(() => undefined);
    }, SUSPEND_AFTER_MS);
  }

  function sleepIfUnwanted() {
    if (context !== null && !isWanted()) sleepLater(context);
  }

  function fail(error: unknown) {
    logFailure(error);
    attempt += 1;
    clearStart();
    silence();
    try {
      session?.pause();
    } catch {
      // A chain that broke while starting has nothing left to fade.
    }
    setStatus("failed");
    sleepIfUnwanted();
  }

  // A context the browser would not let play. After a press that is a
  // failure (rule A11); for a returning visitor's background it means the
  // event did not count, so the page waits for the next one.
  function held(error: Error, fromWaiting: boolean) {
    if (!fromWaiting) {
      fail(error);
      return;
    }
    attempt += 1;
    clearStart();
    setStatus("waiting");
  }

  function failTicks(error: unknown) {
    logFailure(error);
    ticksAttempt += 1;
    isWakingTicks = false;
    pendingTick = null;
    clearTicksTimer();
    setTicks("failed");
    sleepIfUnwanted();
  }

  function sessionFor(ctx: AudioContext): Promise<SoundSession> {
    if (session !== null) return Promise.resolve(session);
    loading ??= loadSession()
      .then((module) => {
        session = module.createSoundSession(ctx);
        return session;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  // Synchronously, inside the press: the browser lets a context start only
  // within a gesture. A context already running is left as it is.
  function wake(win: Window): Wake {
    let ctx = context;
    if (ctx === null) {
      try {
        ctx = createContext(win);
      } catch (error) {
        return { error };
      }
      if (ctx === null) return { error: new Error("no Web Audio") };
      context = ctx;
    }
    clearSuspend();
    let resumed: Promise<void>;
    try {
      resumed = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    } catch (error) {
      return { error };
    }
    const started = ctx;
    return {
      ctx: started,
      ready: Promise.all([resumed, sessionFor(started)]).then(
        ([, ready]) => ready,
      ),
    };
  }

  function playTick(ready: SoundSession, kind: TickKind) {
    try {
      ready.tick(kind);
    } catch (error) {
      // A tick is a nicety: a failed one never breaks the control that
      // asked for it.
      logFailure(error);
    }
  }

  // The press tick asked for while the sound's code loaded, if still fresh.
  function playPending(ready: SoundSession) {
    const pending = pendingTick;
    pendingTick = null;
    if (pending === null || ticks !== "on") return;
    if (now() - pending.at > LATE_TICK_MS) return;
    playTick(ready, pending.kind);
  }

  function start(fromWaiting: boolean) {
    const win = getWin();
    if (win === undefined) return;
    clearStart();
    const woken = wake(win);
    if ("error" in woken) {
      fail(woken.error);
      return;
    }

    attempt += 1;
    const current = attempt;
    setStatus("starting");

    const started = woken.ctx;
    startTimer = setTimeout(() => {
      startTimer = null;
      if (current === attempt && started.state !== "running") {
        held(new Error("context held"), fromWaiting);
      }
    }, START_LIMIT_MS);

    woken.ready.then(
      (ready) => {
        if (current !== attempt) return;
        clearStart();
        if (started.state !== "running") {
          held(new Error(`context ${started.state}`), fromWaiting);
          return;
        }
        let playing: Promise<void>;
        try {
          playing = ready.play();
        } catch (error) {
          fail(error);
          return;
        }
        // The press's own tick at once: the bed's recording may still be
        // loading (D-179), and the tick needs none of it.
        playPending(ready);
        playing.then(
          () => {
            if (current !== attempt) return;
            setStatus("on");
            // Saved only once it plays: a start that fails changes nothing.
            writeSoundChoice(getWin(), "on");
            watchVisibility(true);
            startFrames();
          },
          (error: unknown) => {
            if (current === attempt) fail(error);
          },
        );
      },
      (error: unknown) => {
        if (current === attempt) fail(error);
      },
    );
  }

  function stop() {
    attempt += 1;
    clearStart();
    silence();
    setStatus("off");
    writeSoundChoice(getWin(), "off");
    try {
      session?.pause();
    } catch (error) {
      logFailure(error);
    }
    sleepIfUnwanted();
  }

  // explicit: the visitor turned the interface sounds on, so a context the
  // browser holds is a failure they see (rule A11). Otherwise it is a press
  // of a returning visitor's that the browser did not count, and the next
  // press tries again.
  function startTicks(explicit: boolean) {
    const win = getWin();
    if (win === undefined) return;
    const woken = wake(win);
    if ("error" in woken) {
      failTicks(woken.error);
      return;
    }
    ticksAttempt += 1;
    const current = ticksAttempt;
    isWakingTicks = true;
    clearTicksTimer();
    const started = woken.ctx;
    // A start that has not settled by the limit is over either way: turned
    // on, a held context fails where the visitor sees it; for a returning
    // visitor's press it is dropped, so the next press tries again and the
    // interface sounds are never left silent behind a pill that says on.
    ticksTimer = setTimeout(() => {
      ticksTimer = null;
      if (current !== ticksAttempt) return;
      if (explicit && started.state !== "running") {
        failTicks(new Error("context held"));
        return;
      }
      ticksAttempt += 1;
      isWakingTicks = false;
      pendingTick = null;
    }, START_LIMIT_MS);

    woken.ready.then(
      (ready) => {
        if (current !== ticksAttempt) return;
        isWakingTicks = false;
        clearTicksTimer();
        if (ticks !== "on") return;
        if (started.state !== "running") {
          if (explicit) failTicks(new Error(`context ${started.state}`));
          else pendingTick = null;
          return;
        }
        writeTicksChoice(getWin(), "on");
        playPending(ready);
      },
      (error: unknown) => {
        if (current === ticksAttempt) failTicks(error);
      },
    );
  }

  function stopTicks() {
    ticksAttempt += 1;
    isWakingTicks = false;
    pendingTick = null;
    clearTicksTimer();
    setTicks("off");
    writeTicksChoice(getWin(), "off");
    sleepIfUnwanted();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      // Subscribers come from effects, which run only in the browser after
      // hydration: never during the server render or the hydrating one.
      restore();
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshotOf(status, ticks),
    getServerSnapshot: () => snapshotOf("off", "off"),

    toggleBackground() {
      if (status === "off" || status === "failed") start(false);
      else stop();
    },

    toggleTicks() {
      if (ticks === "on") {
        stopTicks();
        return;
      }
      setTicks("on");
      startTicks(true);
    },

    resumeWaiting() {
      const win = getWin();
      if (status !== "waiting" || win === undefined) return;
      if (!browserCounted(win)) return;
      start(true);
    },

    tick(kind) {
      if (kind !== "hover") asked += 1;
      if (ticks !== "on") return;
      if (session !== null && context?.state === "running" && !isWakingTicks) {
        playTick(session, kind);
        return;
      }
      if (kind === "hover") return;
      const win = getWin();
      if (win === undefined || !browserCounted(win)) return;
      pendingTick = { kind, at: now() };
      if (!isWakingTicks) startTicks(false);
    },

    ticksAsked: () => asked,

    getAnalyser: () => (status === "on" ? (session?.analyser ?? null) : null),

    subscribeSpectrum(reader) {
      readers.add(reader);
      return () => {
        readers.delete(reader);
      };
    },
  };
}

export const soundStore = createSoundStore();
