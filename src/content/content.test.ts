import { describe, expect, it } from "vitest";
import { about } from "./about";
import { headlines, heroCopy, STATIC_TIER } from "./hero";
import { getStudy, studies, studyHref, studySlugs } from "./index";
import { isMarker } from "./markers";
import { pages } from "./pages";
import { services } from "./services";
import type { FullStudy, Link, ShortStudy, Tier } from "./types";

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(strings);
  }
  return [];
}

function links(value: unknown): Link[] {
  if (Array.isArray(value)) return value.flatMap(links);
  if (value === null || typeof value !== "object") return [];
  const found = "href" in value && "label" in value ? [value as Link] : [];
  return [...found, ...Object.values(value).flatMap(links)];
}

const tiers: readonly Tier[] = [1, 2, 3];
const fullStudies = studies.filter(
  (study): study is FullStudy => study.kind === "full",
);
const shortStudies = studies.filter(
  (study): study is ShortStudy => study.kind === "short",
);
const everything = {
  studies,
  hero: tiers.map(heroCopy),
  services,
  about,
  pages,
};

describe("study index", () => {
  it("REQ-CNT-07 lists the studies as making-of, Coup Online, ArcheLab, t7sen-url, SystemSeven", () => {
    const order = [
      "making-of",
      "coup-online",
      "archelab",
      "t7sen-url",
      "systemseven",
    ];
    expect(studies.map((study) => study.slug)).toEqual(order);
    expect(studySlugs).toEqual(order);
  });

  it("REQ-CNT-07 finds each study by slug and links it under /work", () => {
    for (const slug of studySlugs) {
      expect(getStudy(slug)?.slug).toBe(slug);
      expect(studyHref(slug)).toBe(`/work/${slug}`);
    }
    expect(getStudy("v1")).toBeUndefined();
  });

  it("REQ-CNT-03 three full studies lead and two short studies follow", () => {
    expect(studies.map((study) => study.kind)).toEqual([
      "full",
      "full",
      "full",
      "short",
      "short",
    ]);
  });

  it("REQ-CNT-03 every full study holds all seven parts with a three-line summary", () => {
    const parts = [
      "summary",
      "problem",
      "approach",
      "hardPart",
      "results",
      "wouldChange",
      "links",
    ];
    for (const study of fullStudies) {
      for (const part of parts) expect(study).toHaveProperty(part);
      expect(study.summary).toHaveLength(3);
      expect(study.problem).toHaveProperty("constraints");
      expect(study.problem).toHaveProperty("role");
    }
  });
});

describe("hero copy", () => {
  it("REQ-CNT-10 the static HTML uses tier 3", () => {
    expect(STATIC_TIER).toBe(3);
    expect(heroCopy(STATIC_TIER).headline).toBe(headlines.still);
  });

  it("REQ-CNT-10 tier 3 says built for your GPU", () => {
    expect(heroCopy(3).headline).toBe("Real-time worlds, built for your GPU.");
  });

  it("REQ-CNT-10 tiers 1 and 2 say rendered by your GPU", () => {
    for (const tier of [1, 2] as const) {
      expect(heroCopy(tier).headline).toBe(
        "Real-time worlds, rendered by your GPU.",
      );
    }
  });

  it("REQ-CNT-10 every element except the headline is the same on every tier", () => {
    for (const tier of tiers) {
      const { headline, ...rest } = heroCopy(tier);
      expect(headline).toMatch(/^Real-time worlds, /);
      expect(rest).toEqual({
        eyebrow: "WebGPU developer",
        subLine:
          "Interactive 3D, campaigns and web games, shipped to every screen.",
        primaryAction: "See the work",
        secondaryAction: "Send a message",
        cornerControl: "Skip intro",
      });
    }
  });
});

describe("short studies", () => {
  it("REQ-CNT-04 SystemSeven is in progress and says it is built, not running", () => {
    const study = getStudy("systemseven");
    expect(study?.kind).toBe("short");
    if (study?.kind !== "short" || !study.inProgress) {
      throw new Error("SystemSeven must be an in-progress short study");
    }
    expect(study.status).toBe("Built, not running: no live features yet.");
  });

  it("REQ-CNT-04 t7sen-url is not in progress", () => {
    const study = getStudy("t7sen-url");
    expect(study?.kind).toBe("short");
    expect(study?.kind === "short" && study.inProgress).toBe(false);
  });

  it("REQ-CNT-04 each short study has what, why, stack and links", () => {
    for (const study of shortStudies) {
      expect(study.what).not.toBe("");
      expect(study.why).not.toBe("");
      expect(study.stack.length).toBeGreaterThan(0);
      expect(study.links.length).toBeGreaterThan(0);
    }
  });
});

describe("no invented proof", () => {
  it("REQ-CNT-05 every marker names what is missing", () => {
    const texts = strings(everything);
    const markers = texts.flatMap(
      (text) => text.match(/\[(?:FILL|CONFIRM)[^\]]*\]?/g) ?? [],
    );
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) {
      expect(marker).toMatch(/^\[(?:FILL|CONFIRM): [^[\]]+\]$/);
    }
  });

  it("REQ-CNT-05 no result value is a figure without a source", () => {
    for (const study of fullStudies) {
      for (const row of study.results) {
        expect(typeof row.value).toBe("string");
        if (!isMarker(row.value)) {
          expect(row.source.trim()).not.toBe("");
          expect(row.source).not.toMatch(/\[(?:FILL|CONFIRM)/);
        }
      }
    }
  });

  it("REQ-CNT-05 every link is a marker, a page on this site or a full address", () => {
    const found = links(everything);
    expect(found.length).toBeGreaterThan(0);
    for (const link of found) {
      if (isMarker(link.href)) continue;
      expect(link.href).toMatch(/^(?:\/|#|https:\/\/|mailto:)/);
    }
  });

  it("REQ-CNT-06 every quote carries who allowed it and when", () => {
    for (const study of fullStudies) {
      for (const quote of study.quotes ?? []) {
        expect(quote.permission.grantedBy.trim()).not.toBe("");
        expect(quote.permission.date.trim()).not.toBe("");
        if (!isMarker(quote.text)) {
          expect(strings(quote.permission).some(isMarker)).toBe(false);
        }
      }
    }
  });
});

describe("ArcheLab", () => {
  it("REQ-CNT-12 says it is unofficial fan work for The First Descendant", () => {
    const study = getStudy("archelab");
    expect(study?.kind).toBe("full");
    expect(study?.kind === "full" && study.notice).toBe(
      "ArcheLab is unofficial fan work for The First Descendant.",
    );
  });

  it("REQ-CNT-12 no content names the game's publisher", () => {
    for (const text of strings(everything)) {
      expect(text).not.toMatch(/nexon/i);
    }
  });
});

describe("about and services", () => {
  it("REQ-CNT-08 the streamer thread names its three framing points", () => {
    expect(about.thread).toEqual([
      "Live performance",
      "Real-time systems",
      "A sense for audiences",
    ]);
  });

  it("REQ-CNT-08 the CV is on request through /contact, with no file anywhere", () => {
    expect(about.cv.link.href).toBe("/contact");
    for (const link of links(everything)) {
      expect(link.href).not.toMatch(/\.(?:pdf|docx?|odt|rtf)(?:[?#]|$)/i);
    }
    for (const text of strings(everything)) {
      expect(text).not.toMatch(/\.(?:pdf|docx?)\b/i);
    }
  });

  it("REQ-CNT-11 two headline offers carry the pitch with one also line", () => {
    expect(services.offers).toEqual([
      "3D and WebGPU hero scenes",
      "Interactive campaigns and web games",
    ]);
    expect(services.also).toBe(
      "Also: full sites with motion, creator tools and Discord bots.",
    );
  });

  it("REQ-CNT-01 every route has a title and an intro", () => {
    for (const page of Object.values(pages)) {
      expect(page.title.trim()).not.toBe("");
      expect(page.intro.trim()).not.toBe("");
    }
    expect(pages.contact.intro).toBe(
      "Tell me what you are building, and I will reply by email.",
    );
  });
});
