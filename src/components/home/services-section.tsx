import { services } from "@/content/services";

import { HomeSection } from "./home-section";

export function ServicesSection() {
  return (
    <HomeSection id="services" title="Services">
      <ul className="grid gap-4 sm:grid-cols-2">
        {services.offers.map((offer) => (
          <li
            key={offer}
            className="rounded-lg border border-raised bg-surface p-5 text-heading sm:p-6"
          >
            {offer}
          </li>
        ))}
      </ul>
      <p className="mt-6 max-w-measure text-muted">{services.also}</p>
    </HomeSection>
  );
}
