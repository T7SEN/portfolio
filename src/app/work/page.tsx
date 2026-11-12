import type { Metadata } from "next";

import { ClosingPanel, PageTitle } from "@/components/pages";
import { Container } from "@/components/site";
import { StudyTable } from "@/components/study/study-table";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.work.title,
};

const HEADING_ID = "page-heading";

// The target of See the work: plain HTML, no 3D (REQ-CNT-02).
export default function WorkPage() {
  return (
    <Container className="py-12 sm:py-16">
      <PageTitle label={pages.work.label} id={HEADING_ID}>
        {pages.work.heading}
      </PageTitle>
      <p className="mt-3.5 max-w-measure text-lead text-muted">
        {pages.work.intro}
      </p>
      <StudyTable labelledBy={HEADING_ID} className="mt-10" />
      <ClosingPanel
        text={pages.work.closing.text}
        action={pages.work.closing.action}
        className="mt-10"
      />
    </Container>
  );
}
