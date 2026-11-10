// The engine's public surface. React reaches the engine only through this
// file. It must stay free of three.js: the runtime loads on demand from the
// controller, after the tier decision (REQ-PERF-04).

export { createEngine } from "./controller";
export type * from "./types";
