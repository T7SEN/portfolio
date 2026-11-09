import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Unbounded } from "next/font/google";

// Downloaded at build time and served from this site, so visitors never
// request Google. Preloaded because every page title on the first screen is
// set in it.
export const unbounded = Unbounded({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-unbounded",
});

export { GeistMono, GeistSans };

export const fontVariables = [
  GeistSans.variable,
  GeistMono.variable,
  unbounded.variable,
].join(" ");
