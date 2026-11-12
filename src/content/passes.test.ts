import { describe, expect, it } from "vitest";

import { LIVE_PASSES, PASSES } from "@/engine/story";

import { isMarker } from "./markers";
import {
  DEFAULT_PASS,
  passAnnouncement,
  passNumber,
  passPosition,
  passViewer,
} from "./passes";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

describe("pass viewer copy", () => {
  it("REQ-ENG-09 every pass the field draws has its words, in the frame's order", () => {
    expect(Object.keys(passViewer.passes)).toEqual([...PASSES]);
    for (const pass of PASSES) {
      const copy = passViewer.passes[pass];
      expect(copy.name.length).toBeGreaterThan(0);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.shows.length).toBeGreaterThan(0);
      expect(copy.body).toHaveLength(2);
      for (const paragraph of copy.body) {
        expect(paragraph.length).toBeGreaterThan(40);
      }
    }
  });

  it("REQ-ENG-09 the cards read 1 Points to 5 Final frame, and velocity is shown first", () => {
    expect(
      PASSES.map(
        (pass) => `${passNumber(pass)} ${passViewer.passes[pass].name}`,
      ),
    ).toEqual([
      "1 Points",
      "2 Velocity",
      "3 Density",
      "4 Glow",
      "5 Final frame",
    ]);
    expect(DEFAULT_PASS).toBe("velocity");
  });

  it("REQ-ENG-09 REQ-A11Y-05 the label over a breakdown says where the pass sits, and a pick names it", () => {
    expect(passPosition("velocity")).toBe("Pass 2 of 5");
    expect(passPosition("final")).toBe("Pass 5 of 5");
    expect(passAnnouncement("density")).toBe("Pass 3 of 5, Density");
    expect(passAnnouncement("velocity")).toBe("Pass 2 of 5, Velocity buffer");
  });

  it("REQ-ENG-09 A14 the copy describes the halftone's own passes: no mesh, no lights", () => {
    for (const text of strings(passViewer.passes)) {
      expect(text).not.toMatch(/wireframe|lighting|bloom|mesh/i);
    }
  });

  it("REQ-ENG-09 A14 the velocity pass says tier 2 shows it as a still, as the tiers draw it", () => {
    expect(LIVE_PASSES[2]).not.toContain("velocity");
    expect(passViewer.passes.velocity.body.join(" ")).toContain(
      "Tier 2 shows a still of this pass",
    );
    for (const pass of PASSES) {
      if (pass === "velocity") continue;
      expect(passViewer.passes[pass].body.join(" ")).not.toMatch(/tier 2/i);
    }
  });
});

describe("tier table", () => {
  it("REQ-ENG-09 one row per tier, named as the field names them", () => {
    expect(passViewer.tiers.map((row) => row.tier.join(" · "))).toEqual([
      "Tier 1 · WebGPU",
      "Tier 2 · WebGL2",
      "Tier 3 · Still",
    ]);
  });

  it("REQ-PERF-06 A1 A15 the frame times are the measured ones with the GPU and the display's cap named, and tier 3 is a static image", () => {
    const [first, second, third] = passViewer.tiers;
    for (const row of [first, second]) {
      expect(isMarker(row.value)).toBe(false);
      // A median on the display's refresh is the refresh, not the cost,
      // and it was measured on one desktop GPU, not the visitor's.
      expect(row.value).toBe(
        "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display",
      );
    }
    expect(third.value).toBe("Static image");
    expect(third.value).not.toMatch(/\d/);
  });
});

describe("pass viewer voice", () => {
  const texts = strings(passViewer);

  it("REQ-HYG-06 no dash is used as punctuation", () => {
    // The en and em dash by code point, so this file holds neither.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).not.toMatch(dashes);
      expect(text).not.toMatch(/\S\s+-\s+\S/);
    }
  });

  it("REQ-HYG-06 no exclamation marks, and no line with spaces at its ends", () => {
    for (const text of texts) {
      expect(text).not.toContain("!");
      expect(text.trim()).toBe(text);
    }
  });

  it("REQ-CNT-05 no marker is left: every frame time is measured", () => {
    const markers = texts.flatMap(
      (text) => text.match(/\[(?:FILL|CONFIRM)[^\]]*\]?/g) ?? [],
    );
    expect(markers).toEqual([]);
  });
});
