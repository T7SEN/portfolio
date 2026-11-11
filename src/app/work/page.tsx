import type { Metadata } from "next";

import { Container } from "@/components/site";
import { StudyList } from "@/components/study";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.work.title,
};

// The target of See the work: plain HTML, no 3D (REQ-CNT-02).
export default function WorkPage() {
  return (
    <Container className="py-12 sm:py-16">
      <h1 className="font-display text-title">{pages.work.title}</h1>
      <p className="mt-4 max-w-measure text-lead text-muted">
        {pages.work.intro}
      </p>
      <div className="mt-10">
        <StudyList headingLevel="h2" columns={2} />
      </div>
    </Container>
  );
}
