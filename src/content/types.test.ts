// These checks run under tsc (pnpm typecheck), which includes test files:
// each expect-error directive fails the type check when the line below it
// compiles, so a model that stops rejecting a broken study fails the gate.
import { describe, expect, it } from "vitest";
import { isMarker } from "./markers";
import { makingOf } from "./studies/making-of";
import { systemseven } from "./studies/systemseven";
import type { FullStudy, Link, Marker, Quote, ShortStudy } from "./types";

function omit<T extends object, K extends keyof T>(
  value: T,
  key: K,
): Omit<T, K> {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key),
  ) as Omit<T, K>;
}

const study: FullStudy = makingOf;

describe("full study outline", () => {
  it("REQ-CNT-03 a full study missing any of its seven parts does not compile", () => {
    // @ts-expect-error REQ-CNT-03: part 1, the summary
    const noSummary: FullStudy = omit(study, "summary");
    // @ts-expect-error REQ-CNT-03: part 2, problem, constraints and role
    const noProblem: FullStudy = omit(study, "problem");
    // @ts-expect-error REQ-CNT-03: part 3, the approach
    const noApproach: FullStudy = omit(study, "approach");
    // @ts-expect-error REQ-CNT-03: part 4, the hard part
    const noHardPart: FullStudy = omit(study, "hardPart");
    // @ts-expect-error REQ-CNT-03: part 5, the results
    const noResults: FullStudy = omit(study, "results");
    // @ts-expect-error REQ-CNT-03: part 6, what would change
    const noChange: FullStudy = omit(study, "wouldChange");
    // @ts-expect-error REQ-CNT-03: part 7, the links
    const noLinks: FullStudy = omit(study, "links");

    const broken = [
      [noSummary, "summary"],
      [noProblem, "problem"],
      [noApproach, "approach"],
      [noHardPart, "hardPart"],
      [noResults, "results"],
      [noChange, "wouldChange"],
      [noLinks, "links"],
    ] as const;
    for (const [value, part] of broken) expect(value).not.toHaveProperty(part);
  });

  it("REQ-CNT-03 a summary of two or four lines does not compile", () => {
    const twoLines: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: the summary is exactly three lines
      summary: ["One.", "Two."],
    };
    const fourLines: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: the summary is exactly three lines
      summary: ["One.", "Two.", "Three.", "Four."],
    };
    expect(twoLines.summary).toHaveLength(2);
    expect(fourLines.summary).toHaveLength(4);
  });

  it("REQ-CNT-03 part 2 without its role or constraints does not compile", () => {
    const { problem, constraints } = study.problem;
    const noRole: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: part 2 names the role
      problem: { problem, constraints },
    };
    const noConstraints: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: part 2 names the constraints
      problem: { problem, role: "Role." },
    };
    expect(noRole.problem).not.toHaveProperty("role");
    expect(noConstraints.problem).not.toHaveProperty("constraints");
  });

  it("REQ-CNT-03 an empty approach or empty results do not compile", () => {
    const noSteps: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: an unknown part holds a marker, not nothing
      approach: [],
    };
    const noRows: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: an unknown result holds a marker row
      results: [],
    };
    expect(noSteps.approach).toHaveLength(0);
    expect(noRows.results).toHaveLength(0);
  });
});

describe("proof rules", () => {
  it("REQ-CNT-05 a result without a source, or a bare number, does not compile", () => {
    const row = { label: "Visits", value: study.results[0].value };
    const unsourced: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-05: every result names its source
      results: [row],
    };
    const bareNumber: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-05: a figure is text with a source
      results: [{ ...row, value: 42, source: "Supplied by T7SEN" }],
    };
    expect(unsourced.results[0]).not.toHaveProperty("source");
    expect(typeof bareNumber.results[0].value).toBe("number");
  });

  it("REQ-CNT-05 a marker has its brackets and a link has a full address", () => {
    // @ts-expect-error REQ-CNT-05: a marker keeps its square brackets
    const notMarker: Marker = "FILL: the figure";
    // @ts-expect-error REQ-CNT-05: an address without its scheme is a guess
    const bare: Link = { label: "Live site", href: "links.t7sen.com" };
    const unknown: Link = study.links.live;
    expect(isMarker(notMarker)).toBe(false);
    expect(bare.href).not.toMatch(/^https:/);
    expect(isMarker(unknown.href)).toBe(true);
  });

  it("REQ-CNT-06 a quote without recorded permission does not compile", () => {
    // @ts-expect-error REQ-CNT-06: who allowed the quote, and when
    const unrecorded: Quote = { text: "Quoted words.", who: "A player" };
    const quoted: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-06: every quote in a study needs permission
      quotes: [unrecorded, { text: "Quoted words.", who: "A player" }],
    };
    expect(unrecorded).not.toHaveProperty("permission");
    expect(quoted.quotes).toHaveLength(2);
  });

  it("REQ-CNT-04 a short study in progress without its status does not compile", () => {
    // @ts-expect-error REQ-CNT-04: an unfinished project says where it stands
    const unclear: ShortStudy = omit(systemseven, "status");
    expect(unclear).not.toHaveProperty("status");
  });
});

describe("study listings", () => {
  const listing = study.listing;

  it("REQ-CNT-01 a study without its listing does not compile", () => {
    // @ts-expect-error REQ-CNT-01: a full study names its home row and table cells
    const noRow: FullStudy = omit(study, "listing");
    // @ts-expect-error REQ-CNT-01: so does a short study
    const noCard: ShortStudy = omit(systemseven, "listing");
    expect(noRow).not.toHaveProperty("listing");
    expect(noCard).not.toHaveProperty("listing");
  });

  it("REQ-CNT-03 a full study's row without figure slots or chips does not compile", () => {
    const noMetrics: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: an unknown figure holds a marker slot
      listing: { ...listing, metrics: [] },
    };
    const noStack: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-03: the row names its stack
      listing: { ...listing, stack: [] },
    };
    expect(noMetrics.listing.metrics).toHaveLength(0);
    expect(noStack.listing.stack).toHaveLength(0);
  });

  it("REQ-CNT-05 a row figure without a source does not compile", () => {
    const slot = { label: "Players", value: listing.metrics[0].value };
    const unsourced: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-05: every figure on a row names its source
      listing: { ...listing, metrics: [slot] },
    };
    expect(unsourced.listing.metrics[0]).not.toHaveProperty("source");
  });

  it("REQ-CNT-06 a row quote is a recorded quote or a marker, never bare words", () => {
    const words: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-06: words without permission are not a quote
      listing: { ...listing, quote: "Quoted words." },
    };
    const unrecorded: FullStudy = {
      ...study,
      // @ts-expect-error REQ-CNT-06: a row quote names who allowed it, and when
      listing: { ...listing, quote: { text: "Words.", who: "A player" } },
    };
    // Built from parts, so this file holds no marker text for the release
    // check to count.
    const marker = `[${"FILL"}: a player quote]` as const;
    const waiting: FullStudy = {
      ...study,
      listing: { ...listing, quote: marker },
    };
    expect(isMarker(String(words.listing.quote))).toBe(false);
    expect(unrecorded.listing.quote).not.toHaveProperty("permission");
    expect(isMarker(String(waiting.listing.quote))).toBe(true);
  });
});
