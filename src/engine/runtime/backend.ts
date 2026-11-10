import type { WebGPURenderer } from "three/webgpu";

import type { Backend } from "../types";

/**
 * The backend that is live after init(). Asking for WebGPU can still give
 * WebGL2, because the renderer falls back by itself when WebGPU fails to
 * start.
 */
export function liveBackend(renderer: WebGPURenderer): Backend {
  // @types/three 0.187.0 types renderer.backend as the abstract Backend,
  // which has neither backend flag, so the narrowing is kept in this one
  // place. The source sets isWebGLBackend to true on the WebGL2 backend only.
  const { backend } = renderer;
  return "isWebGLBackend" in backend && backend.isWebGLBackend === true
    ? "webgl2"
    : "webgpu";
}
