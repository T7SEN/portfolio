import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCalmStore } from "@/lib/calm-store";
import { LIFT_LIMIT_MS } from "@/lib/loader-store";

import {
  CALM_FADE_MS,
  CALM_KEY,
  ENTRANCE_MS,
  FAILSAFE_MARGIN_MS,
} from "./loader-config";
import { LOADER_NOSCRIPT, LOADER_SCRIPT } from "./loader-script";

const html = document.documentElement;

type Setting = {
  path?: string;
  reduced?: boolean;
  calm?: boolean;
  /** No matchMedia at all. */
  noMedia?: boolean;
  /** Reading session storage throws, as with storage blocked. */
  blocked?: boolean;
};

/** Runs the inline script as the browser would in the head. */
function run({
  path = "/",
  reduced = false,
  calm = false,
  noMedia = false,
  blocked = false,
}: Setting = {}) {
  window.history.replaceState(null, "", path);
  sessionStorage.clear();
  if (calm) sessionStorage.setItem(CALM_KEY, "on");
  vi.stubGlobal(
    "matchMedia",
    noMedia
      ? undefined
      : (query: string) => ({
          matches: query === "(prefers-reduced-motion: reduce)" && reduced,
        }),
  );
  html.removeAttribute("data-loader");
  html.removeAttribute("data-loader-off");
  if (blocked) {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new Error("blocked");
    });
  }
  new Function(LOADER_SCRIPT)();
  vi.restoreAllMocks();
  return {
    up: html.getAttribute("data-loader"),
    off: html.getAttribute("data-loader-off"),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  html.removeAttribute("data-loader");
  html.removeAttribute("data-loader-off");
  window.history.replaceState(null, "", "/");
});

describe("loader inline script", () => {
  it("REQ-LOAD-01 marks the cover up on every full load of the home page: a first load, a reload, a later visit, whatever the address's query", () => {
    expect(run()).toEqual({ up: "up", off: null });
    // The script keeps nothing between loads, so the next load decides the
    // same way.
    expect(run()).toEqual({ up: "up", off: null });
    expect(run({ path: "/?ref=home" })).toEqual({ up: "up", off: null });
    expect(run({ path: "/#work" })).toEqual({ up: "up", off: null });
  });

  it("REQ-LOAD-01 reads one key from session storage, the calm toggle's, and writes none", () => {
    expect(LOADER_SCRIPT.match(/getItem\(/g)).toHaveLength(1);
    expect(LOADER_SCRIPT).toContain(`getItem(${JSON.stringify(CALM_KEY)})`);
    expect(LOADER_SCRIPT).not.toMatch(/setItem|removeItem|localStorage/);
  });

  it("REQ-LOAD-01 shows no cover on any other route", () => {
    expect(run({ path: "/work" })).toEqual({ up: null, off: "route" });
    expect(run({ path: "/work/coup-online" }).off).toBe("route");
  });

  it("REQ-LOAD-01 REQ-A11Y-03 shows no cover under OS reduced motion", () => {
    expect(run({ reduced: true })).toEqual({ up: null, off: "reduced" });
  });

  it("REQ-LOAD-01 REQ-A11Y-04 shows no cover with calm mode chosen, from the calm store's own key", () => {
    expect(run({ calm: true })).toEqual({ up: null, off: "calm" });

    // The key is the one the calm toggle writes.
    sessionStorage.clear();
    createCalmStore(window).setChosen(true);
    expect(sessionStorage.getItem(CALM_KEY)).toBe("on");
  });

  it("REQ-LOAD-01 the reasons go in order: route, reduced, calm", () => {
    expect(run({ path: "/about", reduced: true, calm: true }).off).toBe(
      "route",
    );
    expect(run({ reduced: true, calm: true }).off).toBe("reduced");
    expect(run({ calm: true }).off).toBe("calm");
  });

  it("REQ-LOAD-01 a browser without matchMedia still decides", () => {
    expect(run({ noMedia: true })).toEqual({ up: "up", off: null });
  });

  it("REQ-LOAD-01 blocked storage reads as calm off, and an error leaves no cover", () => {
    expect(run({ blocked: true })).toEqual({ up: "up", off: null });

    vi.stubGlobal("matchMedia", () => {
      throw new Error("broken");
    });
    html.removeAttribute("data-loader");
    new Function(LOADER_SCRIPT)();
    expect(html.getAttribute("data-loader")).toBeNull();
    expect(html.getAttribute("data-loader-off")).toBeNull();
  });

  it("REQ-LOAD-01 the script is small, old syntax and names no file", () => {
    expect(LOADER_SCRIPT.length).toBeLessThan(700);
    expect(LOADER_SCRIPT).not.toMatch(/=>|\blet\b|\bconst\b|`/);
  });

  it("REQ-CNT-01 with scripts off a style hides the cover", () => {
    expect(LOADER_NOSCRIPT).toBe(
      "<style>[data-loader-cover]{display:none!important}</style>",
    );
  });
});

describe("loader styles", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("REQ-LOAD-01 the cover shows only once the script marks the html element", () => {
    expect(css).toMatch(/\[data-loader-cover\] \{\s*display: none;/);
    expect(css).toMatch(
      /html\[data-loader="up"\] \[data-loader-cover\] \{\s*display: block;/,
    );
  });

  it("REQ-LOAD-01 the CSS failsafe hides a cover no script took over after the time limit and its margin", () => {
    const failsafe =
      /animation: loader-failsafe ([\d.]+)s ease-out ([\d.]+)s forwards;/.exec(
        css,
      );
    expect(Number(failsafe?.[2]) * 1000).toBe(
      LIFT_LIMIT_MS + FAILSAFE_MARGIN_MS,
    );
    expect(css).toMatch(
      /\[data-loader-cover\]\[data-loader-owned\] \{\s*animation: none;/,
    );
    expect(css).toMatch(
      /@keyframes loader-failsafe \{\s*to \{\s*opacity: 0;\s*visibility: hidden;/,
    );
  });

  it("REQ-LOAD-01 REQ-A11Y-03 reduced motion hides a cover the island has not taken over", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-loader="up"\] \[data-loader-cover\]:not\(\[data-loader-owned\]\) \{\s*display: none;/,
    );
  });

  it("REQ-LOAD-01 REQ-A11Y-04 the fade and the label's entrance match their constants", () => {
    expect(css).toContain(
      `transition: opacity ${CALM_FADE_MS / 1000}s ease-out !important;`,
    );
    const entrance =
      /animation: loader-label-in ([\d.]+)s ease-out ([\d.]+)s backwards;/.exec(
        css,
      );
    expect(
      Math.round((Number(entrance?.[1]) + Number(entrance?.[2])) * 1000),
    ).toBe(ENTRANCE_MS);
  });
});
