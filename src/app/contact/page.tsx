import type { Metadata } from "next";

import { CopyAddress } from "@/components/pages/copy-address";
import { DotFloor, PageTitle } from "@/components/pages";
import { Container, DashedBox, Panel } from "@/components/site";
import { pages } from "@/content/pages";

export const metadata: Metadata = {
  title: pages.contact.title,
};

// The address is shown with a Copy button [T7SEN, 11 Nov 2026]. The message
// form takes the end column at P6; until then its place holds the marker,
// with no fields that could not send.
export default function ContactPage() {
  const { address, hiring } = pages.contact;

  return (
    <div className="relative isolate">
      <DotFloor />
      <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-20">
        <div className="flex flex-col gap-5">
          <PageTitle label={pages.contact.label} id="page-heading">
            {pages.contact.heading}
          </PageTitle>
          <p className="max-w-measure text-lead text-muted">
            {pages.contact.intro}
          </p>
          <CopyAddress
            email={address.email}
            href={address.href}
            copy={address.copy}
            className="mt-2"
          />
          <Panel padding="md" className="mt-2 flex flex-col gap-1.5">
            <h2 className="text-base font-semibold">{hiring.title}</h2>
            <p className="text-[0.9375rem] leading-relaxed text-muted">
              {hiring.text}
            </p>
          </Panel>
        </div>
        <div className="flex min-h-40">
          {/* A solid fill, so the dots behind never sit under its words. */}
          <DashedBox className="flex-1 justify-center bg-void py-6 text-center">
            {pages.contact.form}
          </DashedBox>
        </div>
      </Container>
    </div>
  );
}
