"use client";

import { useEffect, useRef } from "react";

import { loadEngine } from "@/components/engine/load-engine";
import type { Engine, EngineEvent, EngineOptions, Tier } from "@/engine/types";

const TIERS = [1, 2, 3] as const satisfies readonly Tier[];
const MAX_COUNT = 2_000_000;

const BUTTON =
  "inline-flex min-h-11 items-center rounded-md border border-edge px-4 font-mono text-sm hover:border-glow hover:text-glow aria-pressed:border-glow aria-pressed:text-glow";

// Read in an effect, not with useSearchParams, so the page stays static.
function readOptions(search: string) {
  const params = new URLSearchParams(search);
  const options: EngineOptions = {};

  const tier = TIERS.find((value) => String(value) === params.get("tier"));
  if (tier !== undefined) options.forcedTier = tier;

  const count = Number(params.get("count"));
  if (Number.isInteger(count) && count > 0 && count <= MAX_COUNT) {
    options.particleCount = count;
  }

  return {
    options,
    isCalm: params.get("calm") === "1",
    isBare: params.get("bare") === "1",
  };
}

function isPressed(button: HTMLButtonElement) {
  return button.getAttribute("aria-pressed") === "true";
}

/**
 * The engine without the site's session and store (REQ-ENG-04). The page
 * still renders inside the root layout; ?bare=1 covers the window with the
 * host. State is written straight to the readout's data attributes, where
 * the browser tests read it, so no event renders React.
 */
export function EngineView() {
  const viewRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLParagraphElement>(null);
  const calmRef = useRef<HTMLButtonElement>(null);
  const engineRef = useRef<Engine | null>(null);

  useEffect(() => {
    const view = viewRef.current;
    const host = hostRef.current;
    const readout = readoutRef.current;
    const calm = calmRef.current;
    if (view === null || host === null || readout === null || calm === null) {
      return;
    }

    const { options, isCalm, isBare } = readOptions(window.location.search);
    let engine: Engine | null = null;
    let isCancelled = false;
    let events = 0;

    Object.assign(view.dataset, {
      status: "loading",
      tier: "",
      tierReason: "",
      ready: "false",
      fps: "",
      events: "0",
      error: "",
    });
    if (isBare) view.dataset.bare = "true";
    calm.setAttribute("aria-pressed", String(isCalm));
    readout.textContent = "Loading the engine.";

    const onEvent = (event: EngineEvent) => {
      if (isCancelled) return;
      events += 1;
      view.dataset.events = String(events);

      if (event.type === "frameRate") {
        view.dataset.fps = String(event.fps);
      } else if (event.type === "tierChosen") {
        view.dataset.tier = String(event.tier);
        view.dataset.tierReason = event.reason;
        view.dataset.ready = "false";
        view.dataset.status = "loading";
      } else {
        view.dataset.ready = "true";
        view.dataset.status = event.tier === 3 ? "still" : "running";
      }

      const { status, tier, tierReason, fps } = view.dataset;
      readout.textContent = `${status}: tier ${tier} (${tierReason}), ${fps === "" ? "no frame rate yet" : `${fps} fps`}, ${events} events`;
    };

    void (async () => {
      const { createEngine } = await loadEngine();
      if (isCancelled) return;

      // The toggle may have been pressed while the engine was loading.
      engine = createEngine(host, { ...options, calm: isPressed(calm) });
      engineRef.current = engine;
      engine.on(onEvent);
      await engine.start();
    })().catch((error: unknown) => {
      if (isCancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      view.dataset.error = message;
      view.dataset.status = "error";
      readout.textContent = `The engine failed: ${message}`;
    });

    return () => {
      isCancelled = true;
      engineRef.current = null;
      delete view.dataset.bare;
      // Disposed at once, not after start: start resolves only when the field
      // has drawn, and a field that has left the page never draws.
      void engine?.dispose();
    };
  }, []);

  return (
    <div
      ref={viewRef}
      data-testid="engine-view"
      data-status="loading"
      data-tier=""
      data-tier-reason=""
      data-ready="false"
      data-fps=""
      data-events="0"
      data-error=""
      className="group mt-4"
    >
      <div className="flex flex-wrap gap-3 group-data-[bare=true]:hidden">
        {TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            className={BUTTON}
            onClick={() => engineRef.current?.setTier(tier)}
          >
            Tier {tier}
          </button>
        ))}
        <button
          ref={calmRef}
          type="button"
          aria-pressed="false"
          className={BUTTON}
          onClick={(event) => {
            const isCalm = !isPressed(event.currentTarget);
            event.currentTarget.setAttribute("aria-pressed", String(isCalm));
            engineRef.current?.setCalm(isCalm);
          }}
        >
          Calm
        </button>
      </div>
      <p
        ref={readoutRef}
        className="mt-4 font-mono text-sm text-muted group-data-[bare=true]:hidden"
      >
        Loading the engine.
      </p>
      {/* The engine owns this element and its canvas. With ?bare=1 it covers
          the whole window, so a capture holds the field and nothing else. */}
      <div
        ref={hostRef}
        data-part="host"
        className="mt-4 h-[70svh] w-full bg-void group-data-[bare=true]:fixed group-data-[bare=true]:inset-0 group-data-[bare=true]:z-40 group-data-[bare=true]:mt-0 group-data-[bare=true]:h-auto"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          engineRef.current?.setPointer(
            ((event.clientX - box.x) / box.width) * 2 - 1,
            1 - ((event.clientY - box.y) / box.height) * 2,
            true,
          );
        }}
        onPointerLeave={() => engineRef.current?.setPointer(0, 0, false)}
      />
    </div>
  );
}
