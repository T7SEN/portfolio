import type { EggId, TierReason } from "@/engine/types";

import { type EggRefusal, eggRefusals } from "./egg-refusals";
import { site } from "./site";
import type { Link, Text, Tier } from "./types";

/** The palette's quality tier choice (REQ-TIER-04): Auto, or one tier forced. */
export type PaletteTierChoice = "auto" | Tier;

/** A home chapter the palette's Go to group scrolls to. */
export type PaletteSection = "work" | "making-of" | "about" | "contact";

/** Why a hidden command did not play, as the palette tells it (A14). */
export type { EggRefusal } from "./egg-refusals";

export type PaletteCopy = {
  /** The dialog's name. */
  name: Text;
  /** The search input's name for assistive technology. */
  inputName: Text;
  placeholder: Text;
  /** The same words, shorter, for a search line under 360 px wide. */
  placeholderShort: Text;
  /** The results listbox's name. */
  listName: Text;
  /** The Esc key cap is also the close button; its name holds the key. */
  close: { name: Text; key: Text };
  /** The hint at the end of the active row, where a keyboard is likely. */
  enterKey: Text;
  /** The footer: the key hints, then the hint at the hidden commands. */
  keyHints: Text;
  hiddenHint: Text;
  empty: Text;
  groups: {
    goTo: Text;
    settings: Text;
    actions: Text;
    hidden: Text;
  };
  sections: Record<PaletteSection, Text>;
  pages: readonly Link[];
  /** The two sound rows [T7SEN, 15 Nov 2026], then tier and calm. */
  settings: { background: Text; ticks: Text; tier: Text; calm: Text };
  /**
   * The values at the end of the settings rows. waiting: the background left
   * on at an earlier visit, silent until the first click or key.
   */
  values: { off: Text; on: Text; waiting: Text; failed: Text };
  calmSystem: Text;
  tierPage: {
    placeholder: Text;
    back: Text;
    /** The value at the end of the option in use. */
    chosen: Text;
    options: readonly { choice: PaletteTierChoice; label: Text }[];
    /** No field runs on this page yet, so no tier is known. */
    waiting: Text;
  };
  actions: { copyEmail: Text; cv: Text };
  /** The CV request: an email with its subject filled in. */
  cvHref: `mailto:${string}`;
  copied: Text;
  copyFailed: Text;
  /** The address field shown when copying fails. */
  addressName: Text;
  /** The hidden commands, each found only by its exact code (REQ-NAV-05). */
  eggs: readonly { egg: EggId; code: Text; label: Text }[];
  eggRefusals: Record<EggRefusal, Text>;
  announce: {
    backgroundOn: Text;
    backgroundOff: Text;
    ticksOn: Text;
    ticksOff: Text;
    soundFailed: Text;
    calmOn: Text;
    calmOff: Text;
    tierSet: (name: Text) => Text;
  };
};

const TIER_NAMES = {
  1: "Tier 1 · WebGPU",
  2: "Tier 2 · WebGL2",
  3: "Tier 3 · Still",
} as const satisfies Record<Tier, Text>;

// The palette's words, from the launch artboard where it shows them
// (phase P5); the rest is plain UI text for T7SEN's review.
export const paletteCopy = {
  name: "Command palette",
  inputName: "Search commands",
  placeholder: "Jump to a study, or change a setting",
  placeholderShort: "Jump to a study or a setting",
  listName: "Commands",
  close: { name: "Close the command palette, Esc", key: "Esc" },
  enterKey: "Enter",
  keyHints: "↑ ↓ move · Enter run · Esc close",
  hiddenHint: "Some commands are hidden",
  empty: "No command matches that search.",
  groups: {
    goTo: "Go to",
    settings: "Settings",
    actions: "Actions",
    hidden: "Hidden",
  },
  sections: {
    work: "Home: Work",
    "making-of": "Home: Making-of",
    about: "Home: About",
    contact: "Home: Contact",
  },
  // The menu's pages of this site (menu.ts), Home included from 15 Nov 2026.
  pages: [
    { label: "Home", href: "/" },
    { label: "All work, no 3D", href: "/work" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "v1 archive", href: "/v1" },
  ],
  settings: {
    background: "Background sound",
    ticks: "Interface sounds",
    tier: "Quality tier",
    calm: "Calm mode",
  },
  values: { off: "Off", on: "On", waiting: "On · waiting", failed: "Failed" },
  calmSystem: "Your device asks for reduced motion, so calm stays on.",
  tierPage: {
    placeholder: "Choose a quality tier",
    back: "Back to all commands",
    chosen: "Chosen",
    options: [
      { choice: "auto", label: "Auto" },
      { choice: 1, label: TIER_NAMES[1] },
      { choice: 2, label: TIER_NAMES[2] },
      { choice: 3, label: TIER_NAMES[3] },
    ],
    waiting:
      "The field is not running on this page, so the choice holds until it does.",
  },
  actions: { copyEmail: "Copy email address", cv: "Ask for my CV" },
  cvHref: `mailto:${site.email}?subject=CV%20request`,
  copied: "Copied",
  copyFailed:
    "Copying did not work here, so the address is selected below for you to copy.",
  addressName: "Email address",
  eggs: [
    { egg: "gg", code: "gg", label: "Spell GG in the field" },
    { egg: "mark", code: "logo", label: "Re-form the logo" },
    { egg: "flip", code: "flip", label: "Make it rain upward" },
  ],
  eggRefusals,
  announce: {
    backgroundOn: "Background sound on",
    backgroundOff: "Background sound off",
    ticksOn: "Interface sounds on",
    ticksOff: "Interface sounds off",
    soundFailed: "Sound could not start on this device.",
    calmOn: "Calm mode on",
    calmOff: "Calm mode off",
    tierSet: (name) => `Quality tier set to ${name}`,
  },
} as const satisfies PaletteCopy;

/** A tier choice by name: "Auto" or the tier with its backend. */
export function tierChoiceName(choice: PaletteTierChoice): Text {
  return choice === "auto" ? "Auto" : TIER_NAMES[choice];
}

/**
 * The Quality tier row's value: the choice, then the tier that runs and its
 * backend ("Auto · Tier 1 · WebGPU"). Running is null while no field runs or
 * a change of tier has not drawn yet, so only the choice shows. A forced tier
 * the device did not give says both ("Tier 1 asked · Tier 2 · WebGL2").
 */
export function tierValue(
  choice: PaletteTierChoice,
  running: Tier | null,
): Text {
  if (choice === "auto") {
    return running === null ? "Auto" : `Auto · ${TIER_NAMES[running]}`;
  }
  if (running === null) return `Tier ${choice}`;
  if (running === choice) return TIER_NAMES[choice];
  return `Tier ${choice} asked · ${TIER_NAMES[running]}`;
}

/**
 * Why a forced tier is not the one that runs, from the engine's reason.
 */
export function tierFallback(
  choice: Tier,
  running: Tier,
  reason: TierReason | null,
): Text {
  const result =
    running === 3
      ? "so the still frame shows"
      : `so ${TIER_NAMES[running]} runs`;
  switch (reason) {
    case "webgpu-init-fallback":
      return `WebGPU did not start on this device, ${result}.`;
    case "no-backend":
      return `No GPU renderer could start on this device, ${result}.`;
    case "device-lost":
      return `The GPU stopped responding, ${result}.`;
    default:
      return `Tier ${choice} is not available on this device, ${result}.`;
  }
}
