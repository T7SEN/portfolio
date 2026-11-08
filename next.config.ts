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
  };
}
