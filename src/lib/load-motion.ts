// GSAP, its two plugins and Lenis load only through these dynamic imports,
// after first content, never in a route's first load (REQ-PERF-04). The
// module cache gives every caller the same gsap and the same ScrollTrigger,
// so the scroll story and the smooth scroll share one ticker. The smooth
// scroll runs on every desktop route and needs no SplitText, so it loads
// through loadScrollTrigger; only the home page's story pays for SplitText.

export async function loadScrollTrigger() {
  const [{ gsap }, { ScrollTrigger }] = await Promise.all([
    import("gsap"),
    import("gsap/ScrollTrigger"),
  ]);
  // Registering twice is harmless, so callers need not coordinate.
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

export async function loadMotion() {
  const [{ gsap, ScrollTrigger }, { SplitText }] = await Promise.all([
    loadScrollTrigger(),
    import("gsap/SplitText"),
  ]);
  gsap.registerPlugin(SplitText);
  return { gsap, ScrollTrigger, SplitText };
}

export type Motion = Awaited<ReturnType<typeof loadMotion>>;

export async function loadLenis() {
  const { default: Lenis } = await import("lenis");
  return Lenis;
}
