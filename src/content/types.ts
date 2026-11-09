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

/** A quote never appears without who allowed it and when (REQ-CNT-06). */
export type Quote = {
  text: Text;
  who: Text;
  permission: { grantedBy: Text; date: Text };
};

export type Tier = 1 | 2 | 3;

export type FullSlug = "making-of" | "coup-online" | "archelab";
export type ShortSlug = "t7sen-url" | "systemseven";
export type StudySlug = FullSlug | ShortSlug;

/** Every number shown names where it came from. */
export type ResultRow = { label: Text; value: Text; source: Text };

// The seven parts run from summary to links, in this order on the page.
export type FullStudy = {
  kind: "full";
  slug: FullSlug;
  title: Text;
  leadAngle: Text;
  notice?: Text;
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
