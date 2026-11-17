import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

import type { SoundSession } from "@/components/sound/sound-session";
import type { AudioLevels } from "@/engine/story";

import { SOUND_KEY, TICKS_KEY } from "./sound-choice";
import {
  createSoundStore,
  GESTURES,
  LATE_TICK_MS,
  SOUND_CONTROL_ATTRIBUTE,
  SUSPEND_AFTER_MS,
  START_LIMIT_MS,
  type SoundStoreOptions,
} from "./sound-store";

// A context that starts suspended, as a browser makes one outside a gesture,
// and runs once resumed.
class FakeContext {
  state: AudioContextState = "suspended";
  readonly sampleRate = 48_000;
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  suspend = vi.fn(() => {
    this.state = "suspended";
    return Promise.resolve();
  });
}

function fakeAnalyser(level: number) {
  return {
    frequencyBinCount: 512,
    fftSize: 1024,
    getByteFrequencyData: vi.fn((bins: Uint8Array) => bins.fill(level)),
  };
}

function fakeSession(level = 200) {
  return {
    analyser: fakeAnalyser(level) as unknown as AnalyserNode,
    // Resolves once the bed plays: at once here, its recording at hand.
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    tick: vi.fn(),
    dispose: vi.fn(),
  } satisfies SoundSession;
}

// Local storage as a map; blocked, its getter throws as a browser's does.
function fakeStorage(saved: string | null, ticksSaved: string | null) {
  const values = new Map<string, string>();
  if (saved !== null) values.set(SOUND_KEY, saved);
  if (ticksSaved !== null) values.set(TICKS_KEY, ticksSaved);
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: (key: string) => {
        values.delete(key);
      },
    },
  };
}

// The listeners a store puts on the page's window, removed after each test
// so a store left waiting never hears a later test's events.
const onPage = new Set<() => void>();

type WindowOptions = {
  /** The background's saved choice; null for none. */
  saved?: string | null;
  /** The interface sounds' saved choice; null for none. */
  ticksSaved?: string | null;
  isStorageBlocked?: boolean;
  /** navigator.userActivation, where the browser has it. */
  activation?: { hasBeenActive: boolean };
};

// A window whose frames run only when the test says so. Its event listeners
// go on jsdom's window, so events dispatched on the page reach them.
function fakeWindow(options: WindowOptions = {}) {
  const frames = new Map<number, FrameRequestCallback>();
  const visibility = new Set<() => void>();
  const listening = new Set<string>();
  let next = 1;
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      visibility.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      visibility.delete(listener);
    }),
  };
  const { storage, values } = fakeStorage(
    options.saved ?? null,
    options.ticksSaved ?? null,
  );
  const win: Record<string, unknown> = {
    document: doc,
    requestAnimationFrame: vi.fn((run: FrameRequestCallback) => {
      frames.set(next, run);
      return next++;
    }),
    cancelAnimationFrame: vi.fn((handle: number) => {
      frames.delete(handle);
    }),
    addEventListener: vi.fn(
      (
        type: string,
        listener: EventListener,
        listenerOptions?: AddEventListenerOptions,
      ) => {
        listening.add(type);
        window.addEventListener(type, listener, listenerOptions);
        onPage.add(() =>
          window.removeEventListener(type, listener, listenerOptions),
        );
      },
    ),
    removeEventListener: vi.fn(
      (
        type: string,
        listener: EventListener,
        listenerOptions?: EventListenerOptions,
      ) => {
        listening.delete(type);
        window.removeEventListener(type, listener, listenerOptions);
      },
    ),
  };
  if (options.isStorageBlocked === true) {
    Object.defineProperty(win, "localStorage", {
      get() {
        throw new Error("blocked");
      },
    });
  } else {
    win.localStorage = storage;
  }
  if (options.activation !== undefined) {
    win.navigator = { userActivation: options.activation };
  }
  return {
    win: win as unknown as Window,
    doc,
    frames,
    /** The saved values, by key. */
    saved: values,
    setItem: storage.setItem,
    /** The event types the store listens for on the window now. */
    listening,
    /** Runs the frames waiting now, at this time. */
    runFrame(at: number) {
      const waiting = [...frames.entries()];
      frames.clear();
      for (const [, run] of waiting) run(at);
    },
    setHidden(hidden: boolean) {
      doc.visibilityState = hidden ? "hidden" : "visible";
      for (const listener of [...visibility]) listener();
    },
  };
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

// True while an event dispatched by the test is on its way, so a test can
// tell what the store did inside the event's own handlers.
let isDispatching = false;

function dispatch(target: EventTarget, event: Event) {
  isDispatching = true;
  try {
    target.dispatchEvent(event);
  } finally {
    isDispatching = false;
  }
}

function pointerEvent(type: string, pointerType: string): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "pointerType", { value: pointerType });
  return event;
}

function key(name: string, target: EventTarget = document.body) {
  dispatch(
    target,
    new KeyboardEvent("keydown", {
      key: name,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** A button marked as a sound control, as the toggle and the palette's row are. */
function soundControl(tag = "button") {
  const element = document.createElement(tag);
  element.setAttribute(SOUND_CONTROL_ATTRIBUTE, "");
  document.body.append(element);
  return element;
}

/** A context whose resume lets it run only while the test allows it. */
function heldContexts() {
  const made: FakeContext[] = [];
  const gate = { isAllowed: false };
  const createContext = () => {
    const context = new FakeContext();
    context.resume = vi.fn(() => {
      if (gate.isAllowed) context.state = "running";
      return Promise.resolve();
    });
    made.push(context);
    return context as unknown as AudioContext;
  };
  return { made, gate, createContext };
}

type Setup = {
  contexts: FakeContext[];
  sessions: ReturnType<typeof fakeSession>[];
  bridge: { setAudio: Mock<(levels: AudioLevels | null) => void> };
  loadSession: ReturnType<typeof vi.fn>;
  createContext: ReturnType<typeof vi.fn>;
  device: ReturnType<typeof fakeWindow>;
  store: ReturnType<typeof createSoundStore>;
};

function setup(
  overrides: Partial<SoundStoreOptions> = {},
  windowOptions: WindowOptions = {},
): Setup {
  const contexts: FakeContext[] = [];
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const device = fakeWindow(windowOptions);
  const bridge = { setAudio: vi.fn<(levels: AudioLevels | null) => void>() };
  const createContext = vi.fn(() => {
    const context = new FakeContext();
    contexts.push(context);
    return context as unknown as AudioContext;
  });
  const loadSession = vi.fn(() =>
    Promise.resolve({
      createSoundSession: () => {
        const session = fakeSession();
        sessions.push(session);
        return session;
      },
    }),
  );
  const store = createSoundStore({
    win: () => device.win,
    createContext,
    loadSession,
    bridge,
    ...overrides,
  });
  return {
    contexts,
    sessions,
    bridge,
    loadSession,
    createContext,
    device,
    store,
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const remove of onPage) remove();
  onPage.clear();
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("sound store, silent on load", () => {
  it("REQ-SND-01 makes no AudioContext and loads no sound before the first press", () => {
    const { store, createContext, loadSession } = setup();
    const unsubscribe = store.subscribe(() => undefined);
    store.tick("move");
    store.tick("hover");
    expect(store.getSnapshot()).toEqual({ status: "off", ticks: "off" });
    expect(store.getServerSnapshot()).toEqual({ status: "off", ticks: "off" });
    expect(store.getAnalyser()).toBeNull();
    expect(createContext).not.toHaveBeenCalled();
    expect(loadSession).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("REQ-SND-01 the store made at import reaches for no window", () => {
    // The real browser context: with no constructor named on the window,
    // nothing is made until a press.
    const AudioContextSpy = vi.fn();
    vi.stubGlobal("AudioContext", AudioContextSpy);
    const store = createSoundStore();
    expect(store.getSnapshot().status).toBe("off");
    expect(AudioContextSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("sound store, turning sound on", () => {
  it("REQ-SND-01 the first press makes one context and resumes it inside the press, then loads the sound", async () => {
    const { store, contexts, loadSession, sessions } = setup();
    const heard: string[] = [];
    store.subscribe(() => heard.push(store.getSnapshot().status));

    store.toggleBackground();
    // Synchronously, still inside the gesture.
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("starting");

    await settle();
    expect(store.getSnapshot().status).toBe("on");
    expect(heard).toEqual(["starting", "on"]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.play).toHaveBeenCalledTimes(1);
    expect(store.getAnalyser()).toBe(sessions[0]?.analyser);
  });

  it("REQ-SND-01 the browser's own context is the default, the prefixed one where only it exists", async () => {
    const device = fakeWindow();
    const made = vi.fn();
    class PrefixedContext extends FakeContext {
      constructor() {
        super();
        made();
      }
    }
    Object.assign(device.win, {
      AudioContext: undefined,
      webkitAudioContext: PrefixedContext,
    });
    const store = createSoundStore({
      win: () => device.win,
      loadSession: () =>
        Promise.resolve({ createSoundSession: () => fakeSession() }),
      bridge: { setAudio: () => undefined },
    });
    store.toggleBackground();
    expect(made).toHaveBeenCalledTimes(1);
    await settle();
    expect(store.getSnapshot().status).toBe("on");
  });

  it("REQ-SND-01 A11 a browser with no Web Audio shows the failed state and loads nothing; a press tries again", () => {
    const device = fakeWindow();
    const loadSession = vi.fn();
    const store = createSoundStore({
      win: () => device.win,
      loadSession,
      bridge: { setAudio: () => undefined },
    });
    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("failed");
    expect(loadSession).not.toHaveBeenCalled();
    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("failed");
  });

  it("REQ-SND-01 A11 a context that will not resume, or will not run, fails visibly", async () => {
    const refused = setup({
      createContext: () => {
        const context = new FakeContext();
        context.resume = vi.fn(() => Promise.reject(new Error("refused")));
        return context as unknown as AudioContext;
      },
    });
    refused.store.toggleBackground();
    await settle();
    expect(refused.store.getSnapshot().status).toBe("failed");

    const held = setup({
      createContext: () => {
        const context = new FakeContext();
        context.resume = vi.fn(() => Promise.resolve());
        return context as unknown as AudioContext;
      },
    });
    held.store.toggleBackground();
    await settle();
    expect(held.store.getSnapshot().status).toBe("failed");
    expect(held.store.getAnalyser()).toBeNull();
  });

  it("REQ-SND-01 A11 a context the browser keeps waiting fails after the start limit", async () => {
    vi.useFakeTimers();
    const waiting = setup({
      createContext: () => {
        const context = new FakeContext();
        context.resume = vi.fn(() => new Promise<void>(() => undefined));
        return context as unknown as AudioContext;
      },
    });
    waiting.store.toggleBackground();
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS - 1);
    expect(waiting.store.getSnapshot().status).toBe("starting");
    await vi.advanceTimersByTimeAsync(1);
    expect(waiting.store.getSnapshot().status).toBe("failed");
  });

  it("REQ-SND-01 A11 sound code that will not load fails visibly, and the next press loads it again", async () => {
    let attempts = 0;
    const flaky = setup({
      loadSession: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ createSoundSession: () => fakeSession() });
      },
    });
    flaky.store.toggleBackground();
    await settle();
    expect(flaky.store.getSnapshot().status).toBe("failed");
    flaky.store.toggleBackground();
    await settle();
    expect(flaky.store.getSnapshot().status).toBe("on");
    expect(flaky.createContext).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 the store waits, starting, while the bed's recording loads, and is on once it plays; nothing is saved before", async () => {
    let played: () => void = () => undefined;
    const session = fakeSession();
    session.play.mockImplementation(
      () =>
        new Promise<void>((done) => {
          played = done;
        }),
    );
    const slow = setup({
      loadSession: () => Promise.resolve({ createSoundSession: () => session }),
    });
    slow.store.toggleBackground();
    await settle();
    expect(session.play).toHaveBeenCalledTimes(1);
    expect(slow.store.getSnapshot().status).toBe("starting");
    expect(slow.device.saved.has(SOUND_KEY)).toBe(false);
    played();
    await settle();
    expect(slow.store.getSnapshot().status).toBe("on");
    expect(slow.device.saved.get(SOUND_KEY)).toBe("on");
  });

  it("REQ-SND-01 A11 a recording that will not load fails visibly, and the next press tries again on the same context and session (D-179)", async () => {
    const session = fakeSession();
    session.play
      .mockImplementationOnce(() => Promise.reject(new Error("offline")))
      .mockImplementation(() => Promise.resolve());
    const flaky = setup({
      loadSession: () => Promise.resolve({ createSoundSession: () => session }),
    });
    flaky.store.toggleBackground();
    await settle();
    expect(flaky.store.getSnapshot().status).toBe("failed");
    flaky.store.toggleBackground();
    await settle();
    expect(flaky.store.getSnapshot().status).toBe("on");
    expect(session.play).toHaveBeenCalledTimes(2);
    expect(flaky.createContext).toHaveBeenCalledTimes(1);
  });
});

describe("sound store, turning sound off", () => {
  it("REQ-SND-01 the next press fades out at once and puts the context to sleep after the fade", async () => {
    vi.useFakeTimers();
    const { store, contexts, sessions, loadSession } = setup();
    store.toggleBackground();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().status).toBe("on");

    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("off");
    expect(sessions[0]?.pause).toHaveBeenCalledTimes(1);
    expect(store.getAnalyser()).toBeNull();
    await vi.advanceTimersByTimeAsync(SUSPEND_AFTER_MS - 1);
    expect(contexts[0]?.suspend).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(contexts[0]?.suspend).toHaveBeenCalledTimes(1);

    // On again: the same context and the same session.
    store.toggleBackground();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().status).toBe("on");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.play).toHaveBeenCalledTimes(2);
    expect(loadSession).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 a press back on during the fade keeps the context awake", async () => {
    vi.useFakeTimers();
    const { store, contexts } = setup();
    store.toggleBackground();
    await vi.advanceTimersByTimeAsync(0);
    store.toggleBackground();
    store.toggleBackground();
    await vi.advanceTimersByTimeAsync(SUSPEND_AFTER_MS * 2);
    expect(store.getSnapshot().status).toBe("on");
    expect(contexts[0]?.suspend).not.toHaveBeenCalled();
  });

  it("REQ-SND-01 a press while sound is starting cancels it: nothing plays", async () => {
    const { store, sessions } = setup();
    store.toggleBackground();
    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("off");
    await settle();
    expect(store.getSnapshot().status).toBe("off");
    expect(sessions[0]?.play).not.toHaveBeenCalled();
  });
});

describe("sound store, interface sounds", () => {
  it("REQ-SND-03 a tick plays only while Interface sounds is on, whatever the background does", async () => {
    const { store, sessions } = setup();
    store.toggleBackground();
    await settle();
    store.tick("select");
    expect(sessions[0]?.tick).not.toHaveBeenCalled();

    store.toggleTicks();
    await settle();
    store.tick("select");
    expect(sessions[0]?.tick).toHaveBeenLastCalledWith("select");
    // The background off: the ticks stay.
    store.toggleBackground();
    store.tick("close");
    expect(sessions[0]?.tick).toHaveBeenLastCalledWith("close");
    expect(store.getSnapshot()).toEqual({ status: "off", ticks: "on" });

    store.toggleTicks();
    store.tick("open");
    expect(sessions[0]?.tick).toHaveBeenCalledTimes(2);
  });

  it("REQ-SND-01 turning Interface sounds on alone makes the one context inside the press and loads the sound, with the background left silent", async () => {
    const { store, contexts, loadSession, sessions, bridge, device } = setup();
    store.subscribe(() => undefined);
    store.toggleTicks();
    // Synchronously, still inside the press.
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ status: "off", ticks: "on" });

    await settle();
    expect(sessions[0]?.play).not.toHaveBeenCalled();
    expect(store.getAnalyser()).toBeNull();
    // The strands and the bars follow the background only.
    store.tick("select");
    expect(device.frames.size).toBe(0);
    expect(bridge.setAudio).not.toHaveBeenCalled();
    expect(device.saved.get(TICKS_KEY)).toBe("on");
    expect(device.saved.has(SOUND_KEY)).toBe(false);
  });

  it("REQ-SND-01 the press that turns Interface sounds on is heard once the sound is ready, and only if still fresh", async () => {
    const quick = setup();
    quick.store.toggleTicks();
    quick.store.tick("select");
    expect(quick.sessions).toHaveLength(0);
    await settle();
    expect(quick.sessions[0]?.tick).toHaveBeenCalledTimes(1);
    expect(quick.sessions[0]?.tick).toHaveBeenCalledWith("select");

    const clock = { at: 0 };
    const slow = setup({ now: () => clock.at });
    slow.store.toggleTicks();
    slow.store.tick("select");
    clock.at = LATE_TICK_MS + 1;
    await settle();
    expect(slow.sessions[0]?.tick).not.toHaveBeenCalled();
  });

  it("REQ-SND-01 a returning visitor's saved Interface sounds wait with no context; a hover stays silent, and the first press tick starts the context inside its handler", async () => {
    const inEvent: boolean[] = [];
    const { store, contexts, createContext, sessions } = setup(
      {},
      { ticksSaved: "on" },
    );
    expect(store.getSnapshot().ticks).toBe("off");
    store.subscribe(() => undefined);
    expect(store.getSnapshot()).toEqual({ status: "off", ticks: "on" });

    store.tick("hover");
    expect(createContext).not.toHaveBeenCalled();

    const link = document.createElement("a");
    document.body.append(link);
    link.addEventListener("click", () => {
      store.tick("select");
      inEvent.push(isDispatching);
    });
    dispatch(link, new MouseEvent("click", { bubbles: true }));
    expect(inEvent).toEqual([true]);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
    await settle();
    expect(sessions[0]?.tick).toHaveBeenCalledWith("select");

    // Now running: a hover plays, and a press does not wake it again.
    store.tick("hover");
    store.tick("select");
    expect(sessions[0]?.tick).toHaveBeenCalledTimes(3);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 a press tick the browser did not count makes no context", () => {
    const activation = { hasBeenActive: false };
    const { store, createContext } = setup(
      {},
      { ticksSaved: "on", activation },
    );
    store.subscribe(() => undefined);
    store.tick("select");
    expect(createContext).not.toHaveBeenCalled();
    activation.hasBeenActive = true;
    store.tick("select");
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 the context stays awake while Interface sounds is on, and sleeps once both settings are off", async () => {
    vi.useFakeTimers();
    const { store, contexts } = setup();
    store.toggleBackground();
    store.toggleTicks();
    await vi.advanceTimersByTimeAsync(0);
    store.toggleBackground();
    await vi.advanceTimersByTimeAsync(SUSPEND_AFTER_MS * 2);
    expect(contexts[0]?.suspend).not.toHaveBeenCalled();
    store.toggleTicks();
    await vi.advanceTimersByTimeAsync(SUSPEND_AFTER_MS);
    expect(contexts[0]?.suspend).toHaveBeenCalledTimes(1);

    // On again by a press: the same context, resumed inside it.
    store.toggleTicks();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(2);
  });

  it("REQ-SND-01 each setting is saved on its own: on once it plays, off when turned off", async () => {
    const { store, device } = setup();
    store.subscribe(() => undefined);
    store.toggleTicks();
    expect(device.saved.has(TICKS_KEY)).toBe(false);
    await settle();
    expect(device.saved.get(TICKS_KEY)).toBe("on");
    expect(device.saved.has(SOUND_KEY)).toBe(false);

    store.toggleBackground();
    await settle();
    expect(device.saved.get(SOUND_KEY)).toBe("on");
    store.toggleTicks();
    expect(device.saved.get(TICKS_KEY)).toBe("off");
    expect(device.saved.get(SOUND_KEY)).toBe("on");
    store.toggleBackground();
    expect(device.saved.get(SOUND_KEY)).toBe("off");
    expect(device.saved.get(TICKS_KEY)).toBe("off");
  });

  it("REQ-SND-01 REQ-SND-02 both saved settings come back from the first subscriber, in one change", () => {
    const { store, createContext, device } = setup(
      {},
      { saved: "on", ticksSaved: "on" },
    );
    const heard: string[] = [];
    store.subscribe(() => {
      const { status, ticks } = store.getSnapshot();
      heard.push(`${status} ${ticks}`);
    });
    expect(heard).toEqual(["waiting on"]);
    expect(device.listening.size).toBe(GESTURES.length);
    expect(createContext).not.toHaveBeenCalled();
  });

  it.each([
    [null, "off"],
    ["off", "off"],
    ["loud", "off"],
    ["on", "on"],
  ])(
    "REQ-SND-01 a saved Interface sounds choice of %s restores it %s, and the background stays off",
    (ticksSaved, ticks) => {
      const { store, device } = setup({}, { ticksSaved });
      store.subscribe(() => undefined);
      expect(store.getSnapshot()).toEqual({ status: "off", ticks });
      expect(device.listening.size).toBe(0);
    },
  );

  it("REQ-SND-03 ticksAsked counts every press tick, on or off, never a hover", () => {
    const { store } = setup();
    expect(store.ticksAsked()).toBe(0);
    store.tick("move");
    store.tick("hover");
    store.tick("open");
    expect(store.ticksAsked()).toBe(2);
  });

  it("REQ-SND-01 A11 Interface sounds with no Web Audio show the failed state and load nothing; a press tries again", () => {
    const device = fakeWindow();
    const loadSession = vi.fn();
    const store = createSoundStore({
      win: () => device.win,
      loadSession,
      bridge: { setAudio: () => undefined },
    });
    store.toggleTicks();
    expect(store.getSnapshot().ticks).toBe("failed");
    expect(loadSession).not.toHaveBeenCalled();
    store.toggleTicks();
    expect(store.getSnapshot().ticks).toBe("failed");
    expect(device.setItem).not.toHaveBeenCalled();
  });

  it("REQ-SND-01 A11 sound code that will not load fails Interface sounds visibly, and the next press loads it again", async () => {
    let attempts = 0;
    const flaky = setup({
      loadSession: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ createSoundSession: () => fakeSession() });
      },
    });
    flaky.store.toggleTicks();
    await settle();
    expect(flaky.store.getSnapshot().ticks).toBe("failed");
    expect(flaky.device.saved.has(TICKS_KEY)).toBe(false);
    flaky.store.toggleTicks();
    await settle();
    expect(flaky.store.getSnapshot().ticks).toBe("on");
    expect(flaky.createContext).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 A11 a context held after turning Interface sounds on fails after the start limit; one held for a returning visitor's press keeps them on", async () => {
    vi.useFakeTimers();
    const never = () => {
      const context = new FakeContext();
      context.resume = vi.fn(() => new Promise<void>(() => undefined));
      return context as unknown as AudioContext;
    };
    const turned = setup({ createContext: never });
    turned.store.toggleTicks();
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS - 1);
    expect(turned.store.getSnapshot().ticks).toBe("on");
    await vi.advanceTimersByTimeAsync(1);
    expect(turned.store.getSnapshot().ticks).toBe("failed");

    const held = heldContexts();
    const returning = setup(
      { createContext: held.createContext },
      { ticksSaved: "on" },
    );
    returning.store.subscribe(() => undefined);
    returning.store.tick("select");
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS);
    expect(returning.store.getSnapshot().ticks).toBe("on");
    expect(returning.sessions[0]?.tick).not.toHaveBeenCalled();
    // The next press resumes the same context.
    held.gate.isAllowed = true;
    returning.store.tick("select");
    await vi.advanceTimersByTimeAsync(0);
    expect(held.made).toHaveLength(1);
    expect(returning.sessions[0]?.tick).toHaveBeenCalledWith("select");
  });

  it("REQ-SND-01 A11 a returning visitor's press whose context never settles is dropped at the start limit, so the next press tries again", async () => {
    vi.useFakeTimers();
    const resumes: number[] = [];
    let context: FakeContext | null = null;
    const never = () => {
      context ??= new FakeContext();
      context.resume = vi.fn(() => {
        resumes.push(1);
        return new Promise<void>(() => undefined);
      });
      return context as unknown as AudioContext;
    };
    const returning = setup({ createContext: never }, { ticksSaved: "on" });
    returning.store.subscribe(() => undefined);
    returning.store.tick("select");
    expect(resumes).toHaveLength(1);
    // While it wakes, another press waits on the same start.
    returning.store.tick("select");
    expect(resumes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS);
    expect(returning.store.getSnapshot().ticks).toBe("on");
    returning.store.tick("select");
    expect(resumes).toHaveLength(2);
  });

  it("REQ-SND-01 with storage blocked Interface sounds turn on and off for the page", async () => {
    const { store } = setup({}, { isStorageBlocked: true });
    store.subscribe(() => undefined);
    store.toggleTicks();
    await settle();
    expect(store.getSnapshot().ticks).toBe("on");
    expect(() => store.toggleTicks()).not.toThrow();
    expect(store.getSnapshot().ticks).toBe("off");
  });

  it("A11 REQ-SND-03 a tick that throws never breaks the control that asked for it", async () => {
    const { store, sessions } = setup();
    store.toggleTicks();
    await settle();
    sessions[0]?.tick.mockImplementation(() => {
      throw new Error("tick");
    });
    expect(() => store.tick("move")).not.toThrow();
  });
});

describe("sound store, the frame loop", () => {
  it("REQ-SND-03 while on, one loop sends the strands smoothed levels, 0 to 1, and null once off", async () => {
    const { store, bridge, device } = setup();
    store.toggleBackground();
    await settle();
    expect(device.frames.size).toBe(1);

    device.runFrame(0);
    device.runFrame(16);
    device.runFrame(32);
    const sent = bridge.setAudio.mock.calls.map(([levels]) => levels);
    expect(sent).toHaveLength(3);
    for (const levels of sent) {
      expect(levels).toHaveLength(3);
      for (const level of levels ?? []) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
    // The first frame has no time behind it; then the levels rise.
    expect(sent[0]).toEqual([0, 0, 0]);
    expect(sent[2]?.[0]).toBeGreaterThan(sent[1]?.[0] ?? 1);
    // One loop, never two.
    expect(device.frames.size).toBe(1);

    store.toggleBackground();
    expect(bridge.setAudio).toHaveBeenLastCalledWith(null);
    expect(device.frames.size).toBe(0);
  });

  it("REQ-SND-03 hands each frame's spectrum to readers until they leave", async () => {
    const { store, device } = setup();
    const reader = vi.fn();
    const leave = store.subscribeSpectrum(reader);
    store.toggleBackground();
    await settle();
    device.runFrame(0);
    expect(reader).toHaveBeenCalledTimes(1);
    const [spectrum, elapsed] = reader.mock.calls[0] ?? [];
    expect(spectrum.bins).toHaveLength(512);
    expect(spectrum.binHz).toBeCloseTo(48_000 / 1024);
    expect(elapsed).toBe(0);
    leave();
    device.runFrame(16);
    expect(reader).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-03 the loop stops while the tab is hidden and picks up when it shows", async () => {
    const { store, device } = setup();
    store.toggleBackground();
    await settle();
    expect(device.frames.size).toBe(1);
    device.setHidden(true);
    expect(device.frames.size).toBe(0);
    device.setHidden(false);
    expect(device.frames.size).toBe(1);
    store.toggleBackground();
    expect(device.doc.removeEventListener).toHaveBeenCalledWith(
      "visibilitychange",
      expect.any(Function),
    );
    device.setHidden(false);
    expect(device.frames.size).toBe(0);
  });

  it("REQ-SND-03 sound turned on in a hidden tab starts its loop when the tab shows", async () => {
    const { store, device } = setup();
    device.doc.visibilityState = "hidden";
    store.toggleBackground();
    await settle();
    expect(store.getSnapshot().status).toBe("on");
    expect(device.frames.size).toBe(0);
    device.setHidden(false);
    expect(device.frames.size).toBe(1);
  });
});

/** A store whose visitor left sound on, after its first subscriber. */
function waiting(
  overrides: Partial<SoundStoreOptions> = {},
  windowOptions: WindowOptions = {},
) {
  const made = setup(overrides, { saved: "on", ...windowOptions });
  const heard: string[] = [];
  made.store.subscribe(() => heard.push(made.store.getSnapshot().status));
  return { ...made, heard };
}

describe("sound store, a returning visitor's saved choice", () => {
  it("REQ-SND-01 REQ-SND-02 a saved on makes the store wait from its first subscriber, off on the server and before it, with no AudioContext and no sound code", () => {
    const { store, createContext, loadSession, device } = setup(
      {},
      { saved: "on" },
    );
    expect(store.getSnapshot().status).toBe("off");
    expect(store.getServerSnapshot().status).toBe("off");
    expect(device.listening.size).toBe(0);

    const heard: string[] = [];
    const leave = store.subscribe(() => heard.push(store.getSnapshot().status));
    expect(store.getSnapshot().status).toBe("waiting");
    expect(heard).toEqual(["waiting"]);
    expect(store.getServerSnapshot().status).toBe("off");
    expect([...device.listening].sort()).toEqual([...GESTURES].sort());
    expect(createContext).not.toHaveBeenCalled();
    expect(loadSession).not.toHaveBeenCalled();
    expect(store.getAnalyser()).toBeNull();
    store.tick("move");

    // Read once: a later subscriber changes nothing.
    leave();
    store.subscribe(() => undefined);
    expect(heard).toEqual(["waiting"]);
    expect(store.getSnapshot().status).toBe("waiting");
  });

  it.each([null, "off", "loud"])(
    "REQ-SND-01 a saved choice of %s leaves the store off, listening for nothing",
    (saved) => {
      const { store, device } = setup({}, { saved });
      store.subscribe(() => undefined);
      expect(store.getSnapshot().status).toBe("off");
      expect(device.listening.size).toBe(0);
    },
  );

  it("REQ-SND-01 the first mouse press starts the sound inside its handler, and every listener goes as it starts", async () => {
    const inEvent: boolean[] = [];
    const made: FakeContext[] = [];
    const { store, device, loadSession, heard } = waiting({
      createContext: () => {
        inEvent.push(isDispatching);
        const context = new FakeContext();
        const { resume } = context;
        context.resume = vi.fn(() => {
          inEvent.push(isDispatching);
          return resume();
        });
        made.push(context);
        return context as unknown as AudioContext;
      },
    });

    dispatch(document.body, pointerEvent("pointerdown", "mouse"));
    // Made and resumed inside the event, then the sound's code asked for.
    expect(inEvent).toEqual([true, true]);
    expect(loadSession).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("starting");
    expect(device.listening.size).toBe(0);

    await settle();
    expect(store.getSnapshot().status).toBe("on");
    expect(heard).toEqual(["waiting", "starting", "on"]);
    expect(device.saved.get(SOUND_KEY)).toBe("on");

    // The rest of the press, and later keys, start nothing more.
    dispatch(document.body, new MouseEvent("mousedown", { bubbles: true }));
    key("a");
    expect(made).toHaveLength(1);
    expect(made[0]?.resume).toHaveBeenCalledTimes(1);
  });

  it("REQ-SND-01 the pill's own press starts a waiting background through resumeWaiting, and does nothing once it plays or with nothing saved", async () => {
    const { store, contexts } = waiting();
    store.resumeWaiting();
    expect(contexts).toHaveLength(1);
    expect(store.getSnapshot().status).toBe("starting");
    await settle();
    expect(store.getSnapshot().status).toBe("on");
    store.resumeWaiting();
    expect(contexts).toHaveLength(1);
    expect(store.getSnapshot().status).toBe("on");

    const fresh = setup({}, { saved: null });
    fresh.store.subscribe(() => undefined);
    fresh.store.resumeWaiting();
    expect(fresh.contexts).toHaveLength(0);
    expect(fresh.store.getSnapshot().status).toBe("off");
  });

  it("REQ-SND-01 the first key starts it the same way, Ctrl K included", async () => {
    const { store, contexts } = waiting();
    key("k");
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.resume).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().status).toBe("starting");
    await settle();
    expect(store.getSnapshot().status).toBe("on");
  });

  it("REQ-SND-01 a touch starts it on the way up, never on the way down", () => {
    const tap = waiting();
    dispatch(document.body, pointerEvent("pointerdown", "touch"));
    expect(tap.store.getSnapshot().status).toBe("waiting");
    expect(tap.contexts).toHaveLength(0);
    dispatch(document.body, pointerEvent("pointerup", "touch"));
    expect(tap.store.getSnapshot().status).toBe("starting");
    // The touchend right after starts nothing more.
    dispatch(document.body, new Event("touchend", { bubbles: true }));
    expect(tap.contexts).toHaveLength(1);

    // A browser that sends only touch events.
    const touch = waiting();
    dispatch(document.body, new Event("touchend", { bubbles: true }));
    expect(touch.store.getSnapshot().status).toBe("starting");
  });

  it("REQ-SND-01 Escape, a lone modifier or lock key, a mouse button going up, the wheel and scrolling start nothing", () => {
    const { store, contexts, device } = waiting();
    for (const name of [
      "Escape",
      "Shift",
      "Control",
      "Alt",
      "Meta",
      "CapsLock",
    ]) {
      key(name);
    }
    dispatch(document.body, pointerEvent("pointerup", "mouse"));
    dispatch(document.body, new Event("wheel", { bubbles: true }));
    dispatch(window, new Event("scroll"));
    expect(store.getSnapshot().status).toBe("waiting");
    expect(contexts).toHaveLength(0);
    expect(device.listening.size).toBe(GESTURES.length);

    key("ArrowDown");
    expect(store.getSnapshot().status).toBe("starting");
  });

  it("REQ-SND-01 an event the browser did not count makes no context and keeps the store waiting and listening", async () => {
    const activation = { hasBeenActive: false };
    const { store, contexts, device } = waiting({}, { activation });
    dispatch(document.body, pointerEvent("pointerdown", "mouse"));
    key("a");
    expect(store.getSnapshot().status).toBe("waiting");
    expect(contexts).toHaveLength(0);
    expect(device.listening.size).toBe(GESTURES.length);

    activation.hasBeenActive = true;
    key("a");
    expect(store.getSnapshot().status).toBe("starting");
    await settle();
    expect(store.getSnapshot().status).toBe("on");
  });

  it("REQ-SND-01 a context that stays suspended keeps the store waiting and listening, and the next gesture resumes the same one", async () => {
    const held = heldContexts();
    const { store, device, heard } = waiting({
      createContext: held.createContext,
    });
    key("a");
    expect(store.getSnapshot().status).toBe("starting");
    await settle();
    expect(store.getSnapshot().status).toBe("waiting");
    expect(device.listening.size).toBe(GESTURES.length);
    expect(device.saved.get(SOUND_KEY)).toBe("on");

    held.gate.isAllowed = true;
    dispatch(document.body, pointerEvent("pointerdown", "mouse"));
    await settle();
    expect(store.getSnapshot().status).toBe("on");
    expect(held.made).toHaveLength(1);
    expect(held.made[0]?.resume).toHaveBeenCalledTimes(2);
    expect(heard).toEqual(["waiting", "starting", "waiting", "starting", "on"]);
    expect(device.listening.size).toBe(0);
  });

  it("REQ-SND-01 a context the browser keeps past the start limit puts the store back to waiting, not failed", async () => {
    vi.useFakeTimers();
    const { store, device } = waiting({
      createContext: () => {
        const context = new FakeContext();
        context.resume = vi.fn(() => new Promise<void>(() => undefined));
        return context as unknown as AudioContext;
      },
    });
    key("a");
    await vi.advanceTimersByTimeAsync(START_LIMIT_MS);
    expect(store.getSnapshot().status).toBe("waiting");
    expect(device.listening.size).toBe(GESTURES.length);
  });

  it("REQ-SND-01 a press on a sound control while waiting is left to it: the pill opens its panel with nothing started, and the Background switch turns the background off", async () => {
    const { store, contexts, heard, device } = waiting();
    const pill = soundControl();
    const words = document.createElement("span");
    pill.append(words);
    // The press reaches the window first, which leaves it to the control.
    dispatch(words, pointerEvent("pointerdown", "mouse"));
    dispatch(words, new MouseEvent("mousedown", { bubbles: true }));
    dispatch(words, pointerEvent("pointerup", "touch"));
    dispatch(words, new Event("touchend", { bubbles: true }));
    expect(store.getSnapshot().status).toBe("waiting");
    expect(contexts).toHaveLength(0);

    // The Background switch shows it on, so its press turns it off: no
    // context, no sound code, the listeners gone, off saved.
    const backgroundSwitch = soundControl();
    dispatch(backgroundSwitch, pointerEvent("pointerdown", "mouse"));
    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("off");
    expect(contexts).toHaveLength(0);
    expect(device.listening.size).toBe(0);
    expect(device.saved.get(SOUND_KEY)).toBe("off");
    expect(heard).toEqual(["waiting", "off"]);
    await settle();
    expect(store.getSnapshot().status).toBe("off");

    // Turned over again, it starts inside that press.
    store.toggleBackground();
    expect(contexts).toHaveLength(1);
    await settle();
    expect(store.getSnapshot().status).toBe("on");
  });

  it("REQ-SND-01 turning Interface sounds on while the background waits leaves it waiting for the first press elsewhere", async () => {
    const { store, contexts } = waiting();
    const ticksSwitch = soundControl();
    dispatch(ticksSwitch, pointerEvent("pointerdown", "mouse"));
    store.toggleTicks();
    await settle();
    expect(store.getSnapshot()).toEqual({ status: "waiting", ticks: "on" });
    expect(contexts).toHaveLength(1);
    // The next press anywhere else starts the background on that context.
    dispatch(document.body, pointerEvent("pointerdown", "mouse"));
    await settle();
    expect(store.getSnapshot()).toEqual({ status: "on", ticks: "on" });
    expect(contexts).toHaveLength(1);
  });

  it("REQ-SND-01 Enter or Space on a focused sound control, and Enter in the palette's search on a sound row, are left to the control", () => {
    const { store, contexts } = waiting();
    const pill = soundControl();
    key("Enter", pill);
    key(" ", pill);
    const row = soundControl("div");
    row.id = "palette-sound";
    const other = document.createElement("div");
    other.id = "palette-calm";
    const search = document.createElement("input");
    search.setAttribute("aria-activedescendant", row.id);
    document.body.append(other, search);
    key("Enter", search);
    expect(store.getSnapshot().status).toBe("waiting");
    expect(contexts).toHaveLength(0);

    // Enter on another row is the visitor's first key like any other.
    search.setAttribute("aria-activedescendant", other.id);
    key("Enter", search);
    expect(store.getSnapshot().status).toBe("starting");
  });

  it("REQ-SND-01 Tab on a focused sound control is a first key like any other", () => {
    const { store } = waiting();
    key("Tab", soundControl());
    expect(store.getSnapshot().status).toBe("starting");
  });

  it("REQ-SND-01 turning the background on saves on once it plays, and turning it off saves off", async () => {
    const { store, device } = setup();
    store.subscribe(() => undefined);
    store.toggleBackground();
    expect(device.saved.has(SOUND_KEY)).toBe(false);
    await settle();
    expect(device.saved.get(SOUND_KEY)).toBe("on");
    store.toggleBackground();
    expect(device.saved.get(SOUND_KEY)).toBe("off");
    // A press that cancels a start is a turn off too.
    store.toggleBackground();
    store.toggleBackground();
    await settle();
    expect(store.getSnapshot().status).toBe("off");
    expect(device.saved.get(SOUND_KEY)).toBe("off");
  });

  it("REQ-SND-01 A11 a start that fails saves nothing", async () => {
    // No Web Audio, after a saved off.
    const device = fakeWindow({ saved: "off" });
    const store = createSoundStore({
      win: () => device.win,
      loadSession: vi.fn(),
      bridge: { setAudio: () => undefined },
    });
    store.subscribe(() => undefined);
    store.toggleBackground();
    expect(store.getSnapshot().status).toBe("failed");
    expect(device.setItem).not.toHaveBeenCalled();

    // A returning visitor's start whose code will not load: the failed
    // state, the listeners gone, the saved on kept.
    const flaky = waiting({
      loadSession: () => Promise.reject(new Error("offline")),
    });
    key("a");
    await settle();
    expect(flaky.store.getSnapshot().status).toBe("failed");
    expect(flaky.device.listening.size).toBe(0);
    expect(flaky.device.setItem).not.toHaveBeenCalled();
    expect(flaky.device.saved.get(SOUND_KEY)).toBe("on");
  });

  it("REQ-SND-01 with storage blocked the store behaves as before: off on load, then on and off by the Background switch", async () => {
    const { store, device } = setup({}, { isStorageBlocked: true });
    store.subscribe(() => undefined);
    expect(store.getSnapshot().status).toBe("off");
    expect(device.listening.size).toBe(0);
    store.toggleBackground();
    await settle();
    expect(store.getSnapshot().status).toBe("on");
    expect(() => store.toggleBackground()).not.toThrow();
    expect(store.getSnapshot().status).toBe("off");
  });
});
