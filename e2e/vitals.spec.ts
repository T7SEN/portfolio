import { expect, test } from "@playwright/test";

import { RIPPLE_MS } from "../src/components/loader/scene/ripple";
import { fullStudies, studyHref } from "../src/content";
import { LIFT_LIMIT_MS } from "../src/lib/loader-store";
import { LIFT_TIMEOUT_MS, withLoaderScriptError } from "./support/loader";
import { ROUTES } from "./support/routes";
import { asTier3, FIELD, STILL, waitForField } from "./support/tiers";

// The mid-range phone profile of decision D-019: Chrome DevTools' "Slow 4G"
// preset (front_end/core/sdk/NetworkManager.ts) and a 4x CPU slowdown.
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: 180_000,
  uploadThroughput: 84_375,
};
const CPU_SLOWDOWN = 4;

const LCP_LIMIT_MS = 2000; // REQ-PERF-01
const CLS_LIMIT = 0.05; // REQ-PERF-03

// Time after the load event for late shifts, such as a font swap, to land.
const SETTLE_MS = 1000;
// The latest the hero may be uncovered on a load of the home page: the time
// limit plus the ripple (REQ-PERF-01), with room for the timer and the frame
// the ripple ends on (the gate saw lifts at the limit land up to 13 ms late).
const UNCOVERED_LIMIT_MS = LIFT_LIMIT_MS + RIPPLE_MS + 100;

const title = (subject: string) =>
  `REQ-PERF-01 REQ-PERF-03 ${subject} keeps LCP and CLS in budget on Slow 4G with a 4x CPU slowdown`;
// The phone gets tier 2 by itself; the tier 3 case forces the tier 3 still,
// the one path that puts a full-screen picture on the page. Every full
// study is measured, since each carries a screenshot. The home page is
// measured as every load of it shows it, with the loader's cover [T7SEN,
// 14 Nov 2026, D-144]. Chrome's LCP does not see the cover, so that run is
// held to REQ-PERF-01 as rewritten for the cover [T7SEN, 14 Nov 2026]: the
// cover paints with the first frame (first contentful paint within the 2 s
// line) and the hero is uncovered no later than the time limit plus the
// ripple, both from the first contentful paint; its LCP is recorded, and it
// keeps the CLS line every load is held to. The home page is measured once
// more with no cover, as calm mode, reduced motion or a blocked script show
// it, held to the 2 s LCP line, and so on tier 3: the test makes the inline
// script fail (withLoaderScriptError), which keeps the document on the
// emulated network, where withoutLoader would fetch it outside.
const NO_COVER =
  "with no cover, as calm mode, reduced motion or a blocked script give it,";
const VITALS_CASES = [
  {
    path: "/",
    label: "/ with the cover",
    title:
      "REQ-PERF-01 REQ-PERF-03 REQ-LOAD-01 / with the loader's cover, as on every load, paints the cover within the LCP line, uncovers the hero within the time limit plus the ripple and keeps CLS in budget on Slow 4G with a 4x CPU slowdown",
    isTier3: false,
    hasCover: true,
  },
  {
    path: "/",
    label: "/ with no cover",
    title: title(`/ ${NO_COVER}`),
    isTier3: false,
    hasCover: false,
  },
  ...["/work", ...fullStudies.map((study) => studyHref(study.slug))].map(
    (path) => ({
      path,
      label: path,
      title: title(path),
      isTier3: false,
      hasCover: false,
    }),
  ),
  {
    path: "/",
    label: "/ tier 3",
    title: title(`/ on tier 3 with the still, ${NO_COVER}`),
    isTier3: true,
    hasCover: false,
  },
];
// The routes with the field behind them: the engine loads after first
// content there, so the measurement waits for it and counts what it moves.
const hasField = (path: string) =>
  ROUTES.some((route) => route.path === path && route.hasField === true);

type Shift = { value: number; startTime: number; moved: string };
type Vitals = {
  lcp: number | null;
  lcpElement: string;
  lcpTag: string;
  shifts: Shift[];
  /** When the cover began to leave, with the outcome it showed then. */
  lift: number | null;
  outcome: string | null;
  /** When the page was free of the cover. */
  uncovered: number | null;
};
type VitalsWindow = Window & { __vitals?: Vitals };
// layout-shift entries are not in TypeScript's DOM types.
type LayoutShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
  sources?: { node?: Node | null }[];
};

// CLS as Chrome defines it: the largest burst of shifts, where a burst ends
// after a gap of 1 s or at 5 s long.
function cumulativeLayoutShift(shifts: readonly Shift[]) {
  let largest = 0;
  let burst = 0;
  let burstStart = -Infinity;
  let previous = -Infinity;
  for (const { value, startTime } of [...shifts].sort(
    (a, b) => a.startTime - b.startTime,
  )) {
    if (startTime - previous >= 1000 || startTime - burstStart >= 5000) {
      burst = 0;
      burstStart = startTime;
    }
    burst += value;
    previous = startTime;
    largest = Math.max(largest, burst);
  }
  return largest;
}

for (const { path, label, title, isTier3, hasCover } of VITALS_CASES) {
  test(title, async ({ page }, testInfo) => {
    // Only the phone-vitals project runs this file (playwright.config.ts):
    // the mid-range phone profile, after the other projects, one at a time.
    // The throttled phone needs far longer than the default for the field.
    test.setTimeout(120_000);

    // Runs before any page script, so no entry is missed.
    await page.addInitScript(() => {
      const vitals: Vitals = {
        lcp: null,
        lcpElement: "",
        lcpTag: "",
        shifts: [],
        lift: null,
        outcome: null,
        uncovered: null,
      };
      (window as VitalsWindow).__vitals = vitals;

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LargestContentfulPaint[]) {
          vitals.lcp = entry.startTime;
          const text = (entry.element?.textContent ?? "").trim().slice(0, 60);
          vitals.lcpElement = entry.element
            ? `${entry.element.tagName.toLowerCase()} "${text}"`
            : "(removed from the page)";
          vitals.lcpTag = entry.element?.tagName.toLowerCase() ?? "none";
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftEntry[]) {
          if (!entry.hadRecentInput) {
            vitals.shifts.push({
              value: entry.value,
              startTime: entry.startTime,
              moved: (entry.sources ?? [])
                .map(({ node }) =>
                  node instanceof Element
                    ? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ""}`
                    : (node?.nodeName ?? "?"),
                )
                .join(" "),
            });
          }
        }
      }).observe({ type: "layout-shift", buffered: true });

      new MutationObserver((records) => {
        for (const { target, attributeName } of records) {
          if (!(target instanceof Element) || attributeName === null) continue;
          const value = target.getAttribute(attributeName);
          if (
            target === document.documentElement &&
            value === "done" &&
            vitals.uncovered === null
          ) {
            vitals.uncovered = performance.now();
          }
          if (value === "leaving" && vitals.lift === null) {
            vitals.lift = performance.now();
            vitals.outcome = target.getAttribute("data-loader-outcome");
          }
        }
      }).observe(document, {
        attributes: true,
        subtree: true,
        attributeFilter: ["data-loader", "data-loader-state"],
      });
    });

    // Other routes show no cover by themselves.
    const stopsScript = path === "/" && !hasCover;
    if (stopsScript) await withLoaderScriptError(page);
    if (isTier3) await asTier3(page);

    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", SLOW_4G);
    await client.send("Emulation.setCPUThrottlingRate", {
      rate: CPU_SLOWDOWN,
    });

    const response = await page.goto(path, { waitUntil: "load" });
    expect(response?.ok()).toBe(true);
    let field = "no field on this route";
    if (hasField(path)) {
      const { tier, reason } = await waitForField(page);
      const readyMs = await page.evaluate(() => Math.round(performance.now()));
      field = `field tier ${tier} (${reason}) ready by ${readyMs} ms`;
      if (isTier3)
        expect({ tier, reason }).toEqual({ tier: 3, reason: "save-data" });
      // The fade is part of what the visitor sees arrive.
      await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
      if (isTier3) await expect(page.locator(STILL)).toHaveCSS("opacity", "1");
    }
    if (hasCover) {
      await expect(page.locator("html")).toHaveAttribute(
        "data-loader",
        "done",
        { timeout: LIFT_TIMEOUT_MS },
      );
    }
    await page.evaluate(
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      SETTLE_MS,
    );

    const { vitals, responseStart, firstPaint } = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      return {
        vitals: (window as VitalsWindow).__vitals,
        responseStart: navigation?.responseStart ?? 0,
        firstPaint:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? null,
      };
    });
    if (!vitals || vitals.lcp === null) {
      throw new Error(`${label} reported no largest-contentful-paint entry`);
    }

    const cls = cumulativeLayoutShift(vitals.shifts);
    const line =
      `vitals ${label} LCP ${Math.round(vitals.lcp)} ms CLS ${cls.toFixed(3)}` +
      (isTier3 ? ` LCP element ${vitals.lcpTag}` : "");
    const shifts = vitals.shifts
      .map(
        ({ value, startTime, moved }) =>
          `${value.toFixed(4)} at ${Math.round(startTime)} ms (${moved})`,
      )
      .join(", ");
    const at = (time: number | null) =>
      time === null
        ? "none"
        : `${Math.round(time)} ms (${firstPaint === null ? "no first contentful paint" : `${Math.round(time - firstPaint)} ms after the first contentful paint`})`;
    const cover = hasCover
      ? `; cover lift ${at(vitals.lift)} on ${vitals.outcome ?? "no outcome"}, hero uncovered ${at(vitals.uncovered)}`
      : "";
    console.log(line + cover);
    if (hasField(path)) console.log(`vitals ${label} ${field}`);
    testInfo.annotations.push({
      type: "vitals",
      description: `${line}; LCP element ${vitals.lcpElement}; response start ${Math.round(responseStart)} ms; ${field}${cover}; shifts: ${shifts || "none"}`,
    });

    // Without the throttle the numbers would mean nothing.
    expect(responseStart, "Slow 4G latency is in effect").toBeGreaterThan(
      SLOW_4G.latency,
    );
    if (hasCover) {
      // The cover showed and lifted; its LCP is recorded, not judged.
      expect(vitals.lift, "the cover began to leave").not.toBeNull();
      expect(vitals.uncovered, "the hero was uncovered").not.toBeNull();
      if (firstPaint === null || vitals.uncovered === null) {
        throw new Error(`${label} reported no first contentful paint`);
      }
      expect
        .soft(
          firstPaint,
          "REQ-PERF-01 the cover's first contentful paint in ms",
        )
        .toBeLessThanOrEqual(LCP_LIMIT_MS);
      expect
        .soft(
          vitals.uncovered - firstPaint,
          "REQ-PERF-01 the hero uncovered, in ms after the first contentful paint",
        )
        .toBeLessThanOrEqual(UNCOVERED_LIMIT_MS);
    } else {
      expect(vitals.lift, "no cover").toBeNull();
      if (stopsScript) {
        await expect(page.locator("html")).not.toHaveAttribute("data-loader");
        await expect(page.locator("html")).not.toHaveAttribute(
          "data-loader-off",
        );
      }
      expect
        .soft(vitals.lcp, "REQ-PERF-01 LCP in ms")
        .toBeLessThanOrEqual(LCP_LIMIT_MS);
    }
    expect.soft(cls, "REQ-PERF-03 CLS").toBeLessThanOrEqual(CLS_LIMIT);
  });
}
