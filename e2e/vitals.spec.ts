import { expect, test } from "@playwright/test";

import { studyHref } from "../src/content";
import { FIELD, waitForField } from "./support/tiers";

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

const VITALS_ROUTES = ["/", "/work", studyHref("making-of")];
// The routes with the field behind them: the engine loads after first
// content there, so the measurement waits for it and counts what it moves.
const FIELD_ROUTES = ["/"];

type Shift = { value: number; startTime: number; moved: string };
type Vitals = { lcp: number | null; lcpElement: string; shifts: Shift[] };
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

for (const path of VITALS_ROUTES) {
  test(`REQ-PERF-01 REQ-PERF-03 ${path} keeps LCP and CLS in budget on Slow 4G with a 4x CPU slowdown`, async ({
    page,
  }, testInfo) => {
    // Only the phone-vitals project runs this file (playwright.config.ts):
    // the mid-range phone profile, after the other projects, one at a time.
    // The throttled phone needs far longer than the default for the field.
    test.setTimeout(120_000);

    // Runs before any page script, so no entry is missed.
    await page.addInitScript(() => {
      const vitals: Vitals = { lcp: null, lcpElement: "", shifts: [] };
      (window as VitalsWindow).__vitals = vitals;

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LargestContentfulPaint[]) {
          vitals.lcp = entry.startTime;
          const text = (entry.element?.textContent ?? "").trim().slice(0, 60);
          vitals.lcpElement = entry.element
            ? `${entry.element.tagName.toLowerCase()} "${text}"`
            : "(removed from the page)";
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
    });

    const client = await page.context().newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", SLOW_4G);
    await client.send("Emulation.setCPUThrottlingRate", {
      rate: CPU_SLOWDOWN,
    });

    const response = await page.goto(path, { waitUntil: "load" });
    expect(response?.ok()).toBe(true);
    let field = "no field on this route";
    if (FIELD_ROUTES.includes(path)) {
      const { tier, reason } = await waitForField(page);
      const readyMs = await page.evaluate(() => Math.round(performance.now()));
      field = `field tier ${tier} (${reason}) ready by ${readyMs} ms`;
      // The fade is part of what the visitor sees arrive.
      await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
    }
    await page.evaluate(
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      SETTLE_MS,
    );

    const { vitals, responseStart } = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation",
      ) as PerformanceNavigationTiming[];
      return {
        vitals: (window as VitalsWindow).__vitals,
        responseStart: navigation?.responseStart ?? 0,
      };
    });
    if (!vitals || vitals.lcp === null) {
      throw new Error(`${path} reported no largest-contentful-paint entry`);
    }

    const cls = cumulativeLayoutShift(vitals.shifts);
    const line = `vitals ${path} LCP ${Math.round(vitals.lcp)} ms CLS ${cls.toFixed(3)}`;
    const shifts = vitals.shifts
      .map(
        ({ value, startTime, moved }) =>
          `${value.toFixed(4)} at ${Math.round(startTime)} ms (${moved})`,
      )
      .join(", ");
    console.log(line);
    if (FIELD_ROUTES.includes(path)) console.log(`vitals ${path} ${field}`);
    testInfo.annotations.push({
      type: "vitals",
      description: `${line}; LCP element ${vitals.lcpElement}; response start ${Math.round(responseStart)} ms; ${field}; shifts: ${shifts || "none"}`,
    });

    // Without the throttle the numbers would mean nothing.
    expect(responseStart, "Slow 4G latency is in effect").toBeGreaterThan(
      SLOW_4G.latency,
    );
    expect
      .soft(vitals.lcp, "REQ-PERF-01 LCP in ms")
      .toBeLessThanOrEqual(LCP_LIMIT_MS);
    expect.soft(cls, "REQ-PERF-03 CLS").toBeLessThanOrEqual(CLS_LIMIT);
  });
}
