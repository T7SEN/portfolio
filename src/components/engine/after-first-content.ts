// The longest an idle callback may wait on a busy main thread.
const IDLE_TIMEOUT_MS = 2000;
// For browsers with no requestIdleCallback.
const FALLBACK_DELAY_MS = 200;

function whenIdle(run: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(run, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback(handle);
  }

  const handle = setTimeout(run, FALLBACK_DELAY_MS);
  return () => clearTimeout(handle);
}

// The paint entry that says readable content is on screen.
const FIRST_CONTENT = "first-contentful-paint";
// The longest to wait for a paint the browser never reports.
const PAINT_TIMEOUT_MS = 5000;

// The load event can come before the first paint on a fast connection, so
// loaded does not yet mean seen. Browsers without paint timing skip the wait.
function whenPainted(run: () => void): () => void {
  const reportsPaints =
    typeof PerformanceObserver === "function" &&
    PerformanceObserver.supportedEntryTypes?.includes("paint") === true;
  if (!reportsPaints) {
    run();
    return () => undefined;
  }

  const observer = new PerformanceObserver((list) => {
    if (list.getEntriesByName(FIRST_CONTENT).length > 0) finish();
  });
  const timer = setTimeout(finish, PAINT_TIMEOUT_MS);
  const stop = () => {
    observer.disconnect();
    clearTimeout(timer);
  };
  function finish() {
    stop();
    run();
  }

  // Buffered, so a paint from before this call is reported too.
  observer.observe({ type: "paint", buffered: true });
  return stop;
}

/**
 * Runs the callback once the page has loaded, its content has painted and
 * the main thread is idle, so late code never competes with first content
 * (REQ-PERF-04, REQ-PERF-07). Returns a cancel that is safe to call at any
 * time.
 */
export function afterFirstContent(run: () => void): () => void {
  let cancelWait: (() => void) | null = null;
  const schedule = () => {
    let cancelIdle: (() => void) | null = null;
    const cancelPaint = whenPainted(() => {
      cancelIdle = whenIdle(run);
    });
    cancelWait = () => {
      cancelPaint();
      cancelIdle?.();
    };
  };

  if (document.readyState === "complete") {
    schedule();
    return () => cancelWait?.();
  }

  window.addEventListener("load", schedule, { once: true });
  return () => {
    window.removeEventListener("load", schedule);
    cancelWait?.();
  };
}
