// @vitest-environment node
import { describe, expect, it } from "vitest";
import { colors } from "./colors";
import {
  contrastRatio,
  pairRatio,
  pairsInUse,
  relativeLuminance,
} from "./contrast";
import type { ContrastPair } from "./contrast";

// The ratios recorded in visual-system.md section 2, to two decimals.
const documented: Readonly<Record<string, number>> = {
  "text on void": 17.24,
  "text on surface": 16.13,
  "text on raised": 14.5,
  "muted on void": 7.27,
  "muted on surface": 6.8,
  "muted on raised": 6.11,
  "glow on void": 7.39,
  "glow on surface": 6.92,
  "glow on raised": 6.22,
  "void on violet": 5.08,
  "violet on void": 5.08,
  "logo-red on void": 5.35,
  "logo-blue on void": 5.47,
  "danger on void": 7.27,
  "danger on surface": 6.81,
  "edge on void": 3.6,
  "edge on surface": 3.37,
  "edge on raised": 3.03,
  "void on paper": 18.33,
};

const label = (pair: ContrastPair) =>
  `${pair.foreground} on ${pair.background}`;
const toTwoDecimals = (ratio: number) => Math.round(ratio * 100) / 100;

describe("colour tokens", () => {
  it("REQ-A11Y-06 holds the twelve tokens of visual-system.md section 2 as six-digit hex", () => {
    expect(Object.keys(colors)).toEqual([
      "void",
      "surface",
      "raised",
      "edge",
      "muted",
      "text",
      "violet",
      "logo-red",
      "logo-blue",
      "glow",
      "danger",
      "paper",
    ]);
    for (const hex of Object.values(colors)) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("contrast", () => {
  it("REQ-A11Y-06 follows the WCAG formula at its end points", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 10);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 10);
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 10);
    expect(() => relativeLuminance("#FFF")).toThrow();
  });

  it.each(pairsInUse)(
    "REQ-A11Y-06 $foreground on $background meets $needs:1 ($use)",
    (pair) => {
      expect(pairRatio(pair)).toBeGreaterThanOrEqual(pair.needs);
    },
  );

  it.each(pairsInUse)(
    "REQ-A11Y-06 $foreground on $background equals its documented ratio",
    (pair) => {
      expect(toTwoDecimals(pairRatio(pair))).toBe(documented[label(pair)]);
    },
  );

  it("REQ-A11Y-06 lists each documented pair once and nothing else", () => {
    const labels = pairsInUse.map(label);
    expect(new Set(labels).size).toBe(labels.length);
    expect([...labels].sort()).toEqual(Object.keys(documented).sort());
  });

  it("REQ-A11Y-06 keeps text on violet (3.39) out of the pairs in use, so the button label is void", () => {
    expect(toTwoDecimals(contrastRatio(colors.text, colors.violet))).toBe(3.39);
    expect(contrastRatio(colors.text, colors.violet)).toBeLessThan(4.5);
    expect(pairsInUse.map(label)).not.toContain("text on violet");
  });
});
