import { Fragment } from "react";

import { cx, MONO_CAPS } from "./class-names";

/**
 * muted: chapter and study labels, metric labels. violet: the eyebrow and
 * small accents (violet on void 5.08 to 1). glow: a chosen item's label.
 */
export type LabelTone = "muted" | "violet" | "glow";

/** xs: 11 px (metric labels, notes under a link). sm: 12 px. md: 13 px (the eyebrow). */
export type LabelSize = "xs" | "sm" | "md";

type LabelProps = {
  /**
   * The words, in sentence case: the style sets the capitals, so a screen
   * reader reads words, not letters. Two or more are joined by a middle dot
   * ("All work · No 3D").
   */
  parts: readonly [string, ...string[]];
  /**
   * A home chapter's number, shown before a slash ("01 / Field"). It is for
   * sighted readers only, so a heading reads as the chapter's name alone.
   */
  number?: string;
  as?: "p" | "span" | "div" | "h2" | "h3" | "dt";
  tone?: LabelTone;
  size?: LabelSize;
  id?: string;
  className?: string;
};

const TONES: Record<LabelTone, string> = {
  muted: "text-muted",
  violet: "text-violet",
  glow: "text-glow",
};

// From the preview: chapter labels and the eyebrow track 0.16em, study labels
// 0.14em, the 11 px metric labels 0.1em.
const SIZES: Record<LabelSize, string> = {
  xs: "text-[0.6875rem] leading-[1.4] tracking-[0.1em]",
  sm: "text-xs leading-[1.4] tracking-[0.14em]",
  md: "text-label tracking-[0.16em]",
};

const CHAPTER_SIZES: Record<LabelSize, string> = {
  ...SIZES,
  sm: "text-xs leading-[1.4] tracking-[0.16em]",
};

export function Label({
  parts,
  number,
  as: Tag = "p",
  tone = "muted",
  size = "sm",
  id,
  className,
}: LabelProps) {
  return (
    <Tag
      id={id}
      className={cx(
        MONO_CAPS,
        TONES[tone],
        (number === undefined ? SIZES : CHAPTER_SIZES)[size],
        className,
      )}
    >
      {number !== undefined && <span aria-hidden="true">{`${number} / `}</span>}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {/* The dot is hidden; the spaces round it stay, so the words never
              run together for a screen reader. */}
          {index > 0 && (
            <>
              {" "}
              <span aria-hidden="true">·</span>{" "}
            </>
          )}
          {part}
        </Fragment>
      ))}
    </Tag>
  );
}
