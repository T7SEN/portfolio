import { Fragment } from "react";

type DotJoinedProps = {
  parts: readonly string[];
};

// Words joined by a middle dot ("Next.js 16 · React 19"). The dot is for the
// eye only; the spaces round it stay, so a screen reader reads the words
// apart and never says the dot.
export function DotJoined({ parts }: DotJoinedProps) {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && (
        <>
          {" "}
          <span aria-hidden="true">·</span>{" "}
        </>
      )}
      {part}
    </Fragment>
  ));
}
