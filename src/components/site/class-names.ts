export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// The preview's hairlines sit between the raised and edge tokens, so they are
// the edge token at a lower strength over the page: about #2D2D38 and #3B3B49
// on void, against the preview's #2A2631 and #3A3542. They outline shapes a
// label or a word already names, so they carry no contrast duty; focus has its
// own ring (globals.css).
/** Pills, chips, badges, the boxed link. */
export const HAIRLINE = "border-edge/40";
/** Outline pills and the dashed box for what is still to come. */
export const HAIRLINE_STRONG = "border-edge/55";
/** Rules between chapters and panel borders: the preview's #1E1B24. */
export const RULE = "border-raised";

/**
 * A link's underline, laid on its words' own box and never the link's: a
 * link laid out as a flex box (inline-flex, for its 44 px target) makes its
 * arrow a flex item, and a flex item takes its parent's underline.
 */
export const LINK_UNDERLINE = "underline underline-offset-2";

/**
 * Link hover and focus: the text brightens to the lightest token. The preview
 * goes to full white; paper (#F4F4F7) is the nearest colour the palette has.
 */
export const LINK_HOVER =
  "transition-colors hover:text-paper focus-visible:text-paper";

/** Mono capitals: labels, badges and small meta. */
export const MONO_CAPS = "font-mono uppercase";
