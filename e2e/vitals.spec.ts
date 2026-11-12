import { expect, test } from "@playwright/test";

import { fullStudies, studyHref } from "../src/content";
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

const title = (subject: string) =>
  `REQ-PERF-01 REQ-PERF-03 ${subject} keeps LCP and CLS in budget on Slow 4G with a 4x CPU slowdown`;
// The phone gets tier 2 by itself; the last case forces the tier 3 still,
// the one path that puts a full-screen picture on the page. Every full
// study is measured, since each carries a screenshot.
const VITALS_CASES = [
  ...["/", "/work", ...fullStudies.map((study) => studyHref(study.slug))].map(
    (path) => ({
      path,
      label: path,
      title: title(path),
      isTier3: false,
    }),
  ),
  {
    path: "/",
    label: "/ tier 3",
    title: title("/ on tier 3 with the still"),
    isTier3: true,
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

for (const { path, label, title, isTier3 } of VITALS_CASES) {
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
    });

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
    console.log(line);
    if (hasField(path)) console.log(`vitals ${label} ${field}`);
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
