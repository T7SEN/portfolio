// These checks run under tsc (pnpm typecheck), which includes test files:
// each expect-error directive fails the type check when the line below it
// compiles, so a model that stops rejecting a broken study fails the gate.
import { describe, expect, it } from "vitest";
import { isMarker } from "./markers";
import { makingOf } from "./studies/making-of";
import { systemseven } from "./studies/systemseven";
import type {
  ApproachDiagram,
  CodeExcerpt,
  FullStudy,
  Link,
  Marker,
  Quote,
  Screenshot,
  ShortStudy,
} from "./types";

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

describe("study page parts", () => {
  it("REQ-CNT-03 a full study without its tag, role line, screenshot, diagram or excerpt does not compile", () => {
    // @ts-expect-error REQ-CNT-03: the label's tag word
    const noTag: FullStudy = omit(study, "tag");
    // @ts-expect-error REQ-CNT-03: the facts row's role line
    const noRole: FullStudy = omit(study, "roleLine");
    // @ts-expect-error REQ-CNT-03: the screenshot, or a marker in its place
    const noShot: FullStudy = omit(study, "screenshot");
    // @ts-expect-error REQ-CNT-03: part 3's diagram, or a marker in its place
    const noDiagram: FullStudy = omit(study, "diagram");
    // @ts-expect-error REQ-CNT-03: part 3's code excerpt, or a marker
    const noExcerpt: FullStudy = omit(study, "excerpt");

    const broken = [
      [noTag, "tag"],
      [noRole, "roleLine"],
      [noShot, "screenshot"],
      [noDiagram, "diagram"],
      [noExcerpt, "excerpt"],
    ] as const;
    for (const [value, part] of broken) expect(value).not.toHaveProperty(part);
  });

  it("REQ-CNT-04 a short study without its tag does not compile", () => {
    // @ts-expect-error REQ-CNT-04: the label's tag word
    const noTag: ShortStudy = omit(systemseven, "tag");
    expect(noTag).not.toHaveProperty("tag");
  });

  it("REQ-CNT-05 a screenshot without its alt text or size, or words in its place, does not compile", () => {
    const unnamed = {
      src: "/work/shot.webp",
      caption: "A caption.",
      width: 1600,
      height: 900,
    } as const;
    const unsized = {
      src: "/work/shot.webp",
      alt: "What the picture shows.",
      caption: "A caption.",
    } as const;
    // @ts-expect-error REQ-CNT-05: a picture names what it shows
    const noAlt: Screenshot = unnamed;
    // @ts-expect-error REQ-CNT-05: its size holds its place while it loads
    const noSize: Screenshot = unsized;
    // @ts-expect-error REQ-CNT-05: a picture still to come is a marker
    const words: FullStudy["screenshot"] = "a screenshot of the game";
    expect(noAlt).not.toHaveProperty("alt");
    expect(noSize).not.toHaveProperty("width");
    expect(isMarker(String(words))).toBe(false);
  });

  it("REQ-PERF-01 a screenshot without its smaller phone file does not compile", () => {
    const desktopOnly = {
      src: "/work/shot.webp",
      alt: "What the picture shows.",
      caption: "A caption.",
      width: 1168,
      height: 620,
    } as const;
    // @ts-expect-error REQ-PERF-01: phones get a smaller file of the picture
    const noPhone: Screenshot = desktopOnly;
    expect(noPhone).not.toHaveProperty("phone");
  });

  it("REQ-CNT-03 a diagram of one box, or an arrow without its label, does not compile", () => {
    const first = { title: "First box", line: "One line." };
    const second = { title: "Second box", line: "One line.", via: "Calls" };
    // @ts-expect-error REQ-CNT-03: arrows join two boxes at least
    const one: ApproachDiagram = { name: "A", boxes: [first] };
    // @ts-expect-error REQ-CNT-03: every arrow carries its mono label
    const bare: ApproachDiagram = { name: "A", boxes: [first, first] };
    const drawn: ApproachDiagram = { name: "A", boxes: [first, second] };
    expect(one.boxes).toHaveLength(1);
    expect(bare.boxes[1]).not.toHaveProperty("via");
    expect(drawn.boxes[1]).toHaveProperty("via", "Calls");
  });

  it("REQ-CNT-03 a code excerpt that does not name its file does not compile", () => {
    const unnamed = {
      caption: "A caption.",
      language: "TypeScript",
      code: "export {};",
    };
    // @ts-expect-error REQ-CNT-03: an excerpt names the file it comes from
    const excerpt: CodeExcerpt = unnamed;
    expect(excerpt).not.toHaveProperty("path");
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
    // Built from parts, so this file holds no marker text for the release
    // check to count.
    const unknown: Link = {
      label: "Live site",
      href: `[${"FILL"}: the live link]`,
    };
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

  it("REQ-CNT-06 a study's quotes are recorded quotes or a marker, never bare words", () => {
    // @ts-expect-error REQ-CNT-06: words without permission are not a quote
    const words: FullStudy["quotes"] = "Quoted words.";
    // @ts-expect-error REQ-CNT-06: an unknown quote holds a marker, not nothing
    const none: FullStudy["quotes"] = [];
    // Built from parts, so this file holds no marker text for the release
    // check to count.
    const waiting: FullStudy["quotes"] = `[${"FILL"}: a player quote]` as const;
    expect(isMarker(String(words))).toBe(false);
    expect(none).toHaveLength(0);
    expect(isMarker(String(waiting))).toBe(true);
  });

  it("REQ-CNT-04 a short study in progress without its status does not compile", () => {
    // @ts-expect-error REQ-CNT-04: an unfinished project says where it stands
    const unclear: ShortStudy = omit(systemseven, "status");
    expect(unclear).not.toHaveProperty("status");
  });

  it("REQ-CNT-04 a shipped short study needs a link; one in progress may have none yet", () => {
    // @ts-expect-error REQ-CNT-04: a shipped project links to where it lives
    const shipped: ShortStudy = {
      ...omit(systemseven, "status"),
      inProgress: false,
      links: [],
    };
    const waiting: ShortStudy = { ...systemseven, links: [] };
    expect(shipped.links).toHaveLength(0);
    expect(waiting.links).toHaveLength(0);
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
