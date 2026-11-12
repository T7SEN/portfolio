import { cx, RULE } from "@/components/site/class-names";
import { Label } from "@/components/site/label";
import { pages } from "@/content/pages";
import { services } from "@/content/services";

// What T7SEN takes on, inside the contact chapter: the two headline offers,
// each a subhead and one line, then the one "also" line and the line for
// recruiters (REQ-CNT-11). They sit beside the way to send a message, so a
// reader who wants one of them is already there.
export function ServicesSection() {
  return (
    <div>
      <Label size="xs" parts={[pages.home.contact.servicesLabel]} />
      <ul className="mt-6 flex flex-col gap-7">
        {services.offers.map((offer) => (
          <li key={offer.title}>
            <h3 className="text-xl font-semibold">{offer.title}</h3>
            <p className="mt-2 text-base leading-[1.6] text-muted">
              {offer.description}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-8 text-[0.9375rem] leading-[1.6] text-muted">
        {services.also}
      </p>
      <p
        className={cx(
          "mt-7 border-t pt-6 text-[0.9375rem] leading-[1.6] text-text",
          RULE,
        )}
      >
        {services.hiring}
      </p>
    </div>
  );
}
