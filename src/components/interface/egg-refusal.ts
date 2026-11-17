import { type EggRefusal, eggRefusals } from "@/content/egg-refusals";
import type { Text } from "@/content/types";
import { calmStore, type CalmSnapshot } from "@/lib/calm-store";
import { eggNotice } from "@/lib/egg-notice";
import { type EggOutcome, requestEgg } from "@/lib/eggs";
import { isFieldRoute } from "@/lib/field-routes";
import { type TierChoice, tierChoiceStore } from "@/lib/tier-choice-store";
import type { EggId } from "@/engine/types";

/**
 * Why an egg did not play, in the words the page says (REQ-NAV-05, A14). A
 * still frame the visitor chose in the palette is named as their choice,
 * never as their device.
 */
export function refusalFor(
  outcome: Extract<EggOutcome, { played: false }>,
  pathname: string | null,
  calm: CalmSnapshot,
  choice: TierChoice,
): EggRefusal {
  switch (outcome.reason) {
    case "no-field":
      return pathname !== null && isFieldRoute(pathname)
        ? "no-field-yet"
        : "no-field-page";
    case "calm":
      return calm.system ? "calm-system" : "calm";
    case "still":
      return choice === 3 ? "still-chosen" : "still";
  }
}

/** The words for a refusal as the page is now. */
export function refusalWords(
  outcome: Extract<EggOutcome, { played: false }>,
  pathname: string | null,
): Text {
  return eggRefusals[
    refusalFor(
      outcome,
      pathname,
      calmStore.getSnapshot(),
      tierChoiceStore.getSnapshot(),
    )
  ];
}

/**
 * An egg asked for outside the palette (typed g g or f l i p, the logo's
 * long press): played, or the reason said in the page's polite status
 * (InterfaceKeys renders it), as the palette says it in its own.
 */
export function requestEggAloud(egg: EggId): EggOutcome {
  const outcome = requestEgg(egg);
  if (!outcome.played) {
    eggNotice.say(refusalWords(outcome, window.location.pathname));
  }
  return outcome;
}
