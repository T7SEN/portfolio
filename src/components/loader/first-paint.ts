const CONTENT = "first-contentful-paint";
const FIRST = "first-paint";

/**
 * When the browser first painted the page, from its paint timing: the
 * first contentful paint, else the first paint. Null where it has reported
 * neither yet, or reports none.
 */
export function firstPaintAt(perf: Performance = performance): number | null {
  if (typeof perf.getEntriesByType !== "function") return null;
  const entries = perf.getEntriesByType("paint");
  const entry =
    entries.find((item) => item.name === CONTENT) ??
    entries.find((item) => item.name === FIRST);
  return entry?.startTime ?? null;
}

/**
 * Calls back with the first paint's time once the browser reports it, for
 * a page that mounted before its first paint was reported. Returns the
 * stop; a browser without paint timing never calls back.
 */
export function watchFirstPaint(report: (at: number) => void): () => void {
  const supported =
    typeof PerformanceObserver === "function" &&
    PerformanceObserver.supportedEntryTypes?.includes("paint") === true;
  if (!supported) return () => undefined;

  const observer = new PerformanceObserver(() => {
    const at = firstPaintAt();
    if (at === null) return;
    observer.disconnect();
    report(at);
  });
  observer.observe({ type: "paint", buffered: true });
  return () => observer.disconnect();
}
