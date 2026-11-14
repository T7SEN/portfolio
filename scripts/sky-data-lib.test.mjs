// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DOUBLES,
  buildCatalogue,
  catalogueSource,
  parseCsvLine,
  parseLines,
} from "./sky-data-lib.mjs";

const HEAD = '"id","hip","hd","hr","proper","ra","dec","mag","con"';
const row = (hr, proper, ra, dec, mag, con) =>
  `1,,,${hr},"${proper}",${ra},${dec},${mag},${con}`;

const HYG = [
  HEAD,
  row("", "Sol", 0, 0, -26.7, ""),
  row(1, "", 1.23456, 10.12345, 3.1, "Aaa"),
  row(2, "Bright", 2, -5, 0.5, "Aaa"),
  row(3, "", 3, 20, 5.8, "Bbb"),
  row(4, "", 4, 30, 6.2, "Bbb"),
  row(5, "", 5, 40, 7, "Bbb"),
  row("", "", 6, 50, 4.9, ""),
].join("\n");

const LINES = [
  "# A comment",
  "Aaa   3    1    2    1",
  "Bbb   2    3    4",
  "Bbb   2    4    3",
].join("\n");

describe("sky data", () => {
  it("D-146 reads quoted CSV fields with commas and doubled quotes", () => {
    expect(parseCsvLine('1,"a, b","say ""hi""",,x')).toEqual([
      "1",
      "a, b",
      'say "hi"',
      "",
      "x",
    ]);
  });

  it("D-146 reads the line file, more than one row a constellation, and maps the doubles", () => {
    const lines = parseLines(
      "Ori  2 1 596\nOri  2 596 3\nCru  1 5506",
      DOUBLES,
    );
    expect(lines.get("Ori")).toEqual([
      [1, 595],
      [595, 3],
    ]);
    expect(lines.get("Cru")).toEqual([[5505]]);
    expect(() => parseLines("Ori  3 1 2")).toThrow(/Bad line row/);
  });

  it("D-146 keeps stars to the magnitude limit and every line star, drops the Sun and duplicates", () => {
    const { constellations, stars } = buildCatalogue(HYG, LINES);
    expect(constellations).toEqual(["Aaa", "Bbb"]);
    // HR 1 and 2 (bright), 3 and 4 (line stars past the limit), the
    // unnumbered 4.9 star; not the Sun, not HR 5 (7.0, no line).
    expect(stars).toEqual([
      [1.2346, 10.123, 3.1, 0],
      [2, -5, 0.5, 0],
      [3, 20, 5.8, 1],
      [4, 30, 6.2, 1],
      [6, 50, 4.9, -1],
    ]);
  });

  it("D-146 writes each constellation line once, in order, as star indices", () => {
    const { segments } = buildCatalogue(HYG, LINES);
    expect(segments).toEqual([
      [0, 1, 0, 0],
      [2, 3, 1, 0],
    ]);
  });

  it("D-146 refuses a line star the stars do not hold", () => {
    expect(() => buildCatalogue(HYG, "Ccc  2 1 9")).toThrow(/missing.*9/);
  });

  it("D-146 the written module names both sources and their licences", () => {
    const source = catalogueSource(buildCatalogue(HYG, LINES));
    expect(source).toMatch(/HYG database v4\.4/);
    expect(source).toMatch(/CC BY-SA 4\.0/);
    expect(source).toMatch(/Marc van der Sluys/);
    expect(source).toMatch(/CC BY 4\.0/);
    expect(source).toMatch(/export const SKY_STARS/);
    expect(source).toMatch(/export const SKY_SEGMENTS/);
  });
});
