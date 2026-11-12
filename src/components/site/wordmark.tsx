import { cx } from "./class-names";

/** bar: 16 px on phones, 20 px from 640 px. md: 20 px. */
export type WordmarkSize = "bar" | "md";

type WordmarkProps = {
  as?: "span" | "p";
  size?: WordmarkSize;
  className?: string;
};

const SIZES: Record<WordmarkSize, string> = {
  bar: "text-base sm:text-xl",
  md: "text-xl",
};

// The T7SEN wordmark: Unbounded Bold, tracked wide, as the previews set it.
// Real text, so it stays sharp at any zoom and reads as T7SEN.
export function Wordmark({
  as: Tag = "span",
  size = "md",
  className,
}: WordmarkProps) {
  return (
    <Tag
      className={cx(
        "font-display leading-none font-bold tracking-[0.08em]",
        SIZES[size],
        className,
      )}
    >
      T7SEN
    </Tag>
  );
}
