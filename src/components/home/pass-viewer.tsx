"use client";

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";

import { cx } from "@/components/site/class-names";
import { Panel } from "@/components/site/panel";
import {
  DEFAULT_PASS,
  passAnnouncement,
  passNumber,
  passPosition,
  passViewer,
} from "@/content/passes";
import { LIVE_PASSES, PASSES, type PassId } from "@/engine/story";
import { tierStore, type TierSnapshot } from "@/lib/tier-store";

import { PassCard } from "./pass-card";

/**
 * Whether the field draws a pass live in its card: only once a tier 1 or 2
 * field has drawn the halftone, whose own steps the passes are, and for a
 * pass its tier draws (LIVE_PASSES). The soft look has no passes. In calm the
 * field holds one still frame and draws it again as the cards scroll, so a
 * live card stays live. Every other card shows its still, so a window never
 * sits empty and no card claims a live pass the device is not drawing (A14).
 */
export function isPassLive(
  pass: PassId,
  { tier, ready, look }: Pick<TierSnapshot, "tier" | "ready" | "look">,
): boolean {
  if (!ready || look !== "halftone" || (tier !== 1 && tier !== 2)) {
    return false;
  }
  return LIVE_PASSES[tier].includes(pass);
}

type PassViewerProps = {
  /** The link under the breakdown, rendered on the server. */
  link: ReactNode;
  /** The tier table at the panel's end, rendered on the server. */
  tiers: ReactNode;
};

/**
 * The making-of chapter's pass viewer (REQ-ENG-09): a card per pass of the
 * frame, in the frame's order, and a panel with the chosen pass's breakdown.
 * The static HTML holds all of it with velocity chosen, so it reads before
 * any script runs (REQ-CNT-01). Each card is a toggle button, so Tab reaches
 * it and Enter or Space chooses it (REQ-A11Y-02). Every breakdown sits in
 * the same place, those not chosen hidden, so the panel keeps the height of
 * the longest and choosing one moves nothing below it. Once a visitor
 * chooses, a polite live region names the pass; it is empty at load, so
 * nothing is announced then.
 */
export function PassViewer({ link, tiers }: PassViewerProps) {
  const id = useId();
  const panelId = `${id}-panel`;
  const [chosen, setChosen] = useState<PassId>(DEFAULT_PASS);
  const [announcement, setAnnouncement] = useState("");
  const tier = useSyncExternalStore(
    tierStore.subscribe,
    tierStore.getSnapshot,
    tierStore.getServerSnapshot,
  );

  function choose(pass: PassId) {
    setChosen(pass);
    setAnnouncement(passAnnouncement(pass));
  }

  return (
    <div data-pass-viewer="" className="mt-10 lg:mt-14">
      <div
        role="group"
        aria-label={passViewer.group}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:flex lg:justify-center lg:gap-0 lg:pt-6 lg:pb-2"
      >
        {PASSES.map((pass) => (
          <PassCard
            key={pass}
            pass={pass}
            number={passNumber(pass)}
            copy={passViewer.passes[pass]}
            isChosen={pass === chosen}
            isLive={isPassLive(pass, tier)}
            descriptionId={`${id}-${pass}`}
            panelId={panelId}
            onChoose={choose}
          />
        ))}
      </div>
      {/* What each pass shows, read as its card's description. */}
      <div hidden>
        {PASSES.map((pass) => (
          <span key={pass} id={`${id}-${pass}`}>
            {passViewer.passes[pass].shows}
          </span>
        ))}
      </div>
      <Panel className="mt-10 flex flex-wrap gap-x-10 gap-y-6 lg:mt-14">
        <div id={panelId} className="min-w-0 flex-[3_1_26rem]">
          <div className="grid">
            {PASSES.map((pass) => {
              const copy = passViewer.passes[pass];
              const isShown = pass === chosen;
              return (
                <div
                  key={pass}
                  data-pass-breakdown={pass}
                  aria-hidden={isShown ? undefined : true}
                  className={cx(
                    "col-start-1 row-start-1",
                    !isShown && "invisible",
                  )}
                >
                  <p className="font-mono text-[0.6875rem] leading-[1.4] tracking-[0.14em] text-violet uppercase">
                    {passPosition(pass)}
                  </p>
                  <h3 className="mt-2.5 font-display text-[1.375rem] leading-tight font-semibold sm:text-[1.625rem]">
                    {copy.title}
                  </h3>
                  <p className="mt-4 text-base leading-[1.6] text-muted">
                    {copy.body[0]}
                  </p>
                  <p className="mt-3.5 text-base leading-[1.6] text-muted">
                    {copy.body[1]}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-5">{link}</p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </div>
        {tiers}
      </Panel>
    </div>
  );
}
