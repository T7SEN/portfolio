import type { ButtonHTMLAttributes, ReactNode } from "react";

import { ArrowIcon } from "./arrow-icon";
import { cx, HAIRLINE, HAIRLINE_STRONG } from "./class-names";
import { arrowFor, SiteAnchor } from "./site-anchor";

/**
 * primary: the one lavender action (glow fill, void text, 7.39 to 1).
 * outline: a secondary action with a firmer hairline.
 * quiet: controls and corner pills with the faint hairline.
 */
export type PillVariant = "primary" | "outline" | "quiet";

/**
 * lg: 52 px, the hero's actions. md: 44 px, Geist 14 px. sm: 44 px, Geist
 * Mono 12 px (Skip intro, the corner and footer pills). bar: the header's
 * links, tighter below 640 px so the bar's row holds at 320 px.
 */
export type PillSize = "lg" | "md" | "sm" | "bar";

/** auto: forward or out after the words, by the link's address; down: before them. */
export type PillArrow = "auto" | "down" | "none";

const VARIANTS: Record<PillVariant, string> = {
  // Brightens to paper like every link; void on paper is 18.33 to 1.
  primary:
    "bg-glow font-semibold text-void hover:bg-paper focus-visible:bg-paper",
  outline: cx(
    "border font-medium text-text hover:border-edge hover:text-paper focus-visible:text-paper",
    HAIRLINE_STRONG,
  ),
  quiet: cx(
    "border text-text hover:border-edge hover:text-paper focus-visible:text-paper",
    HAIRLINE,
  ),
};

// Each is at least 44 by 44 CSS px. A minimum height, not a fixed one, so a
// label that wraps at 200% zoom grows the pill instead of spilling out.
const SIZES: Record<PillSize, string> = {
  lg: "min-h-13 px-6.5 py-2 text-[0.9375rem]",
  md: "min-h-11 px-4 py-1.5 text-sm",
  sm: "min-h-11 px-4 py-1.5 font-mono text-xs tracking-[0.06em]",
  bar: "min-h-11 px-2 py-1.5 text-[0.8125rem] font-medium sm:px-4 sm:text-sm",
};

const GAPS: Record<PillSize, string> = {
  lg: "gap-2.5",
  md: "gap-2.5",
  sm: "gap-2",
  bar: "gap-2",
};

const ARROW_SIZES: Record<PillSize, string> = {
  lg: "size-4",
  md: "size-3.5",
  sm: "size-3.5",
  bar: "size-3.5",
};

type PillStyle = { variant?: PillVariant; size?: PillSize };

/**
 * The pill's classes, for a control that draws its own inside (the Calm
 * switch). gap: false leaves the space between icon and words to the caller,
 * since two gap classes on one element would fight.
 */
export function pillClassName({
  variant = "outline",
  size = "md",
  gap = true,
}: PillStyle & { gap?: boolean } = {}) {
  return cx(
    "inline-flex min-w-11 cursor-pointer items-center justify-center rounded-full text-center leading-tight transition-colors",
    VARIANTS[variant],
    SIZES[size],
    gap && GAPS[size],
  );
}

type PillLinkProps = PillStyle & {
  href: string;
  children: ReactNode;
  /** Defaults to auto on primary pills and none on the others. */
  arrow?: PillArrow;
  className?: string;
};

export function PillLink({
  href,
  children,
  variant = "outline",
  size = "md",
  arrow = variant === "primary" ? "auto" : "none",
  className,
}: PillLinkProps) {
  const iconClass = ARROW_SIZES[size];

  return (
    <SiteAnchor
      href={href}
      className={cx(pillClassName({ variant, size }), className)}
    >
      {arrow === "down" && <ArrowIcon direction="down" className={iconClass} />}
      {children}
      {arrow === "auto" && (
        <ArrowIcon direction={arrowFor(href)} className={iconClass} />
      )}
    </SiteAnchor>
  );
}

type PillButtonProps = PillStyle &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "type"> & {
    children: ReactNode;
    className?: string;
    type?: "button" | "submit";
  };

export function PillButton({
  variant = "outline",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: PillButtonProps) {
  return (
    <button
      type={type}
      className={cx(pillClassName({ variant, size }), className)}
      {...rest}
    >
      {children}
    </button>
  );
}
