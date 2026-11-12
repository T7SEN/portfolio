import type { FullSlug } from "@/content/types";

/**
 * The tier 3 picture inside each full study's frame on the home page: the
 * study's shape as the live field forms it, captured with the field's own
 * stills (public/still, WebP, chosen by size in e2e/gpu/stills.spec.ts). One
 * map, so the capture and the page agree on the names.
 */
export const STUDY_STILLS = {
  "making-of": "/still/work-making-of.webp",
  "coup-online": "/still/work-coup-online.webp",
  archelab: "/still/work-archelab.webp",
} as const satisfies Record<FullSlug, `/still/${string}`>;
