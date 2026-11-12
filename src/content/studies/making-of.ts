import type { FullStudy } from "../types";

// Every number here comes from a measured run, never from an estimate
// (REQ-PERF-05, REQ-PERF-06, REQ-TIER-05): the frame times and the payloads
// from docs/results/2026-11-12-making-of.md, which keeps its own payload
// table from one production build of 12 Nov 2026, where the day's budget
// file is written again at every gate. The frame times sit on the 240 Hz
// display's refresh, so they are given as a ceiling with the cap named.
const FRAMES = "docs/results/2026-11-12-making-of.md";
const BUDGET = FRAMES;
const CAPPED = "Under 4.2 ms, capped by a 240 Hz display";

export const makingOf = {
  kind: "full",
  slug: "making-of",
  title: "Making-of: this site",
  tag: "WebGPU",
  leadAngle:
    "Live render passes, the compute simulation and the three device tiers",
  // The line and the chips describe this site and its pinned stack; the
  // table cells say the same facts as the lead angle.
  listing: {
    kind: "Case study",
    studyLabel: "Full study",
    line: "A compute particle field that re-forms into each full study, with a fallback for every device. One shader codebase runs on WebGPU and WebGL2.",
    stack: ["WebGPU", "TSL", "three.js r187", "GSAP"],
    what: "A live GPU particle field, its render passes, and three device tiers.",
    builtWith: "Next.js 16, three.js r187, WebGPU and TSL",
    metrics: [
      {
        label: "Frame time per tier",
        value: CAPPED,
        source: `Tiers 1 and 2 on an RTX 4060 Ti, ${FRAMES}`,
      },
      {
        label: "3D payload",
        value: "238.9 KB on desktop",
        source: `Tier 1, gzip, ${BUDGET}`,
      },
    ],
  },
  roleLine: "Solo project: design, build and hosting.",
  screenshot: {
    src: "/work/making-of.webp",
    width: 1168,
    height: 739,
    phone: { src: "/work/making-of-phone.webp", width: 686, height: 434 },
    alt: "The field chapter of this site's home page on tier 1: the T7SEN wordmark formed in violet, lavender and white halftone dots, with the label 01 / Field, the readout Tier 1 · WebGPU and the note Move the cursor to stir the field.",
    caption:
      "The field chapter on tier 1 (WebGPU, 1,000,000 particles), captured on 12 Nov 2026.",
  },
  summary: [
    "A live GPU particle field behind the home page, re-forming into each chapter and each full study.",
    "One TSL simulation runs on WebGPU and, through transform feedback, on WebGL2; a device with neither gets still frames.",
    "Every page is static HTML first, and every figure below was measured on the production build.",
  ],
  problem: {
    problem:
      "A portfolio whose signature is a live GPU simulation, while a recruiter still reaches the work in one click and the copy never claims more than the visitor's device does. The field had to run on WebGPU where it can, on WebGL2 where it cannot, and as still frames everywhere else, from one codebase.",
    constraints: [
      "Readable text in 2 s or less on a mid-range phone, before any 3D loads.",
      "About 200 KB of first-load JavaScript: three.js, GSAP and Lenis load after first content.",
      "A 3D payload of about 8 MB on desktop and 3 MB on phones.",
      "60 fps on desktop tier 1, and 30 fps or more on phones.",
      "Reduced motion and calm mode honoured everywhere, and scroll never hijacked.",
    ],
    role: "Solo project: I designed it, built it and host it.",
  },
  approach: [
    "The engine lives in its own folder, imports no app code and keeps one canvas for the whole site. The page sends it a few commands (where the story is, where the page's boxes are, the pointer, calm and the pass cards), and it reports only three events: ready, the tier it chose and its frame rate.",
    "The tier is chosen from facts first: Save-Data gets stills, and a touch screen or a browser without WebGPU gets WebGL2. Otherwise the real field runs unseen for 2 s, and a median frame under 20 ms keeps tier 1 at 1,000,000 particles; tier 2 runs 250,000 on desktop and 100,000 on phones. A lost WebGPU device rebuilds once on tier 2, and a lost WebGL2 context ends on the stills.",
  ],
  diagram: {
    name: "How a frame is drawn",
    boxes: [
      { title: "Tier choice", line: "Facts, then a 2 s probe" },
      {
        title: "Simulation",
        line: "One TSL update per particle",
        via: "tier",
        isKey: true,
      },
      {
        title: "Halftone",
        line: "Splat, density, glow, dots",
        via: "particles",
      },
    ],
  },
  // Verbatim from the file, so a test can find it there.
  excerpt: {
    caption:
      "The first step of the tier choice runs on facts alone, before three.js loads: the first check that applies decides.",
    path: "src/engine/tier/decide.ts",
    language: "TypeScript",
    code: `  if (environment.saveData) return { kind: "still", reason: "save-data" };
  if (environment.coarsePointer) return { kind: "webgl2", reason: "phone" };
  if (!environment.hasWebGpu) return { kind: "webgl2", reason: "no-webgpu" };

  // A default adapter request is core level, so a non-null adapter needs no
  // feature check.
  const { adapter } = environment;
  if (adapter === null) return { kind: "webgl2", reason: "no-adapter" };
  if (adapter.isFallbackAdapter) {
    return { kind: "webgl2", reason: "fallback-adapter" };
  }

  // One storage buffer holds every particle, so both the largest buffer and
  // the largest storage binding must take it whole.
  const bufferBytes = tier1Particles * BYTES_PER_PARTICLE;
  if (
    adapter.maxStorageBufferBindingSize < bufferBytes ||
    adapter.maxBufferSize < bufferBytes
  ) {
    return { kind: "webgl2", reason: "adapter-limits" };
  }

  return { kind: "probe" };`,
  },
  hardPart:
    "Keeping one simulation for both backends. On WebGL2, TSL compute runs through transform feedback, so a particle reads and writes only its own entry: no neighbours, no shared grid, no atomics. The halftone needs a grid all the same, so it is drawn, not computed: every particle splats as one texel into a target of four by four texels per screen cell, and the density, glow and final passes work on cells. WebGL2 draws the frame exactly as WebGPU does.",
  results: [
    {
      label: "Frame time, tier 1 (WebGPU), 1,000,000 particles",
      value: "Under 4.2 ms",
      source: `Median 4.20 ms, the refresh of a 240 Hz display, so the GPU's own cost is lower; RTX 4060 Ti, ${FRAMES}`,
    },
    {
      label: "Frame time, tier 2 (WebGL2), 250,000 particles",
      value: "Under 4.2 ms",
      source: `Median 4.20 ms, the refresh of a 240 Hz display, so the GPU's own cost is lower; RTX 4060 Ti, ${FRAMES}`,
    },
    {
      label: "3D payload on desktop, tier 1",
      value: "238.9 KB",
      source: `Gzip, the production build, ${BUDGET}`,
    },
    {
      label: "3D payload on phones, tier 2",
      value: "244.6 KB",
      source: `Gzip, the production build, ${BUDGET}`,
    },
    {
      label: "Stills on tier 3, with no three.js",
      value: "877.6 KB",
      source: `The production build, ${BUDGET}`,
    },
  ],
  wouldChange: [
    "Time each pass on the GPU. A frame here fits inside one refresh of a 240 Hz display, so its real cost is hidden; timestamp queries would show it on WebGPU, though WebGL2 has none.",
    "Draw tier 2's velocity pass live. Tier 2 shows a still of it today, since drawing it live costs a second draw of every particle.",
    "Measure real phones. Every frame time above comes from one desktop GPU; phones run tier 2 at 100,000 particles and are not measured yet.",
  ],
  links: {
    live: { label: "Live site", href: "https://t7sen.com" },
    repo: {
      label: "Read the code",
      href: "https://github.com/T7SEN/portfolio",
    },
  },
} satisfies FullStudy;
