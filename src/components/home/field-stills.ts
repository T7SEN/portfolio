/**
 * The field chapter's tier 3 pictures, wide and tall: the wordmark as the
 * live field forms it, captured with the field's own stills (public/still,
 * JPEG, chosen by size in e2e/gpu/stills.spec.ts). One map, so the capture
 * and the page agree on the names.
 */
export const FIELD_STILLS = {
  wide: "/still/field-wordmark-wide.jpg",
  tall: "/still/field-wordmark-tall.jpg",
} as const satisfies Record<"wide" | "tall", `/still/${string}`>;
