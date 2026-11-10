// The one place the site reaches the engine. A dynamic import keeps the
// engine, and three.js behind it, out of every route's first load
// (REQ-PERF-04).
export function loadEngine() {
  return import("@/engine");
}
