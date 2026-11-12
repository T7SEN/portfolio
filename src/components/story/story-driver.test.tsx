import { act, StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calmStore } from "@/lib/calm-store";
import { storyBridge } from "@/lib/story-bridge";

import { StoryDriver } from "./story-driver";

const mocks = vi.hoisted(() => ({
  scheduled: [] as Array<{ run: () => void; isCancelled: boolean }>,
  loadMotion: vi.fn(),
  startStory: vi.fn(),
  stops: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("@/components/engine/after-first-content", () => ({
  afterFirstContent: (run: () => void) => {
    const entry = { run, isCancelled: false };
    mocks.scheduled.push(entry);
    return () => {
      entry.isCancelled = true;
    };
  },
}));
vi.mock("@/lib/load-motion", () => ({ loadMotion: mocks.loadMotion }));
vi.mock("./story-runner", () => ({ startStory: mocks.startStory }));

const MOTION = { gsap: "gsap", ScrollTrigger: "st", SplitText: "split" };
const CHAPTERS = ["hero", "bloom", "work", "making-of", "about", "contact"];
// Every chapter 1000 px tall, stacked from the top of the page.
const HEIGHT = 1000;

let main: HTMLElement;
let reactRoot: Root | null = null;
let setStory: ReturnType<typeof vi.spyOn>;

async function mount(element: ReactElement = <StoryDriver />) {
  const host = main.lastElementChild as HTMLElement;
  reactRoot = createRoot(host);
  await act(async () => {
    reactRoot?.render(element);
  });
}

async function unmount() {
  const current = reactRoot;
  reactRoot = null;
  await act(async () => {
    current?.unmount();
  });
}

/** Runs the work waiting for first content, then lets its imports settle. */
async function reachFirstContent() {
  await act(async () => {
    for (const entry of mocks.scheduled) {
      if (!entry.isCancelled) entry.run();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.scheduled.length = 0;
  mocks.stops.length = 0;
  mocks.loadMotion.mockReset().mockResolvedValue(MOTION);
  mocks.startStory.mockReset().mockImplementation(() => {
    const stop = vi.fn();
    mocks.stops.push(stop);
    return stop;
  });
  setStory = vi.spyOn(storyBridge, "setStory");

  main = document.createElement("main");
  main.id = "main";
  main.innerHTML = CHAPTERS.map(
    (chapter) => `<section data-chapter="${chapter}"></section>`,
  ).join("");
  main.querySelectorAll("section").forEach((section, index) => {
    section.getBoundingClientRect = () =>
      ({ top: index * HEIGHT - window.scrollY, height: HEIGHT }) as DOMRect;
  });
  main.append(document.createElement("div"));
  document.body.append(main);
});

afterEach(async () => {
  await unmount();
  main.remove();
  setStory.mockRestore();
  storyBridge.reset();
  vi.unstubAllGlobals();
});

describe("StoryDriver", () => {
  it("REQ-CNT-01 renders nothing of its own", () => {
    expect(renderToStaticMarkup(<StoryDriver />)).toBe("");
  });

  it("REQ-SCR-01 sends the chapter in view as soon as it mounts, before any library loads", async () => {
    await mount();
    const middle = window.innerHeight / 2;
    expect(setStory).toHaveBeenCalledTimes(1);
    expect(setStory).toHaveBeenCalledWith("hero", middle / HEIGHT);
    expect(mocks.loadMotion).not.toHaveBeenCalled();
  });

  describe("the stages on mount", () => {
    const WIDTH = 1024;
    let setStage: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: WIDTH,
      });
      setStage = vi.spyOn(storyBridge, "setStage");
      // The dot's room at the top of the hero, and one study row whose
      // frame is in view.
      const [hero, , work] = main.querySelectorAll("section");
      const dot = document.createElement("div");
      dot.dataset.stage = "dot";
      dot.getBoundingClientRect = () =>
        ({
          top: 100 - window.scrollY,
          bottom: 300 - window.scrollY,
          left: 0,
          right: WIDTH,
          height: 200,
        }) as DOMRect;
      hero?.append(dot);
      const row = document.createElement("div");
      row.dataset.workStep = "0";
      row.getBoundingClientRect = () =>
        ({ top: 2000 - window.scrollY, height: 600 }) as DOMRect;
      const frame = document.createElement("div");
      frame.dataset.stage = "frame";
      frame.getBoundingClientRect = () =>
        ({
          top: 2100 - window.scrollY,
          bottom: 2400 - window.scrollY,
          left: 32,
          right: 992,
        }) as DOMRect;
      row.append(frame);
      work?.append(row);
    });

    afterEach(() => {
      setStage.mockRestore();
      Reflect.deleteProperty(document.documentElement, "clientWidth");
    });

    it("REQ-SCR-01 REQ-ENG-03 the stages reach the field before the story, the dot's place and the frame in view among them", async () => {
      await mount();
      expect(setStage).toHaveBeenCalledTimes(1);
      const [stages] = setStage.mock.calls[0] ?? [];
      const height = window.innerHeight;
      expect(stages?.hero?.y).toBeCloseTo(1 - 400 / height, 9);
      expect(stages?.hero?.halfWidth).toBe(1);
      // At the top of the page the frame shows 2,100 px down.
      expect(stages?.work?.y).toBeCloseTo(1 - 4500 / height, 9);
      const [stageOrder] = setStage.mock.invocationCallOrder;
      const [storyOrder] = setStory.mock.invocationCallOrder;
      expect(stageOrder).toBeLessThan(storyOrder ?? 0);
    });

    it("REQ-A11Y-03 in calm the first work stage is the frame at the screen's middle", async () => {
      const calm = vi
        .spyOn(calmStore, "getSnapshot")
        .mockReturnValue({ calm: true, system: true, chosen: false });
      await mount();
      const [stages] = setStage.mock.calls[0] ?? [];
      expect(stages?.work?.y).toBe(0);
      calm.mockRestore();
    });
  });

  it("REQ-PERF-04 GSAP and the story load only after first content", async () => {
    await mount();
    expect(mocks.scheduled).toHaveLength(1);
    expect(mocks.loadMotion).not.toHaveBeenCalled();
    expect(mocks.startStory).not.toHaveBeenCalled();

    await reachFirstContent();
    expect(mocks.loadMotion).toHaveBeenCalledTimes(1);
    expect(mocks.startStory).toHaveBeenCalledTimes(1);
    expect(mocks.startStory).toHaveBeenCalledWith(MOTION, { root: main });
  });

  it("REQ-SCR-04 leaving before first content cancels the wait and loads nothing", async () => {
    await mount();
    await unmount();
    expect(mocks.scheduled[0]?.isCancelled).toBe(true);
    expect(mocks.loadMotion).not.toHaveBeenCalled();
  });

  it("REQ-SCR-04 leaving while the libraries load never starts the story", async () => {
    let resolve: (motion: typeof MOTION) => void = () => undefined;
    mocks.loadMotion.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await mount();
    await act(async () => {
      mocks.scheduled[0]?.run();
    });
    await unmount();
    await act(async () => {
      resolve(MOTION);
      await new Promise((done) => setTimeout(done, 0));
    });
    expect(mocks.startStory).not.toHaveBeenCalled();
  });

  it("REQ-SCR-04 leaving the page tears the story down once, and coming back starts a new one", async () => {
    await mount();
    await reachFirstContent();
    const [firstStop] = mocks.stops;

    await unmount();
    expect(firstStop).toHaveBeenCalledTimes(1);

    mocks.scheduled.length = 0;
    await mount();
    await reachFirstContent();
    expect(mocks.startStory).toHaveBeenCalledTimes(2);
    expect(mocks.stops[1]).not.toHaveBeenCalled();
    expect(firstStop).toHaveBeenCalledTimes(1);
  });

  it("REQ-SCR-04 a double mount in strict mode leaves exactly one story running", async () => {
    await mount(
      <StrictMode>
        <StoryDriver />
      </StrictMode>,
    );
    await reachFirstContent();
    expect(mocks.startStory).toHaveBeenCalledTimes(1);
    expect(mocks.stops[0]).not.toHaveBeenCalled();
  });

  it("REQ-CNT-01 if the libraries fail to load, the page stays as it is", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.loadMotion.mockRejectedValue(new Error("offline"));
    const before = main.innerHTML;
    await mount();
    await reachFirstContent();
    expect(mocks.startStory).not.toHaveBeenCalled();
    expect(main.innerHTML).toBe(before);
    error.mockRestore();
  });

  it("REQ-SCR-01 does nothing without the page's main element", async () => {
    main.id = "";
    await mount();
    await reachFirstContent();
    expect(setStory).not.toHaveBeenCalled();
    expect(mocks.scheduled).toHaveLength(0);
  });
});
