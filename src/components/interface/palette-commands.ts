import { studies, studyHref } from "@/content";
import {
  type PaletteSection,
  type PaletteTierChoice,
  paletteCopy,
} from "@/content/palette";
import type { Text } from "@/content/types";
import type { EggId, Tier, TierReason } from "@/engine/types";

/** Where a Go to row leads: a page of the site, or a chapter of the home page. */
export type GoTarget =
  | { kind: "page"; href: `/${string}` }
  | { kind: "section"; id: PaletteSection };

/** A row of the palette: its cmdk value, its words and what the search also matches. */
export type PaletteRow = {
  /** The row's cmdk value, unique across the palette. */
  value: string;
  label: Text;
  keywords: readonly string[];
};

export type GoRow = PaletteRow & { target: GoTarget };

export type SettingId = "background" | "ticks" | "tier" | "calm";
export type SettingRow = PaletteRow & { id: SettingId };

// REQ-PRIV-06: the analytics opt-out joins the actions at P6, with analytics
// ([T7SEN, 14 Nov 2026] "At P6, with analytics"): a new id here, its row
// below and its case in the dialog's runAction.
export type ActionId = "copy-email" | "cv";
export type ActionRow = PaletteRow & { id: ActionId };

export type HiddenRow = PaletteRow & { egg: EggId; code: string };

export type TierRow = PaletteRow & { choice: PaletteTierChoice };

const SECTION_KEYWORDS: Record<PaletteSection, readonly string[]> = {
  work: ["home", "chapter", "selected work", "projects"],
  "making-of": ["home", "chapter", "passes", "render"],
  about: ["home", "chapter", "streamer"],
  contact: ["home", "chapter", "message", "email", "hire"],
};

const PAGE_KEYWORDS: Record<string, readonly string[]> = {
  "/work": ["index", "list", "projects", "studies"],
  "/about": ["bio", "streamer", "developer", "software", "architect"],
  "/contact": ["message", "email", "hire"],
  "/v1": ["old", "previous", "version", "first site"],
};

const SECTIONS: readonly PaletteSection[] = [
  "work",
  "making-of",
  "about",
  "contact",
];

/**
 * The Go to group (REQ-NAV-04): every study in study order (REQ-CNT-07),
 * then the home page's chapters, then the other pages.
 */
export const GO_ROWS: readonly GoRow[] = [
  ...studies.map((study): GoRow => ({
    value: `go:${studyHref(study.slug)}`,
    label: study.title,
    keywords: ["study", "case study", study.slug.replace(/-/g, " ")],
    target: { kind: "page", href: studyHref(study.slug) },
  })),
  ...SECTIONS.map((id): GoRow => ({
    value: `section:${id}`,
    label: paletteCopy.sections[id],
    keywords: SECTION_KEYWORDS[id],
    target: { kind: "section", id },
  })),
  ...paletteCopy.pages.map(({ label, href }): GoRow => ({
    value: `go:${href}`,
    label,
    keywords: PAGE_KEYWORDS[href] ?? [],
    target: { kind: "page", href: href as `/${string}` },
  })),
];

export const SETTING_ROWS: readonly SettingRow[] = [
  // The two sound settings [T7SEN, 15 Nov 2026]: each found by "sound" or
  // "mute", and by what it plays.
  {
    id: "background",
    value: "setting:background",
    label: paletteCopy.settings.background,
    keywords: ["audio", "music", "mute", "volume", "rain", "sea", "ambient"],
  },
  {
    id: "ticks",
    value: "setting:ticks",
    label: paletteCopy.settings.ticks,
    keywords: ["audio", "mute", "volume", "clicks", "hovers", "effects"],
  },
  {
    id: "tier",
    value: "setting:tier",
    label: paletteCopy.settings.tier,
    keywords: ["tier", "graphics", "webgpu", "webgl", "still", "performance"],
  },
  {
    id: "calm",
    value: "setting:calm",
    label: paletteCopy.settings.calm,
    keywords: ["motion", "reduced motion", "animation", "still"],
  },
];

export const ACTION_ROWS: readonly ActionRow[] = [
  {
    id: "copy-email",
    value: "action:copy-email",
    label: paletteCopy.actions.copyEmail,
    keywords: ["email", "mail", "address", "contact"],
  },
  {
    id: "cv",
    value: "action:cv",
    label: paletteCopy.actions.cv,
    keywords: ["cv", "resume", "hire", "email"],
  },
];

export const HIDDEN_ROWS: readonly HiddenRow[] = paletteCopy.eggs.map(
  ({ egg, code, label }) => ({
    value: `egg:${egg}`,
    label,
    keywords: [],
    egg,
    code,
  }),
);

export const TIER_ROWS: readonly TierRow[] = paletteCopy.tierPage.options.map(
  ({ choice, label }) => ({
    value: `tier:${choice}`,
    label,
    keywords: ["tier", "quality"],
    choice,
  }),
);

// Lower case without accents, so "cafe" finds "café" and case never counts.
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The Go to rows listed before anything is typed, as artboard 7 lists them:
 * the full studies, then About and Contact [T7SEN, 15 Nov 2026] ("the
 * palette list is too long"). The short studies, the home page's chapters,
 * All work and the v1 archive show as soon as a search matches them, so
 * Settings and Actions stay in view on an empty search.
 */
const GO_FIRST = new Set<string>([
  ...studies
    .filter((study) => study.kind === "full")
    .map((study) => `go:${studyHref(study.slug)}`),
  "go:/about",
  "go:/contact",
]);

/** The Go to rows for this search: the short list empty, else every match. */
export function goRowsFor(search: string): readonly GoRow[] {
  if (fold(search).trim() === "") {
    return GO_ROWS.filter((row) => GO_FIRST.has(row.value));
  }
  return GO_ROWS.filter((row) => matchesSearch(row, search));
}

/**
 * Whether a row matches the search: every word of the search appears in its
 * words or keywords. An empty search matches every row. The palette keeps
 * its own order rather than ranking, so the groups stay as the preview has
 * them.
 */
export function matchesSearch(row: PaletteRow, search: string): boolean {
  const words = fold(search).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = fold([row.label, ...row.keywords].join(" "));
  return words.every((word) => text.includes(word));
}

/**
 * The hidden commands a search reveals: only an exact code, in any case
 * and with spaces around it ignored (REQ-NAV-05).
 */
export function hiddenRowsFor(search: string): readonly HiddenRow[] {
  const code = fold(search);
  return HIDDEN_ROWS.filter((row) => row.code === code);
}

export type TierReading = {
  tier: Tier | null;
  reason: TierReason | null;
  ready: boolean;
};

// The reasons a forced flow reports when the device could not give the tier
// asked for.
const FALLBACK_REASONS: ReadonlySet<TierReason> = new Set([
  "webgpu-init-fallback",
  "no-backend",
  "device-lost",
]);

/**
 * The tier that runs for this choice, or null while none does: no field on
 * this page yet, or the engine still on the tier from before the choice
 * changed. A forced flow reports "forced", or a fallback reason with a tier
 * below the one asked for; Auto never reports "forced". So a reading that
 * cannot come from the current choice is the old flow, and the palette shows
 * the choice alone until the new one draws (A14). The engine session marks
 * the store not ready the moment the choice changes, so the old flow's
 * reading is never ready by then; this check is the second line.
 */
export function runningTier(
  choice: PaletteTierChoice,
  reading: TierReading,
): Tier | null {
  const { tier, reason, ready } = reading;
  if (!ready || tier === null) return null;
  if (choice === "auto") return reason === "forced" ? null : tier;
  if (reason === "forced") return tier === choice ? tier : null;
  // A fallback is always to a lower tier: 1 to 2 or 3, 2 to 3.
  return reason !== null && FALLBACK_REASONS.has(reason) && tier > choice
    ? tier
    : null;
}
