import { describe, expect, it } from "vitest";

import { WORK_SHAPES } from "@/engine/story";

import { fullStudies } from "./index";
import { chapterOrder, fieldNote, story } from "./story";
import type { FieldState } from "./story";

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

  it("REQ-SCR-01 REQ-CNT-03 the work chapter's shapes are the full studies, in study order", () => {
    expect([...WORK_SHAPES]).toEqual(fullStudies.map((study) => study.slug));
  });

  it("REQ-SCR-01 each label's number is the chapter's place after the hero", () => {
    for (const [chapter, label] of Object.entries(story.labels)) {
      const place = chapterOrder.indexOf(chapter as never);
      expect(place).toBeGreaterThan(0);
      expect(label.number).toBe(String(place).padStart(2, "0"));
    }
    expect(Object.keys(story.labels)).toEqual(chapterOrder.slice(1));
  });

  it("REQ-SCR-01 the labels read 01 Field to 05 Contact", () => {
    const labels = Object.values(story.labels).map(
      ({ number, name }) => `${number} / ${name}`,
    );
    expect(labels).toEqual([
      "01 / Field",
      "02 / Work",
      "03 / Making-of",
      "04 / About",
      "05 / Contact",
    ]);
  });
});

describe("field note", () => {
  const live: FieldState = {
    tier: 1,
    ready: true,
    calm: false,
    input: "pointer",
  };

  it("REQ-SCR-06 asks a pointer to stir the field and a finger to drag it", () => {
    expect(fieldNote(live)).toBe("Move the cursor to stir the field");
    expect(fieldNote({ ...live, tier: 2, input: "touch" })).toBe(
      "Drag a finger to stir the field.",
    );
  });

  it("REQ-A11Y-04 REQ-TIER-03 says a still is a still, and shows nothing in calm mode", () => {
    expect(fieldNote({ ...live, tier: 3 })).toBe("Still frame on this device");
    expect(fieldNote({ ...live, tier: 3, input: "touch" })).toBe(
      "Still frame on this device",
    );
    for (const tier of [1, 2, 3] as const) {
      expect(fieldNote({ ...live, tier, calm: true })).toBeNull();
    }
  });

  it("REQ-SCR-06 A14 the note claims nothing before the tier is ready", () => {
    expect(fieldNote({ ...live, ready: false })).toBeNull();
    expect(fieldNote({ ...live, tier: null })).toBeNull();
    expect(fieldNote({ ...live, tier: 3, ready: false })).toBeNull();
  });

  it("REQ-A11Y-05 the tier 3 still of the field chapter names the wordmark it shows", () => {
    expect(story.field.wordmarkAlt).toBe(
      "The T7SEN wordmark formed in the particle field",
    );
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

  it("REQ-A11Y-05 the scenes say what is drawn now", () => {
    // The dot left the centre of the screen for the headline's side (D-066,
    // then phase P3.5).
    expect(story.scenes.hero).not.toContain("centre");
    expect(story.scenes.hero).toContain("beside the headline");
    expect(story.scenes.bloom).toContain("the T7SEN mark");
    expect(story.scenes.bloom).toContain("the T7SEN wordmark");
    expect(story.scenes.bloom).toContain("flow lines");
    expect(story.scenes.work).toContain("inside its frame");
    for (const study of fullStudies) {
      expect(story.scenes.work).toContain(
        study.slug === "making-of" ? "the making-of" : study.title,
      );
    }
    expect(story.scenes["making-of"]).toContain("one sheet");
    expect(story.scenes.about).toContain("three thin strands");
    expect(story.scenes.contact).toContain("rings behind the contact panel");
  });
});

describe("making-of scene", () => {
  it("REQ-A11Y-05 REQ-ENG-09 A14 the making-of scene says the pass cards are drawn live only where the device draws them", () => {
    const scene = story.scenes["making-of"];
    expect(scene).toContain("pass cards");
    // A card the tier does not draw live shows a still, so the line claims
    // a live pass only for the cards the device draws.
    expect(scene).toContain("each card it draws live");
  });
});

describe("scene descriptions, both looks", () => {
  it("REQ-A11Y-05 A14 D-076 no scene names what only the halftone draws, so each is true of the soft field too", () => {
    for (const chapter of chapterOrder) {
      const scene = story.scenes[chapter];
      expect(scene).not.toMatch(
        /halftone|white|halo|rings? (?:round|around) the dot|two soft rings/i,
      );
    }
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
