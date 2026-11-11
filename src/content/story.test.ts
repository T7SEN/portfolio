import { describe, expect, it } from "vitest";

import { WORK_SHAPES } from "@/engine/story";

import { studyHref, studySlugs } from "./index";
import { chapterOrder, story } from "./story";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

const LIVE = "Where your device draws the field live, ";

describe("story chapters", () => {
  it("REQ-SCR-01 the story has six chapters in page order", () => {
    expect(chapterOrder).toEqual([
      "hero",
      "bloom",
      "work",
      "making-of",
      "about",
      "contact",
    ]);
  });

  it("REQ-SCR-01 REQ-CNT-07 the work chapter's shapes follow the study cards in index order", () => {
    expect([...WORK_SHAPES]).toEqual([...studySlugs]);
  });

  it("REQ-SCR-01 each label's number is the chapter's place in the story", () => {
    for (const [chapter, { label }] of [
      ["bloom", story.bloom],
      ["making-of", story.makingOf],
    ] as const) {
      const place = chapterOrder.indexOf(chapter) + 1;
      expect(label.number).toBe(String(place).padStart(2, "0"));
    }
  });
});

describe("scene chapters", () => {
  it("REQ-SCR-07 Bloom shows its approved label", () => {
    const { label } = story.bloom;
    expect(`${label.number} · ${label.name}`).toBe("02 · Bloom");
  });

  it("REQ-SCR-01 REQ-CNT-01 A14 Bloom has the approved line for a live field and a tier 3 line for the static HTML", () => {
    const { gpu, still } = story.bloom.lines;
    expect(gpu).toBe("One field becomes every project on this site.");
    expect(still).toBe(
      "On a capable device, one field becomes every project on this site.",
    );
  });

  it("REQ-SCR-01 REQ-CNT-01 A14 the tier 3 line never states the approved line on its own", () => {
    // The home page tests check the static HTML's text does not contain the
    // approved line, which holds only while this does.
    const { gpu, still } = story.bloom.lines;
    expect(still).not.toContain(gpu);
  });

  it("REQ-SCR-01 REQ-CNT-01 REQ-HYG-06 neither Bloom line uses a dash as punctuation or an exclamation mark", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    for (const line of Object.values(story.bloom.lines)) {
      expect(line.trim().length).toBeGreaterThan(0);
      expect(line).not.toMatch(dashes);
      expect(line).not.toMatch(/\S\s+-\s+\S/);
      expect(line).not.toContain("!");
    }
  });

  it("REQ-SCR-01 Making-of shows its approved label and line and links to its study", () => {
    const { label, line, link } = story.makingOf;
    expect(`${label.number} · ${label.name}`).toBe("04 · Making-of");
    expect(line).toBe("How the field is built, pass by pass.");
    expect(link).toEqual({
      label: "Read the making-of",
      href: studyHref("making-of"),
    });
    expect(link.href).toBe("/work/making-of");
  });
});

describe("scene descriptions", () => {
  it("REQ-A11Y-05 every chapter has a scene line", () => {
    expect(Object.keys(story.scenes).sort()).toEqual([...chapterOrder].sort());
    for (const chapter of chapterOrder) {
      expect(story.scenes[chapter].trim().length).toBeGreaterThan(LIVE.length);
    }
  });

  it("REQ-A11Y-05 A14 every scene describes the live field only where it is drawn, so it is true on every tier", () => {
    for (const chapter of chapterOrder) {
      expect(story.scenes[chapter].startsWith(LIVE)).toBe(true);
    }
  });

  it("REQ-A11Y-05 A14 the hero scene also says what a still picture shows", () => {
    expect(story.scenes.hero).toContain("still picture of the field");
  });
});

describe("story copy voice", () => {
  const texts = strings(story);

  it("REQ-HYG-06 no dash is used as punctuation", () => {
    // The en and em dash by code point, so this file holds neither.
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).not.toMatch(dashes);
      expect(text).not.toMatch(/\S\s+-\s+\S/);
    }
  });

  it("REQ-HYG-06 no exclamation marks", () => {
    for (const text of texts) expect(text).not.toContain("!");
  });

  it("REQ-CNT-05 every line is supplied, with no marker left in it", () => {
    for (const text of texts) {
      expect(text).not.toMatch(/\[(?:FILL|CONFIRM)/);
      expect(text.trim()).toBe(text);
    }
  });
});
