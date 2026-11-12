import type { ReactNode } from "react";

import { cx, HAIRLINE, RULE } from "./class-names";

/**
 * surface: a framed panel on the page (cards, the contact panel). raised: a
 * panel inside or beside one (a quote), a step lighter. Text on either keeps
 * its checked pairs: text and muted on surface and on raised.
 */
export type PanelTone = "surface" | "raised";

/** none: the caller lays out the inside. md: 20 then 24 px. lg: 24 then 32 px. */
export type PanelPadding = "none" | "md" | "lg";

type PanelProps = {
  children: ReactNode;
  as?: "div" | "section" | "article" | "aside" | "figure" | "blockquote";
  tone?: PanelTone;
  padding?: PanelPadding;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  className?: string;
};

const TONES: Record<PanelTone, string> = {
  surface: cx("bg-surface", RULE),
  raised: cx("bg-raised", HAIRLINE),
};

const PADDINGS: Record<PanelPadding, string> = {
  none: "",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

// About 16 px corners, a hairline border and its own fill, so the field is
// never behind its text.
export function Panel({
  children,
  as: Tag = "div",
  tone = "surface",
  padding = "lg",
  className,
  ...rest
}: PanelProps) {
  return (
    <Tag
      className={cx(
        "rounded-2xl border",
        TONES[tone],
        PADDINGS[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
