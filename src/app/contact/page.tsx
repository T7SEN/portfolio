import type { Metadata } from "next";

import { Container } from "@/components/site";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.contact.title,
};

export default function ContactPage() {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-title">{pages.contact.title}</h1>
      <p className="mt-4 max-w-measure text-lead text-muted">
        {pages.contact.intro}
      </p>
      <p className="mt-10 max-w-measure rounded-lg border border-dashed border-edge p-6 font-mono text-sm text-muted">
        {pages.contact.form}
      </p>
    </Container>
  );
}
