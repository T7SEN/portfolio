import { headlines } from "@/content/hero";

type HeroHeadlineProps = {
  id: string;
  text: string;
};

// The other headline is drawn by a hidden ::before in the h1's grid cell, so
// the cell is as tall as the longer line at any width and the swap after the
// engine reports moves nothing (D-027, REQ-PERF-03). Kept in a data attribute
// rather than page text, so the static HTML never states the tier 1 and 2
// claim, even with CSS off or in a reader view (A14).
export function HeroHeadline({ id, text }: HeroHeadlineProps) {
  const reserved = text === headlines.still ? headlines.gpu : headlines.still;

  return (
    <div
      data-reserve={reserved}
      className="grid grid-cols-1 before:invisible before:col-start-1 before:row-start-1 before:font-display before:text-display before:content-[attr(data-reserve)]"
    >
      <h1 id={id} className="col-start-1 row-start-1 font-display text-display">
        {text}
      </h1>
    </div>
  );
}
