import { describe, expect, it, vi } from "vitest";

import { createCalmStore } from "./calm-store";

const KEY = "portfolio:calm";

function memoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
  };
  return { data, storage };
}

/** A window with only what the store reads: matchMedia and sessionStorage. */
function fakeWindow({
  system = false,
  stored,
}: { system?: boolean; stored?: string } = {}) {
  const listeners = new Set<() => void>();
  const query = {
    matches: system,
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      listeners.delete(listener);
    }),
  };
  const matchMedia = vi.fn(() => query);
  const { data, storage } = memoryStorage();
  if (stored !== undefined) data.set(KEY, stored);
  const win = { matchMedia, sessionStorage: storage } as unknown as Window;

  return {
    win,
    query,
    matchMedia,
    listeners,
    data,
    storage,
    /** The OS setting changes and the query reports it. */
    setSystem(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe("calm store", () => {
  it("REQ-A11Y-03 reads the OS setting from the reduced motion query", () => {
    const device = fakeWindow({ system: true });
    const store = createCalmStore(device.win);

    expect(device.matchMedia).toHaveBeenCalledWith(
      "(prefers-reduced-motion: reduce)",
    );
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: true,
      chosen: false,
    });
  });

  it("REQ-A11Y-04 the toggle turns calm on and off when the OS asks for nothing", () => {
    const store = createCalmStore(fakeWindow().win);
    expect(store.getSnapshot()).toEqual({
      calm: false,
      system: false,
      chosen: false,
    });

    store.setChosen(true);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: false,
      chosen: true,
    });

    store.setChosen(false);
    expect(store.getSnapshot()).toEqual({
      calm: false,
      system: false,
      chosen: false,
    });
  });

  it("REQ-A11Y-03 the toggle cannot clear calm while the OS asks for reduced motion", () => {
    const store = createCalmStore(fakeWindow({ system: true }).win);

    store.setChosen(true);
    store.setChosen(false);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: true,
      chosen: false,
    });
  });

  it("REQ-A11Y-04 the choice is kept in session storage for the visit", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);

    store.setChosen(true);
    expect(device.data.get(KEY)).toBe("on");
    // A reload builds a new store over the same tab's storage.
    expect(createCalmStore(device.win).getSnapshot()).toEqual({
      calm: true,
      system: false,
      chosen: true,
    });

    store.setChosen(false);
    expect(device.data.has(KEY)).toBe(false);
    expect(createCalmStore(device.win).getSnapshot().calm).toBe(false);
  });

  it.each(["off", "true", "", "ON"])(
    "REQ-A11Y-04 a stored value of %j does not count as chosen",
    (stored) => {
      const store = createCalmStore(fakeWindow({ stored }).win);
      expect(store.getSnapshot().chosen).toBe(false);
    },
  );

  it("REQ-A11Y-04 storage that cannot be reached leaves the toggle working until the page reloads", () => {
    const device = fakeWindow();
    Object.defineProperty(device.win, "sessionStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
    const store = createCalmStore(device.win);

    expect(store.getSnapshot().chosen).toBe(false);
    store.setChosen(true);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: false,
      chosen: true,
    });
  });

  it("REQ-A11Y-04 storage whose reads and writes throw leaves the toggle working too", () => {
    const device = fakeWindow();
    const fail = () => {
      throw new DOMException("Quota", "QuotaExceededError");
    };
    device.storage.getItem.mockImplementation(fail);
    device.storage.setItem.mockImplementation(fail);
    device.storage.removeItem.mockImplementation(fail);
    const store = createCalmStore(device.win);

    expect(store.getSnapshot().chosen).toBe(false);
    expect(() => store.setChosen(true)).not.toThrow();
    expect(store.getSnapshot().calm).toBe(true);
    expect(() => store.setChosen(false)).not.toThrow();
    expect(store.getSnapshot().calm).toBe(false);
  });

  it("REQ-A11Y-03 follows a live change of the OS setting and tells every listener", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);
    const first = vi.fn();
    const second = vi.fn();
    store.subscribe(first);
    store.subscribe(second);

    device.setSystem(true);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: true,
      chosen: false,
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    device.setSystem(false);
    expect(store.getSnapshot().calm).toBe(false);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("REQ-A11Y-03 an OS change keeps the visitor's own choice", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);
    store.subscribe(() => undefined);
    store.setChosen(true);

    device.setSystem(true);
    device.setSystem(false);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: false,
      chosen: true,
    });
  });

  it("REQ-A11Y-03 watches the query only while someone listens, and catches a change made meanwhile", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);
    expect(device.query.addEventListener).not.toHaveBeenCalled();

    const stopFirst = store.subscribe(() => undefined);
    const stopSecond = store.subscribe(() => undefined);
    expect(device.query.addEventListener).toHaveBeenCalledTimes(1);

    stopFirst();
    expect(device.listeners.size).toBe(1);
    stopSecond();
    expect(device.listeners.size).toBe(0);
    expect(device.query.removeEventListener).toHaveBeenCalledTimes(1);

    // The OS setting changes while nobody listens.
    device.query.matches = true;
    store.subscribe(() => undefined);
    expect(store.getSnapshot().system).toBe(true);
  });

  it("REQ-A11Y-04 a listener that unsubscribes stops hearing changes", () => {
    const store = createCalmStore(fakeWindow().win);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.setChosen(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("REQ-A11Y-04 snapshots stay the same object until something changes", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);
    const listener = vi.fn();
    store.subscribe(listener);
    const first = store.getSnapshot();

    expect(store.getSnapshot()).toBe(first);
    store.setChosen(false);
    device.setSystem(false);
    expect(store.getSnapshot()).toBe(first);
    expect(listener).not.toHaveBeenCalled();

    store.setChosen(true);
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    expect(store.getSnapshot()).toBe(second);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("REQ-A11Y-03 the OS turning on while the toggle is on still tells listeners, because system changed", () => {
    const device = fakeWindow();
    const store = createCalmStore(device.win);
    const listener = vi.fn();
    store.subscribe(listener);
    store.setChosen(true);
    listener.mockClear();

    device.setSystem(true);
    expect(store.getSnapshot()).toEqual({
      calm: true,
      system: true,
      chosen: true,
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("REQ-CNT-01 the server snapshot allows motion, is one frozen object and ignores the device", () => {
    const store = createCalmStore(
      fakeWindow({ system: true, stored: "on" }).win,
    );
    const server = store.getServerSnapshot();

    expect(server).toEqual({ calm: false, system: false, chosen: false });
    expect(store.getServerSnapshot()).toBe(server);
    expect(Object.isFrozen(server)).toBe(true);
    expect(store.getSnapshot().calm).toBe(true);
  });

  it("REQ-A11Y-03 a window without matchMedia counts as no OS request", () => {
    const { storage } = memoryStorage();
    const store = createCalmStore({
      sessionStorage: storage,
    } as unknown as Window);

    expect(store.getSnapshot()).toEqual({
      calm: false,
      system: false,
      chosen: false,
    });
    expect(() => store.subscribe(() => undefined)).not.toThrow();
  });
});
