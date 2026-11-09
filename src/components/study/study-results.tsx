import type { NonEmpty, Quote, ResultRow } from "@/content/types";

type StudyResultsProps = {
  results: NonEmpty<ResultRow>;
  quotes?: readonly Quote[];
};

// Every value is shown with its source, so a reader can trace each number.
export function StudyResults({ results, quotes = [] }: StudyResultsProps) {
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2">
        {results.map((row, index) => (
          <div
            key={index}
            className="rounded-lg border border-raised bg-surface p-4"
          >
            <dt className="font-mono text-label text-muted">{row.label}</dt>
            <dd className="mt-2 text-lead">{row.value}</dd>
            <dd className="mt-2 text-sm text-muted">Source: {row.source}</dd>
          </div>
        ))}
      </dl>
      {quotes.length > 0 && (
        <ul className="mt-6 grid gap-4">
          {quotes.map((quote, index) => (
            <li key={index}>
              <figure className="border-s-2 border-edge ps-4">
                <blockquote className="max-w-measure">
                  <p>{quote.text}</p>
                </blockquote>
                <figcaption className="mt-2 text-sm text-muted">
                  {quote.who}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
