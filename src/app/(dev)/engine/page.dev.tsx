import type { Metadata } from "next";

import { EngineView } from "./engine-view";

export const metadata: Metadata = {
  title: "Engine",
  robots: { index: false, follow: false },
};

export default function EnginePage() {
  return (
    <div className="p-6">
      <h1 className="font-mono text-sm tracking-widest">Engine</h1>
      <p className="mt-4 text-muted">
        Development only. The engine alone: force a tier with ?tier=1, 2 or 3,
        set the particles with ?count=, start calm with ?calm=1, show a chapter
        with ?chapter= and ?progress= (0 to 1), draw the soft fallback field
        with ?look=soft, and show only the field with ?bare=1.
      </p>
      <EngineView />
    </div>
  );
}
