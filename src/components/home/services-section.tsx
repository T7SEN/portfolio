import { services } from "@/content/services";

import { HomeSection } from "./home-section";

// The two offers are set as type, each under a thin rule, not as boxes: a
// box that holds one line is mostly empty.
export function ServicesSection() {
  return (
    <HomeSection id="services" title="Services">
      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {services.offers.map((offer) => (
          <li key={offer} className="border-t border-edge pt-4 text-heading">
            {offer}
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-measure text-muted">{services.also}</p>
    </HomeSection>
  );
}
