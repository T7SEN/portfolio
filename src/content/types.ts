// The content model. A study that leaves out a part of its outline does not
// compile; a part that is not known yet holds a visible marker instead
// (REQ-CNT-03, REQ-CNT-05).

// Written without the literal opening text, so the release check, which
// fails on any marker left in src, finds only real markers (REQ-CNT-05).
/** In square brackets: FILL, a fact T7SEN must supply; CONFIRM, a fact to check. */
export type Marker = `[${"FILL" | "CONFIRM"}${string}]`;

/** Copy that may still hold a marker until the fact is supplied. */
export type Text = string;

export type NonEmpty<T> = readonly [T, ...T[]];

/** A page on this site, a fragment, an address on another site, or a marker. */
export type Href =
  | `/${string}`
  | `#${string}`
  | `https://${string}`
  | `mailto:${string}`
  | Marker;

export type Link = { label: Text; href: Href };

/**
 * A mono label. Its parts are joined by a middle dot on screen ("All work ·
 * No 3D"). The words are stored in sentence case and the label style sets
 * the capitals, so a screen reader reads words, not letters.
 */
export type MonoLabel = NonEmpty<Text>;

/** A quote never appears without who allowed it and when (REQ-CNT-06). */
export type Quote = {
  text: Text;
  who: Text;
  permission: { grantedBy: Text; date: Text };
};

export type Tier = 1 | 2 | 3;

/**
 * One line in two forms. The still form is true on every tier and is the one
 * in the static HTML; the gpu form speaks of the live field, so it shows only
 * while a tier 1 or 2 field is on screen (A14).
 */
export type TierLines = { gpu: Text; still: Text };

export type FullSlug = "making-of" | "coup-online" | "archelab";
export type ShortSlug = "t7sen-url" | "systemseven";
export type StudySlug = FullSlug | ShortSlug;

/** Every number shown names where it came from. */
export type ResultRow = { label: Text; value: Text; source: Text };

/** How a study is listed: its home row or card, and its row in the /work table. */
export type Listing = {
  /** The kind label: "Case study" after a full study's number, the badge on a short card. */
  kind: Text;
  /** The word in the /work table's Study column and on a phone's compact row. */
  studyLabel: Text;
  /** The home row's line, or the short card's. */
  line: Text;
  /** The stack as the row shows it: chips on a full study's row, one line joined by middle dots on a short card. */
  stack: NonEmpty<Text>;
  /** The /work table's What it is cell. */
  what: Text;
  /** The /work table's Built with cell. */
  builtWith: Text;
  /** The lighter second link beside the study link, muted and underlined. */
  secondary?: Link;
};

export type FullListing = Listing & {
  /** Figure slots under the line. A value stays a marker until its figure and source are supplied (REQ-CNT-05). */
  metrics: NonEmpty<ResultRow>;
  /**
   * A quote on the row: a recorded quote, or a marker until one is supplied.
   * A marker is shown as a marker, never in quotation marks as if a person
   * said it (REQ-CNT-06).
   */
  quote?: Quote | Marker;
};

// The seven parts run from summary to links, in this order on the page.
export type FullStudy = {
  kind: "full";
  slug: FullSlug;
  title: Text;
  leadAngle: Text;
  notice?: Text;
  listing: FullListing;
  summary: readonly [Text, Text, Text];
  problem: { problem: Text; constraints: NonEmpty<Text>; role: Text };
  approach: NonEmpty<Text>;
  hardPart: Text;
  results: NonEmpty<ResultRow>;
  wouldChange: NonEmpty<Text>;
  links: { live: Link; repo?: Link };
  quotes?: readonly Quote[];
};

type ShortStudyBase = {
  kind: "short";
  slug: ShortSlug;
  title: Text;
  listing: Listing;
  what: Text;
  why: Text;
  stack: NonEmpty<Text>;
  links: NonEmpty<Link>;
};

// A study in progress must say where it stands, so its page never reads as
// a shipped product (REQ-CNT-04).
export type ShortStudy = ShortStudyBase &
  ({ inProgress: false } | { inProgress: true; status: Text });

export type Study = FullStudy | ShortStudy;
