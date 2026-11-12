import { Panel } from "@/components/site/panel";
import type { FullListing } from "@/content/types";

type RowQuoteProps = {
  quote: NonNullable<FullListing["quote"]>;
};

// The quote on a study's home row, in a raised panel. A quote that is still a
// marker shows as the marker, muted and with no quotation marks, so it never
// reads as words a person said (REQ-CNT-06).
export function RowQuote({ quote }: RowQuoteProps) {
  if (typeof quote === "string") {
    return (
      <Panel tone="raised" padding="none" className="mt-5 px-5 py-4">
        <p className="text-[0.9375rem] leading-[1.55] text-muted">{quote}</p>
      </Panel>
    );
  }

  return (
    <Panel as="figure" tone="raised" padding="none" className="mt-5 px-5 py-4">
      <blockquote className="text-[0.9375rem] leading-[1.55] text-text">
        <p>{`“${quote.text}”`}</p>
      </blockquote>
      <figcaption className="mt-2 text-sm text-muted">{quote.who}</figcaption>
    </Panel>
  );
}
