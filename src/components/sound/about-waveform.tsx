import { Panel } from "@/components/site/panel";

import { WaveformCluster } from "./waveform-cluster";

/**
 * The framed waveform panel at the foot of /about (phase P5): a
 * cluster of thin bars beside a mono caption, centred in a full-width
 * panel; the bars above the caption on phones. A figure, so the caption is
 * what assistive technology reads; the bars are decoration.
 */
export function AboutWaveform() {
  return (
    <Panel
      as="figure"
      padding="none"
      className="flex min-h-35 flex-col items-center justify-center gap-6 px-6 py-4 sm:flex-row sm:gap-8"
    >
      <WaveformCluster />
    </Panel>
  );
}
