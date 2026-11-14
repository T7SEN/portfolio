/** The calm toggle's key in session storage (calm-store.ts). */
export const CALM_KEY = "portfolio:calm";

/**
 * The scene's backing store never exceeds this many device pixels per CSS
 * pixel: fine lines stay sharp on a 2x screen, and a 3x phone draws 2.25
 * times fewer pixels than it would at its own ratio.
 */
export const PIXEL_RATIO_CAP = 2;

/** The entrance: stars, grid, ring and label, from the first paint. */
export const ENTRANCE_MS = 1000;

/** The label fades as the exit begins, while the scene fades its patch. */
export const LABEL_FADE_MS = 300;

/** Calm mode and reduced motion: a fade replaces the ripple. */
export const CALM_FADE_MS = 300;

/**
 * The CSS failsafe hides a cover that no script took over once the time
 * limit and this margin have passed (globals.css, the loader block).
 */
export const FAILSAFE_MARGIN_MS = 1000;

/**
 * An exit that never resolves is cut off here, so the cover cannot stay
 * up: the ripple takes 1.8 s (RIPPLE_MS in scene/ripple.ts).
 */
export const EXIT_LIMIT_MS = 4000;

/**
 * Draws the light scene while the GPU test runs. Off until the measurement
 * of the test with the loader drawing shows the full scene changes the
 * chosen tier or the median frame time (phase P4.5, drawing cost).
 */
export const LIGHT_DURING_TEST = false;

/** The phone sizing: below the site's 640 px breakpoint (Tailwind sm). */
export const PHONE_QUERY = "(width < 40rem)";

/** The html element's attributes, read by CSS and by tests. */
export const LOADER_ATTRIBUTE = "data-loader";
export const LOADER_OFF_ATTRIBUTE = "data-loader-off";

/** Why no cover shows on this load. JavaScript off is CSS only. */
export type CoverSkip = "calm" | "reduced" | "route";

export const COVER_SKIPS: readonly CoverSkip[] = ["calm", "reduced", "route"];
