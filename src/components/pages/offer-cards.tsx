import { cx, Label, Panel } from "@/components/site";
import type { Offer } from "@/content/services";

type OfferCardsProps = {
  offers: readonly Offer[];
  /** The mono label on every card ("Headline offer"). */
  label: string;
  className?: string;
};

// The two headline offers as framed cards, side by side from 768 px
// (REQ-CNT-11).
export function OfferCards({ offers, label, className }: OfferCardsProps) {
  return (
    <ul className={cx("grid gap-5 md:grid-cols-2", className)}>
      {offers.map((offer) => (
        <li key={offer.title} className="flex">
          <Panel className="flex flex-1 flex-col gap-2.5">
            <Label parts={[label]} tone="glow" />
            <h3 className="text-[1.375rem] leading-snug font-semibold">
              {offer.title}
            </h3>
            <p className="text-base leading-relaxed text-muted">
              {offer.description}
            </p>
          </Panel>
        </li>
      ))}
    </ul>
  );
}
