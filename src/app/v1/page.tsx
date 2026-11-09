import type { Metadata } from "next";

import { Container } from "@/components/site";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.v1.title,
};

export default function V1Page() {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-title">{pages.v1.title}</h1>
      <p className="mt-4 max-w-measure text-lead text-muted">
        {pages.v1.intro}
      </p>
      <p className="mt-10 max-w-measure rounded-lg border border-dashed border-edge p-6 font-mono text-sm text-muted">
        {pages.v1.archive}
      </p>
    </Container>
  );
}
