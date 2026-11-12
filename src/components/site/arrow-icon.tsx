import { cx } from "./class-names";

export type ArrowDirection = "forward" | "out" | "down";

type ArrowIconProps = {
  /** forward: a page on this site; out: another site; down: further down this page. */
  direction: ArrowDirection;
  className?: string;
};

const PATHS: Record<ArrowDirection, string> = {
  forward: "M5 12h14M13 6l6 6-6 6",
  out: "M7 17 17 7M8 7h9v9",
  down: "M12 5v14M6 13l6 6 6-6",
};

// The preview's own strokes. Always beside words that say where it goes, so
// it is hidden from assistive technology. Forward and out point along the
// line of text, so they mirror on right-to-left pages; down does not.
export function ArrowIcon({ direction, className }: ArrowIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx(
        "shrink-0",
        direction !== "down" && "rtl:-scale-x-100",
        className,
      )}
    >
      <path d={PATHS[direction]} />
    </svg>
  );
}
