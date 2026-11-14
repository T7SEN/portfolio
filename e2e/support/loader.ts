import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { ENGINE_MARKER } from "../../scripts/budget-lib.mjs";
import {
  CALM_KEY,
  EXIT_LIMIT_MS,
  LOADER_ATTRIBUTE,
  LOADER_OFF_ATTRIBUTE,
} from "../../src/components/loader/loader-config";
import { LOADER_SCRIPT } from "../../src/components/loader/loader-script";
import { LIFT_LIMIT_MS } from "../../src/lib/loader-store";
import { FIELD } from "./tiers";

// Helpers for the home page's loader cover (phase P4.5, REQ-LOAD-01): the
// way every other spec loads the home page without it, and what the
// loader's own specs read of it (e2e/loader.spec.ts and
// e2e/headed/loader.spec.ts).

export const COVER = "[data-loader-cover]";
export const COVER_CANVAS = `${COVER} canvas`;
export const COVER_STATUS = `${COVER} [role="status"]`;

// The cover is gone by this long after its first paint whatever the engine
// does: the time limit, then the longest the exit may run. The rest is room
// for a page that loads slowly while the gate's workers share the CPU.
export const LIFT_TIMEOUT_MS = LIFT_LIMIT_MS + EXIT_LIMIT_MS + 15_000;

/** The loader's inline script as React writes it into the head of every page. */
export const LOADER_SCRIPT_ELEMENT = `<script>${LOADER_SCRIPT}</script>`;

// What takes its place: the same element with nothing to run, as a policy
// that blocks the script leaves it in the page, so React hydrates the head
// it rendered (a missing element would be a hydration mismatch).
const EMPTY_SCRIPT = "<script></script>";

// The site's own page addresses: no build file and no file name, any query.
// A regular expression, which Playwright matches before the test hears of a
// request, so other requests never wait on the test.
const PAGE_URL = /^https?:\/\/[^/]+(?:\/(?!_next\/)[^?#.]*)?(?:[?#].*)?$/;

/**
 * Loads every page of the target as a browser that never ran the loader's
 * inline script, as a content security policy that blocks it would (D-136,
 * D-144): each document's HTML is fetched by the test and served with that
 * script emptied, so the html element gets no mark, and no cover shows on
 * any route, a move to "/" from inside the site included. Nothing in the
 * production code knows of it. Call it before page.goto in every spec that
 * opens "/" and is not about the loader. A page covers its own loads; a
 * context covers every page opened in it. An HTML page without the script,
 * or with it twice, fails its load with a message that says so.
 *
 * The test fetches the document itself, outside the browser's network
 * emulation, so a page on an emulated network uses withLoaderScriptError.
 */
export async function withoutLoader(
  target: Page | BrowserContext,
): Promise<void> {
  await target.route(PAGE_URL, async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const type = response.headers()["content-type"] ?? "";
    if (!type.includes("text/html")) {
      await route.fulfill({ response });
      return;
    }
    const body = await response.text();
    const found = body.split(LOADER_SCRIPT_ELEMENT).length - 1;
    if (found !== 1) {
      const message = `withoutLoader: ${request.url()} holds the loader's inline script ${found} times, not once; has its markup changed?`;
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: message,
      });
      throw new Error(message);
    }
    await route.fulfill({
      response,
      body: body.replace(LOADER_SCRIPT_ELEMENT, EMPTY_SCRIPT),
    });
  });
}

/**
 * For a page on an emulated network, where withoutLoader would take the
 * document off it (the vitals measured on Slow 4G): the loader's inline
 * script throws at its first mark on the html element, as an error in it
 * would, so the element gets no mark and no cover shows, a move to "/"
 * included (D-136, D-144). Nothing in the production code knows of it.
 * Call before page.goto.
 */
export async function withLoaderScriptError(page: Page): Promise<void> {
  await page.addInitScript(
    (names) => {
      const prototype = Element.prototype;
      const setAttribute = prototype.setAttribute;
      const restore = () => {
        prototype.setAttribute = setAttribute;
      };
      prototype.setAttribute = function (
        this: Element,
        name: string,
        value: string,
      ) {
        if (this === document.documentElement && names.includes(name)) {
          restore();
          throw new Error("The test stops the loader's inline script here.");
        }
        setAttribute.call(this, name, value);
      };
      // The script runs while the head is parsed; nothing after is touched.
      document.addEventListener("DOMContentLoaded", restore, { once: true });
    },
    [LOADER_ATTRIBUTE, LOADER_OFF_ATTRIBUTE],
  );
}

/** Turns calm mode on for the tab before any page script runs, as the bar's toggle leaves it. */
export async function withCalmKey(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, "on");
    } catch {
      // A document with no storage of its own (about:blank) has no home
      // page to cover.
    }
  }, CALM_KEY);
}

/** What the cover and the field showed when an attribute the loader cares about changed. */
export type LoaderMark = {
  at: number;
  on: "html" | "cover" | "field";
  name: string;
  value: string | null;
  cover: {
    state: string | null;
    exit: string | null;
    outcome: string | null;
    label: string | null;
  } | null;
  field: { ready: string | null; tier: string | null; opacity: number } | null;
};

export type LoaderLog = {
  marks: LoaderMark[];
  /**
   * Each write of data-loader on the html element, timed as it is made. A
   * mark is taken only when the observer runs, after the task that made
   * the change, so it can trail the write by that task's length.
   */
  writes: { at: number; value: string }[];
  /** Animation frames sampled, when the recorder samples frames. */
  frames: number;
  /** Frames on which a cover was displayed. */
  shownFrames: number;
  firstShownAt: number | null;
  /** The first contentful paint, else the first paint, as the cover times itself (first-paint.ts). */
  firstPaint: number | null;
};

type LoaderWindow = Window & { __loaderLog?: Omit<LoaderLog, "firstPaint"> };

/**
 * Records, from before any page script runs, every change of the loader's
 * attributes on the html element, the cover and the field's wrapper, with
 * the time and what the cover and the field showed then. With frames, it
 * also checks on every animation frame whether a cover is displayed; leave
 * that off where frame pacing is measured.
 */
export async function recordLoader(
  page: Page,
  { frames = true }: { frames?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ cover, field, names, loaderAttribute, sampleFrames }) => {
      const log: Omit<LoaderLog, "firstPaint"> = {
        marks: [],
        writes: [],
        frames: 0,
        shownFrames: 0,
        firstShownAt: null,
      };
      (window as LoaderWindow).__loaderLog = log;

      const setAttribute = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (
        this: Element,
        name: string,
        value: string,
      ) {
        if (this === document.documentElement && name === loaderAttribute) {
          log.writes.push({ at: performance.now(), value: String(value) });
        }
        setAttribute.call(this, name, value);
      };

      const coverState = () => {
        const element = document.querySelector(cover);
        if (element === null) return null;
        return {
          state: element.getAttribute("data-loader-state"),
          exit: element.getAttribute("data-loader-exit"),
          outcome: element.getAttribute("data-loader-outcome"),
          label: element.querySelector('[role="status"]')?.textContent ?? null,
        };
      };
      const fieldState = () => {
        const element = document.querySelector(field);
        if (element === null) return null;
        return {
          ready: element.getAttribute("data-ready"),
          tier: element.getAttribute("data-tier"),
          opacity: Number(getComputedStyle(element).opacity),
        };
      };

      new MutationObserver((records) => {
        const at = performance.now();
        for (const record of records) {
          const target = record.target;
          const name = record.attributeName;
          if (!(target instanceof Element) || name === null) continue;
          const on =
            target === document.documentElement
              ? "html"
              : target.matches(cover)
                ? "cover"
                : target.matches(field)
                  ? "field"
                  : null;
          if (on === null) continue;
          log.marks.push({
            at,
            on,
            name,
            value: target.getAttribute(name),
            cover: coverState(),
            field: fieldState(),
          });
        }
      }).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: names,
      });

      if (!sampleFrames) return;
      const sample = () => {
        log.frames += 1;
        const element = document.querySelector(cover);
        if (element !== null) {
          const style = getComputedStyle(element);
          if (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) > 0
          ) {
            log.shownFrames += 1;
            log.firstShownAt ??= performance.now();
          }
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    {
      cover: COVER,
      field: FIELD,
      names: [
        LOADER_ATTRIBUTE,
        LOADER_OFF_ATTRIBUTE,
        "data-loader-state",
        "data-loader-outcome",
        "data-loader-owned",
        "data-loader-exit",
        "data-loader-test",
        "data-loader-done",
        "data-ready",
        "data-tier",
      ],
      loaderAttribute: LOADER_ATTRIBUTE,
      sampleFrames: frames,
    },
  );
}

export async function readLoaderLog(page: Page): Promise<LoaderLog> {
  return page.evaluate(() => {
    const log = (window as LoaderWindow).__loaderLog;
    if (log === undefined) throw new Error("recordLoader was not called");
    const paint =
      performance.getEntriesByName("first-contentful-paint")[0] ??
      performance.getEntriesByName("first-paint")[0];
    return {
      ...structuredClone(log),
      firstPaint: paint?.startTime ?? null,
    };
  });
}

/** The first mark of an attribute with a value, or null. */
export function firstMark(
  log: LoaderLog,
  on: LoaderMark["on"],
  name: string,
  value?: string,
): LoaderMark | null {
  return (
    log.marks.find(
      (mark) =>
        mark.on === on &&
        mark.name === name &&
        (value === undefined ? mark.value !== null : mark.value === value),
    ) ?? null
  );
}

/**
 * When the loading ended and the cover lifted, in ms from what the cover
 * counts its times from: the page's first paint on a full load, or, after
 * a move inside the site, the island's write of data-loader="up", made just
 * before the cover starts its clock at its first frame.
 */
export type LiftTimes = {
  /** That moment, in ms from the document's start. */
  origin: number;
  /** The field's wrapper reported ready. */
  ready: number | null;
  /** The engine chose a tier. */
  tier: number | null;
  /** The cover began to leave. */
  leaving: number;
  /** The page was free: html data-loader="done". */
  done: number;
  /** The mark at which the cover began to leave. */
  atLeaving: LoaderMark;
  outcome: string | null;
  line: string;
};

export function liftTimes(
  log: LoaderLog,
  { from = "paint" }: { from?: "paint" | "move" } = {},
): LiftTimes {
  const up = log.writes.find((write) => write.value === "up");
  const origin = from === "paint" ? log.firstPaint : (up?.at ?? null);
  if (origin === null) {
    throw new Error(
      from === "paint"
        ? "The page reported no first paint"
        : "No cover went up after the move",
    );
  }
  const leaving = firstMark(log, "cover", "data-loader-state", "leaving");
  const done = firstMark(log, "html", LOADER_ATTRIBUTE, "done");
  if (leaving === null) throw new Error("The cover never began to leave");
  if (done === null) throw new Error("The page was never freed");
  const ready = firstMark(log, "field", "data-ready", "true");
  const tier = firstMark(log, "field", "data-tier");
  const outcome =
    leaving.cover?.outcome ??
    firstMark(log, "cover", "data-loader-outcome")?.value ??
    null;
  const since = (mark: LoaderMark | null) =>
    mark === null ? null : mark.at - origin;
  const times = {
    origin,
    ready: since(ready),
    tier: since(tier),
    leaving: leaving.at - origin,
    done: done.at - origin,
    atLeaving: leaving,
    outcome,
  };
  const ms = (value: number | null) =>
    value === null ? "none" : `${Math.round(value)} ms`;
  return {
    ...times,
    line:
      `${from === "paint" ? "first paint" : "cover up after the move"} ${Math.round(origin)} ms; from it: tier ${ms(times.tier)}, ` +
      `ready ${ms(times.ready)}, lift ${ms(times.leaving)} (${outcome ?? "no outcome"}, ` +
      `${leaving.cover?.exit ?? "no"} exit, label "${leaving.cover?.label ?? ""}"), ` +
      `page free ${ms(times.done)}`,
  };
}

/** Waits until the cover has lifted and the page is free, then until the cover has left the DOM. */
export async function waitForLift(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute(LOADER_ATTRIBUTE, "done", {
    timeout: LIFT_TIMEOUT_MS,
  });
  await expect(page.locator(COVER)).toHaveCount(0);
}

/**
 * The page once the cover has gone, or where it never showed: no cover and
 * no canvas of its own, nothing inert, the scroll lock released and the
 * page at its top. Unless a click has just moved focus, focus is at the top
 * of the document too, so the next Tab reaches the skip link.
 */
export async function expectPageFree(
  page: Page,
  { focusAtTop = true }: { focusAtTop?: boolean } = {},
): Promise<void> {
  await expect(page.locator(COVER)).toHaveCount(0);
  const state = await page.evaluate((field) => {
    const html = document.documentElement;
    return {
      inert: [...document.querySelectorAll("[inert]")].map((element) =>
        element.tagName.toLowerCase(),
      ),
      overflow: html.style.getPropertyValue("overflow"),
      gutter: html.style.getPropertyValue("scrollbar-gutter"),
      canvasesOutsideField: [...document.querySelectorAll("canvas")].filter(
        (canvas) => canvas.closest(field) === null,
      ).length,
      scrollY: window.scrollY,
      focus:
        document.activeElement === null ||
        document.activeElement === document.body
          ? "body"
          : document.activeElement.tagName.toLowerCase(),
    };
  }, FIELD);
  expect(state).toEqual({
    inert: [],
    overflow: "",
    gutter: "",
    canvasesOutsideField: 0,
    scrollY: 0,
    focus: focusAtTop ? "body" : state.focus,
  });
}

/**
 * Whether a pointer at the element's centre reaches it: nothing inert holds
 * it and nothing, the cover above all, lies over it.
 */
export function reachOf(
  locator: Locator,
): Promise<{ inert: boolean; underCover: boolean; hit: boolean }> {
  return locator.evaluate((element, cover) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      inert: element.closest("[inert]") !== null,
      underCover: (hit?.closest(cover) ?? null) !== null,
      hit: hit !== null && (hit === element || element.contains(hit)),
    };
  }, COVER);
}

/**
 * Holds the engine's entry chunk, found by the marker its code carries
 * (scripts/budget-lib.mjs), so a test decides when, or whether, the engine
 * loads: "hold" answers it on release, or never; "abort" fails it as a
 * network error would. Every other chunk passes untouched. Call before
 * page.goto.
 */
export async function holdEngine(
  page: Page,
  mode: "hold" | "abort",
): Promise<{ release: () => void; requested: Promise<void> }> {
  const released = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/_next/static/chunks/**", async (route) => {
    try {
      const response = await route.fetch();
      const body = await response.text();
      if (!body.includes(ENGINE_MARKER)) {
        await route.fulfill({ response, body });
        return;
      }
      requested.resolve();
      if (mode === "abort") {
        await route.abort("failed");
        return;
      }
      await released.promise;
      await route.fulfill({ response, body });
    } catch {
      // The page closed while the chunk was held.
    }
  });
  return {
    release: () => released.resolve(),
    requested: requested.promise,
  };
}
