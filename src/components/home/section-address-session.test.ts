import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOADER_ATTRIBUTE } from "@/components/loader/loader-config";

import {
  ADDRESS_LINE,
  LINE_SHARE,
  startSectionAddress,
} from "./section-address-session";

class FakeObserver {
  static last: FakeObserver | null = null;
  readonly targets: Element[] = [];
  disconnected = false;

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.last = this;
  }

  observe(target: Element) {
    this.targets.push(target);
  }

  disconnect() {
    this.disconnected = true;
  }
}

type Place = "across" | "above" | "below";

function view() {
  const win = document.defaultView;
  if (win === null) throw new Error("jsdom has no window");
  return win;
}

function observer(): FakeObserver {
  const last = FakeObserver.last;
  if (last === null) throw new Error("no observer");
  return last;
}

function chapter(id: string): Element {
  const found = document.querySelector(
    id === "" ? '[data-chapter="hero"]' : `#${id}`,
  );
  if (found === null) throw new Error(`no chapter ${id}`);
  return found;
}

// Moves these chapters on the screen, as their boxes say, without a report:
// across the line, wholly above it, or wholly below it.
function place(places: Record<string, Place>) {
  const line = view().innerHeight * LINE_SHARE;
  for (const [id, where] of Object.entries(places)) {
    const top =
      where === "across"
        ? line - 100
        : where === "above"
          ? line - 900
          : line + 100;
    const bottom = where === "above" ? line - 10 : top + 600;
    vi.spyOn(chapter(id), "getBoundingClientRect").mockReturnValue({
      top,
      bottom,
    } as DOMRect);
  }
}

// What the observer reports for these chapters, as a browser would: their
// boxes move, then the report arrives.
function report(places: Record<string, Place>) {
  place(places);
  const entries = Object.keys(places).map((id) => ({
    target: chapter(id),
    isIntersecting: places[id] === "across",
  }));
  observer().callback(
    entries as unknown as IntersectionObserverEntry[],
    observer() as unknown as IntersectionObserver,
  );
}

let frames: FrameRequestCallback[] = [];
const original = {
  observer: view().IntersectionObserver,
  frame: view().requestAnimationFrame,
  cancel: view().cancelAnimationFrame,
};

function flushFrames() {
  for (let i = 0; i < 2; i += 1) {
    const due = frames;
    frames = [];
    for (const callback of due) callback(0);
  }
}

function scroll() {
  view().dispatchEvent(new Event("scroll"));
}

const address = () => `${view().location.pathname}${view().location.hash}`;

beforeEach(() => {
  document.body.innerHTML = `<main>
    <section data-chapter="hero"></section>
    <section id="field" data-chapter="bloom"></section>
    <section id="work" data-chapter="work"></section>
    <section id="making-of" data-chapter="making-of"></section>
    <section id="about" data-chapter="about"></section>
    <section id="contact" data-chapter="contact"></section>
  </main><footer></footer>`;
  view().history.replaceState(null, "", "/");
  document.documentElement.removeAttribute(LOADER_ATTRIBUTE);
  FakeObserver.last = null;
  frames = [];
  Object.assign(view(), {
    IntersectionObserver: FakeObserver,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame: () => undefined,
  });
  // The page as it loads: the hero across the line, the rest below.
  place({
    "": "across",
    field: "below",
    work: "below",
    "making-of": "below",
    about: "below",
    contact: "below",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(view(), {
    IntersectionObserver: original.observer,
    requestAnimationFrame: original.frame,
    cancelAnimationFrame: original.cancel,
  });
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(LOADER_ATTRIBUTE);
  view().history.replaceState(null, "", "/");
});

describe("startSectionAddress, the home page's address per chapter", () => {
  it("REQ-NAV-06 watches every chapter, the hero included, across a band just above the middle of the screen", () => {
    const stop = startSectionAddress();
    expect(observer().targets.map((target) => target.id)).toEqual([
      "",
      "field",
      "work",
      "making-of",
      "about",
      "contact",
    ]);
    expect(observer().options?.rootMargin).toBe(ADDRESS_LINE);
    stop();
  });

  it("REQ-NAV-06 once the page scrolls, the chapter across the line names the address, and the hero's is the plain /", () => {
    const stop = startSectionAddress();
    report({ "": "across" });
    scroll();
    flushFrames();
    expect(address()).toBe("/");

    report({ "": "above", field: "across" });
    expect(address()).toBe("/#field");
    report({ field: "above", work: "across" });
    expect(address()).toBe("/#work");
    report({ work: "above", "making-of": "across" });
    expect(address()).toBe("/#making-of");
    report({ "making-of": "above", about: "across" });
    expect(address()).toBe("/#about");
    report({ about: "above", contact: "across" });
    expect(address()).toBe("/#contact");

    // Back up to the top.
    report({ contact: "below", about: "below", "making-of": "below" });
    report({ work: "below", field: "below", "": "across" });
    expect(address()).toBe("/");
    stop();
  });

  it("REQ-NAV-06 the footer keeps the last chapter's address; of two chapters across the band the later one names it", () => {
    const stop = startSectionAddress();
    scroll();
    report({ about: "across", contact: "across" });
    expect(address()).toBe("/#contact");
    report({ about: "above", contact: "above" });
    expect(address()).toBe("/#contact");
    stop();
  });

  it("REQ-NAV-06 a jump past the line with the footer over it names the last chapter, though only the hero was reported", () => {
    const stop = startSectionAddress();
    scroll();
    flushFrames();
    expect(address()).toBe("/");
    // End from the top: every chapter goes above the line in one frame, and
    // only the hero, which leaves the band, gets a report.
    place({
      field: "above",
      work: "above",
      "making-of": "above",
      about: "above",
      contact: "above",
    });
    report({ "": "above" });
    expect(address()).toBe("/#contact");
    // Home again: the hero comes back across.
    place({
      field: "below",
      work: "below",
      "making-of": "below",
      about: "below",
      contact: "below",
    });
    report({ "": "across" });
    expect(address()).toBe("/");
    stop();
  });

  it("REQ-NAV-06 replaces the address, never pushes one, writes each address once and keeps the query", () => {
    view().history.replaceState(null, "", "/?ref=a");
    const push = vi.spyOn(view().history, "pushState");
    const replace = vi.spyOn(view().history, "replaceState");
    const length = view().history.length;
    const stop = startSectionAddress();
    scroll();
    report({ work: "across" });
    report({ work: "across" });
    flushFrames();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith(null, "", expect.any(URL));
    expect(`${view().location.search}${view().location.hash}`).toBe(
      "?ref=a#work",
    );
    expect(push).not.toHaveBeenCalled();
    expect(view().history.length).toBe(length);
    stop();
    push.mockRestore();
    replace.mockRestore();
  });

  it("REQ-NAV-06 writes nothing before the page scrolls, so a link into the page keeps its address while it sits at the top", () => {
    view().history.replaceState(null, "", "/#about");
    const stop = startSectionAddress();
    report({ "": "across" });
    flushFrames();
    expect(address()).toBe("/#about");

    // The page goes to its part (the browser's jump, or the cover's lift).
    scroll();
    report({ "": "above", about: "across" });
    flushFrames();
    expect(address()).toBe("/#about");
    stop();
  });

  it("REQ-NAV-06 a scroll that moves no chapter across the line still writes, two frames on", () => {
    view().history.replaceState(null, "", "/#contact");
    const stop = startSectionAddress();
    report({ "": "across" });
    scroll();
    expect(address()).toBe("/#contact");
    flushFrames();
    expect(address()).toBe("/");
    stop();
  });

  it("REQ-NAV-06 REQ-LOAD-01 under the loader's cover a scroll arms nothing, and a cover brought back disarms it until the page scrolls again", () => {
    view().history.replaceState(null, "", "/#work");
    document.documentElement.setAttribute(LOADER_ATTRIBUTE, "up");
    const stop = startSectionAddress();
    report({ "": "across" });
    scroll();
    flushFrames();
    expect(address()).toBe("/#work");

    // The cover lifts and the page goes to its part.
    document.documentElement.setAttribute(LOADER_ATTRIBUTE, "done");
    scroll();
    report({ "": "above", work: "across" });
    flushFrames();
    expect(address()).toBe("/#work");

    document.documentElement.setAttribute(LOADER_ATTRIBUTE, "up");
    report({ work: "below", "": "across" });
    expect(address()).toBe("/#work");
    document.documentElement.setAttribute(LOADER_ATTRIBUTE, "done");
    report({ "": "across" });
    expect(address()).toBe("/#work");
    scroll();
    flushFrames();
    expect(address()).toBe("/");
    stop();
  });

  it("REQ-NAV-06 writes nothing once a move has changed the page's path", () => {
    const stop = startSectionAddress();
    scroll();
    report({ work: "across" });
    expect(address()).toBe("/#work");
    view().history.replaceState(null, "", "/about");
    report({ work: "above", about: "across" });
    expect(address()).toBe("/about");
    stop();
  });

  it("REQ-NAV-06 REQ-ENG-07 the teardown stops the observer and the scroll listener", () => {
    const stop = startSectionAddress();
    stop();
    expect(observer().disconnected).toBe(true);
    scroll();
    expect(frames).toHaveLength(0);
  });

  it("REQ-NAV-06 with no IntersectionObserver or no chapters it does nothing", () => {
    Object.assign(view(), { IntersectionObserver: undefined });
    const replace = vi.spyOn(view().history, "replaceState");
    startSectionAddress()();
    Object.assign(view(), { IntersectionObserver: FakeObserver });
    document.body.innerHTML = "<main></main>";
    startSectionAddress()();
    expect(FakeObserver.last).toBeNull();
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });
});
