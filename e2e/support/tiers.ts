import { expect, type Page, type Response } from "@playwright/test";

import { findDeferredLibraries } from "../../scripts/budget-lib.mjs";

// Tier forcing from the test side. Each helper adds an init script that
// changes what the page can see of the device before any page script runs,
// so the engine reaches the tier through its own decision table and the
// site ships no forcing code. Call them before page.goto.

export const FIELD = '[data-testid="engine-field"]';
export const HOST = `${FIELD} [data-part="host"]`;
export const CANVAS = `${HOST} > canvas`;
export const STILL = `${FIELD} img[data-part="still"]`;

// Many workers share one GPU in the gate, so a field can take far longer to
// draw its first frame than it does alone. Bounded, so a field that never
// arrives still fails.
export const ENGINE_TIMEOUT_MS = 60_000;

export type TierReport = { tier: number; reason: string | null };

/**
 * Hides navigator.gpu. A desktop then gets tier 2 with reason no-webgpu; a
 * phone gets tier 2 with reason phone either way (REQ-TIER-01, REQ-TIER-02).
 */
export async function asTier2(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "gpu");
  });
}

/**
 * Fakes the Save-Data preference, which the decision table reads first, so
 * every device gets tier 3 with reason save-data and loads no three.js
 * (REQ-TIER-03).
 */
export async function asTier3(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", {
      value: { saveData: true },
      configurable: true,
    });
  });
}

/**
 * The forced failure of REQ-ENG-08: no WebGPU, and no canvas gives a WebGL2
 * context. The engine tries tier 2, the renderer cannot start, and the page
 * ends on tier 3 with reason no-backend.
 */
export async function withoutAnyGpu(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "gpu");

    const getContext = HTMLCanvasElement.prototype.getContext;
    const refuseWebgl2 = function (
      this: HTMLCanvasElement,
      kind: string,
      ...rest: unknown[]
    ) {
      if (kind === "webgl2") return null;
      return Reflect.apply(getContext, this, [kind, ...rest]) as unknown;
    };
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value: refuseWebgl2,
      configurable: true,
      writable: true,
    });
  });
}

export async function readTier(page: Page): Promise<TierReport> {
  const field = page.locator(FIELD);
  return {
    tier: Number(await field.getAttribute("data-tier")),
    reason: await field.getAttribute("data-tier-reason"),
  };
}

/**
 * Waits until the chosen tier has drawn its first frame, or shows its still,
 * and returns the tier with the reason for it.
 */
export async function waitForField(page: Page): Promise<TierReport> {
  await expect(page.locator(FIELD)).toHaveAttribute("data-ready", "true", {
    timeout: ENGINE_TIMEOUT_MS,
  });
  return readTier(page);
}

/**
 * Waits until the field, or the tier 3 still's wrapper, has faded in, so a
 * screenshot shows the page as a visitor ends up seeing it.
 */
export async function waitForFieldShown(page: Page): Promise<TierReport> {
  const report = await waitForField(page);
  await expect(page.locator(FIELD)).toHaveCSS("opacity", "1");
  return report;
}

/**
 * How many frameRate events arrive within the wait. The wrapper's data-fps
 * is rewritten on every one, so each write counts one event.
 */
export function frameRateEvents(page: Page, waitMs: number): Promise<number> {
  return page.evaluate(
    ({ selector, wait }) =>
      new Promise<number>((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element === null) {
          reject(new Error(`Nothing matches ${selector}`));
          return;
        }
        let writes = 0;
        const observer = new MutationObserver((records) => {
          writes += records.length;
        });
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-fps"],
        });
        window.setTimeout(() => {
          observer.disconnect();
          resolve(writes);
        }, wait);
      }),
    { selector: FIELD, wait: waitMs },
  );
}

/**
 * Lets two frames pass. The engine learns that its host left or entered the
 * view from an IntersectionObserver, which reports with the frame after the
 * change, so a count taken at once could still catch one last event.
 */
export function afterTwoFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => window.setTimeout(resolve, 0)),
        );
      }),
  );
}

/** Resolves on the next frameRate event; rejects when none comes in time. */
export function nextFrameRateEvent(page: Page): Promise<void> {
  return page.evaluate(
    ({ selector, timeout }) =>
      new Promise<void>((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element === null) {
          reject(new Error(`Nothing matches ${selector}`));
          return;
        }
        const observer = new MutationObserver(() => {
          observer.disconnect();
          window.clearTimeout(timer);
          resolve();
        });
        const timer = window.setTimeout(() => {
          observer.disconnect();
          reject(new Error(`No frameRate event within ${timeout} ms`));
        }, timeout);
        observer.observe(element, {
          attributes: true,
          attributeFilter: ["data-fps"],
        });
      }),
    { selector: FIELD, timeout: ENGINE_TIMEOUT_MS },
  );
}

/** Collects every script response from the moment of the call. */
export function collectScripts(page: Page): Response[] {
  const scripts: Response[] = [];
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (
      response.request().resourceType() === "script" ||
      type.includes("javascript")
    ) {
      scripts.push(response);
    }
  });
  return scripts;
}

/** The URLs of the script responses that hold the named deferred library. */
export async function scriptsHolding(
  scripts: readonly Response[],
  library: string,
): Promise<string[]> {
  const urls: string[] = [];
  for (const response of scripts) {
    const source = await response.text();
    if (findDeferredLibraries(source).includes(library)) {
      urls.push(response.url());
    }
  }
  return urls;
}
