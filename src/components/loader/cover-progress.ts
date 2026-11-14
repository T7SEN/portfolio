import { testShare, type LoaderSnapshot } from "@/lib/loader-store";

import type { SceneProgress } from "./scene/types";

/** What the scene draws for the loader's progress at now. */
export function sceneProgress(
  snapshot: LoaderSnapshot,
  now: number,
): SceneProgress {
  return {
    done: snapshot.done,
    test: testShare(snapshot, now),
    ready: snapshot.outcome === "field",
  };
}
