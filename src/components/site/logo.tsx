import { useId } from "react";

import { colors } from "@/tokens/colors";

export type LogoVariant = "light" | "dark" | "purple";

type LogoProps = {
  variant: LogoVariant;
  className?: string;
  title?: string;
};

const POINTS =
  "464.22 0 464.22 7.43 411.18 73.13 186.22 351.77 113.09 442.36 113.09 325.94 186.22 235.35 317.19 73.13 186.22 73.13 186.22 164.38 113.09 254.97 113.09 73.13 0 73.13 0 0 464.22 0";

// The dark mark keeps the fill of its source file; it is a logo colour, not a
// palette token.
const DARK_MARK_FILL = "#111114";

// Size it with className, for example "h-7 w-auto". With a title the mark is
// an image with that name; without one it is hidden, for use inside a link or
// button that already names it.
export function Logo({ variant, className, title }: LogoProps) {
  // Unique per rendered mark, so two purple marks on one page never share a
  // gradient or filter id.
  const id = useId();
  const label = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const);

  if (variant === "purple") {
    const gradientId = `${id}gradient`;
    const glowId = `${id}glow`;

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="-20 -20 504.22 482.36"
        className={className}
        {...label}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colors["logo-red"]} />
            <stop offset="50%" stopColor={colors.violet} />
            <stop offset="100%" stopColor={colors["logo-blue"]} />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <polygon
          fill={`url(#${gradientId})`}
          filter={`url(#${glowId})`}
          points={POINTS}
        />
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 464.22 442.36"
      className={className}
      {...label}
    >
      <polygon
        // The light mark follows the text colour, so a link around it can
        // turn it glow on hover and focus like any other link.
        fill={variant === "light" ? "currentColor" : DARK_MARK_FILL}
        points={POINTS}
      />
    </svg>
  );
}
