"use client";

import { useEffect } from "react";

import { afterFirstContent } from "@/components/engine/after-first-content";
import { calmStore } from "@/lib/calm-store";
import { loadMotion } from "@/lib/load-motion";
import { storyBridge } from "@/lib/story-bridge";

import { measureStory } from "./story-dom";
import { measureStages } from "./story-stage";

function logFailure(error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("story: failed to start", error);
  }
}

/**
 * The home page's scroll story. It renders nothing: the chapters are static
 * HTML, readable before any of this runs (REQ-CNT-01). On mount it sends the
 * stages and the chapter in view, so the field starts in the right place;
 * after first content it loads GSAP and the story itself (REQ-PERF-04).
 * Unmounting, on
 * a route change, cancels a pending load or tears the story down
 * (REQ-SCR-04). If the story cannot start, the page stays as it is.
 */
export function StoryDriver() {
  useEffect(() => {
    const root = document.getElementById("main");
    if (root === null) return;

    // The stages go first, so the field's first frame already has the dot
    // in its place and, part way down the page, the shape in its frame. The
    // veil opens only once the story has laid its plates.
    storyBridge.setStage(
      measureStages(root, window, calmStore.getSnapshot().calm),
    );
    const initial = measureStory(root, window);
    if (initial !== null) {
      storyBridge.setStory(initial.chapter, initial.progress);
    }

    let isCancelled = false;
    let stop: (() => void) | null = null;
    const cancelWait = afterFirstContent(() => {
      Promise.all([loadMotion(), import("./story-runner")])
        .then(([motion, { startStory }]) => {
          if (isCancelled) return;
          stop = startStory(motion, { root });
        })
        .catch(logFailure);
    });

    return () => {
      isCancelled = true;
      cancelWait();
      stop?.();
      stop = null;
      // Every other page keeps the field's own veil.
      storyBridge.setVeil(null);
    };
  }, []);

  return null;
}
