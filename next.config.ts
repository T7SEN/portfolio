import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// The engine page is named page.dev.tsx, so it is a route only while the
// development server runs and never enters a production build (REQ-ENG-04).
export default function config(phase: string): NextConfig {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    pageExtensions: isDevServer
      ? ["dev.tsx", "tsx", "ts", "jsx", "js"]
      : ["tsx", "ts", "jsx", "js"],
    experimental: {
      // The stylesheet arrives inside the HTML as style elements, not as a
      // render-blocking request of its own, so a slow phone paints the hero
      // without waiting for it (REQ-PERF-01, decision D-110). Production
      // builds only (inlineCss.md in the version-matched docs). P6's content
      // security policy must allow these style elements.
      inlineCss: true,
    },
  };
}
