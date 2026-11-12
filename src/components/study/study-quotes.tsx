import { Panel } from "@/components/site/panel";
import { isMarker } from "@/content/markers";
import { studyPage } from "@/content/pages";
import type { FullStudy } from "@/content/types";

type StudyQuotesProps = {
  quotes: NonNullable<FullStudy["quotes"]>;
};

const PANEL = "px-6 py-5 sm:px-7 sm:py-6";

// Quotes in raised panels, each with who said it and who allowed it and
// when (REQ-CNT-06). A quote still to come shows as its marker, muted and
// with no quotation marks, so it never reads as words a person said.
export function StudyQuotes({ quotes }: StudyQuotesProps) {
  if (typeof quotes === "string") {
    return (
      <Panel tone="raised" padding="none" className={PANEL}>
        <p className="text-muted">{quotes}</p>
      </Panel>
    );
  }

  return (
    <ul className="grid gap-4">
      {quotes.map((quote, index) => {
        const { grantedBy, date } = quote.permission;
        const isWaiting = isMarker(quote.text);
        const Words = isWaiting ? "div" : "blockquote";

        return (
          <li key={index}>
            <Panel as="figure" tone="raised" padding="none" className={PANEL}>
              <Words
                className={isWaiting ? "text-muted" : "text-lead text-text"}
              >
                <p>{isWaiting ? quote.text : `“${quote.text}”`}</p>
              </Words>
              <figcaption className="mt-3 flex flex-col gap-1 text-sm text-muted">
                <span>{quote.who}</span>
                <span>{`${studyPage.permission} ${grantedBy}, ${date}.`}</span>
              </figcaption>
            </Panel>
          </li>
        );
      })}
    </ul>
  );
}
