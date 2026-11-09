import type { Metadata } from "next";

import { Container, TextLink } from "@/components/site";

export const metadata: Metadata = {
  title: "Page not found",
};

// Unknown addresses and unknown study slugs land here, inside the site's own
// header and footer, with the fast path one click away.
export default function NotFound() {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-title">Page not found</h1>
      <p className="mt-4 max-w-measure text-lead text-muted">
        There is no page at this address.
      </p>
      <ul className="mt-8 flex flex-col">
        <li>
          <TextLink href="/work" className="inline-flex min-h-11 items-center">
            See the work
          </TextLink>
        </li>
        <li>
          <TextLink href="/" className="inline-flex min-h-11 items-center">
            Go to the home page
          </TextLink>
        </li>
      </ul>
    </Container>
  );
}
