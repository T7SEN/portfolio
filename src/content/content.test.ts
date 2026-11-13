import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { about } from "./about";
import {
  headlineParts,
  headlines,
  heroCopy,
  particleCount,
  STATIC_TIER,
  tierLabel,
  tierReadout,
} from "./hero";
import {
  fullStudies,
  getStudy,
  shortStudies,
  studies,
  studyHref,
  studyNumber,
  studySlugs,
} from "./index";
import { isMarker } from "./markers";
import { pages, studyPage } from "./pages";
import { passViewer } from "./passes";
import { services } from "./services";
import { copyright, site } from "./site";
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

function full(slug: FullStudy["slug"]): FullStudy {
  const study = getStudy(slug);
  if (study?.kind !== "full") throw new Error(`${slug} must be a full study`);
  return study;
}

function short(slug: ShortStudy["slug"]): ShortStudy {
  const study = getStudy(slug);
  if (study?.kind !== "short") throw new Error(`${slug} must be short`);
  return study;
}

const tiers: readonly Tier[] = [1, 2, 3];
const everything = {
  studies,
  hero: tiers.map(heroCopy),
  services,
  about,
  pages,
  studyPage,
  site,
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
    expect(studySlugs.map(studyNumber)).toEqual(["01", "02", "03", "04", "05"]);
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
    expect([...fullStudies, ...shortStudies]).toEqual([...studies]);
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

describe("study listings", () => {
  it("REQ-CNT-01 every study has its kind, line, stack and both table cells", () => {
    for (const { listing } of studies) {
      for (const text of [
        listing.kind,
        listing.studyLabel,
        listing.line,
        listing.what,
        listing.builtWith,
      ]) {
        expect(text.trim()).not.toBe("");
      }
      expect(listing.stack.length).toBeGreaterThan(0);
    }
  });

  it("REQ-CNT-01 full studies are case studies with figure slots; short studies wear their badge", () => {
    for (const study of fullStudies) {
      expect(study.listing.kind).toBe("Case study");
      expect(study.listing.studyLabel).toBe("Full study");
      expect(study.listing.metrics.length).toBeGreaterThan(0);
    }
    expect(short("t7sen-url").listing).toMatchObject({
      kind: "Short-form",
      studyLabel: "Short study",
    });
    expect(short("systemseven").listing).toMatchObject({
      kind: "In progress",
      studyLabel: "In progress",
    });
  });

  it("REQ-CNT-01 the rows carry the accepted lines and stacks as written", () => {
    expect(full("making-of").listing).toMatchObject({
      line: "A compute particle field that re-forms into each full study, with a fallback for every device. One shader codebase runs on WebGPU and WebGL2.",
      stack: ["WebGPU", "TSL", "three.js r187", "GSAP"],
      builtWith: "Next.js 16, three.js r187, WebGPU and TSL",
    });
    expect(full("coup-online").listing).toMatchObject({
      line: "Real-time Coup for 3 to 6 players. Each match lives in its own Durable Object room that keeps every client in sync and brings dropped players back mid-game.",
      stack: ["Next.js", "Cloudflare Workers", "Durable Objects", "TrueSkill"],
    });
    expect(full("archelab").listing).toMatchObject({
      line: "An unofficial tools hub for The First Descendant players. Its first tool builds chat messages with a live preview in game colours and links you can share.",
      stack: ["Next.js", "Static", "Zero cost"],
      builtWith: "Next.js 16, static, Vercel",
    });
    expect(short("systemseven").listing).toMatchObject({
      line: "A custom Discord bot for my stream's server, starting with stream notifications.",
      stack: ["TypeScript", "discord.js 14", "Sentry"],
    });
    expect(short("t7sen-url").listing.builtWith).toBe(
      "Next.js 16, React 19, Tailwind 4",
    );
  });

  it("REQ-CNT-05 the row figures are the supplied and measured ones, each with its source", () => {
    expect(
      fullStudies.map((study) =>
        study.listing.metrics.map((metric) => [metric.label, metric.value]),
      ),
    ).toEqual([
      [
        ["Frame time per tier", "Under 4.2 ms, capped by a 240 Hz display"],
        ["3D payload", "238.9 KB on desktop"],
      ],
      [
        ["Accounts", "6,713"],
        ["Matches", "3,251"],
      ],
      [["Unique visitors", "213"]],
    ]);
    for (const study of fullStudies) {
      for (const metric of study.listing.metrics) {
        expect(metric.source.trim()).not.toBe("");
        expect(isMarker(metric.source)).toBe(false);
      }
    }
  });

  it("REQ-CNT-05 the second links point where the studies' own links do, so no address is guessed", () => {
    expect(full("making-of").listing.secondary).toBeUndefined();
    expect(full("coup-online").listing.secondary).toEqual({
      label: "Play it",
      href: full("coup-online").links.live.href,
    });
    expect(full("archelab").listing.secondary?.href).toBe(
      full("archelab").links.live.href,
    );
    const repo = short("t7sen-url").listing.secondary;
    expect(repo).toEqual({
      label: "Repo",
      href: "https://github.com/T7SEN/t7sen-url",
    });
    expect(short("t7sen-url").links.map((link) => link.href)).toContain(
      repo?.href,
    );
    expect(short("systemseven").listing.secondary).toBeUndefined();
  });

  it("REQ-CNT-06 ArcheLab's row quote is the player's recorded quote, the same as on its study", () => {
    const archelabQuote = full("archelab").listing.quote;
    if (archelabQuote === undefined || typeof archelabQuote === "string") {
      throw new Error("ArcheLab's row quote is recorded");
    }
    expect(archelabQuote.who).toBe("BunnyEnjoyer, ArcheLab player");
    const quotes = full("archelab").quotes;
    expect(typeof quotes === "string" ? [] : quotes).toContain(archelabQuote);
    for (const study of fullStudies) {
      const quote = study.listing.quote;
      if (quote === undefined || typeof quote === "string") {
        if (quote !== undefined) expect(isMarker(quote)).toBe(true);
        continue;
      }
      expect(quote.permission.grantedBy.trim()).not.toBe("");
      expect(quote.permission.date.trim()).not.toBe("");
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
    expect(heroCopy(3).headlineLines).toEqual([
      "Real-time worlds,",
      "built for your GPU.",
    ]);
  });

  it("REQ-CNT-10 tiers 1 and 2 say rendered by your GPU", () => {
    for (const tier of [1, 2] as const) {
      expect(heroCopy(tier).headline).toBe(
        "Real-time worlds, rendered by your GPU.",
      );
      expect(heroCopy(tier).headlineLines).toEqual([
        "Real-time worlds,",
        "rendered by your GPU.",
      ]);
    }
  });

  it("REQ-CNT-10 the two lines always make up the whole headline", () => {
    for (const form of ["gpu", "still"] as const) {
      expect(`${headlineParts.first} ${headlineParts.second[form]}`).toBe(
        headlines[form],
      );
    }
    for (const tier of tiers) {
      const copy = heroCopy(tier);
      expect(copy.headlineLines.join(" ")).toBe(copy.headline);
    }
  });

  it("REQ-CNT-10 every element except the headline is the same on every tier", () => {
    for (const tier of tiers) {
      const { headline, headlineLines, ...rest } = heroCopy(tier);
      expect(headline).toMatch(/^Real-time worlds, /);
      expect(headlineLines[0]).toBe("Real-time worlds,");
      expect(rest).toEqual({
        eyebrow: "WebGPU developer",
        subLine:
          "Interactive 3D, campaigns and web games, shipped to every screen.",
        primaryAction: "See the work",
        secondaryAction: "Send a message",
        cornerControl: "Skip intro",
        scrollCue: "Scroll",
      });
    }
  });
});

describe("tier readout", () => {
  it("REQ-CNT-10 names each tier as the field chapter shows it", () => {
    expect(tiers.map(tierLabel)).toEqual([
      "Tier 1 · WebGPU",
      "Tier 2 · WebGL2",
      "Tier 3 · Still frame",
    ]);
  });

  it("REQ-CNT-10 REQ-TIER-05 shows the real tier and count on a phone", () => {
    expect(tierReadout(1, 1_000_000)).toBe("Tier 1 · WebGPU · 1M particles");
    expect(tierReadout(2, 250_000)).toBe("Tier 2 · WebGL2 · 250K particles");
    expect(tierReadout(2, 100_000)).toBe("Tier 2 · WebGL2 · 100K particles");
  });

  it("REQ-CNT-10 REQ-TIER-05 A14 shows no readout on tier 3 or before the field is ready", () => {
    expect(tierReadout(3, null)).toBeNull();
    expect(tierReadout(3, 0)).toBeNull();
    expect(tierReadout(null, null)).toBeNull();
    expect(tierReadout(1, null)).toBeNull();
    expect(tierReadout(2, 0)).toBeNull();
    expect(tierReadout(2, Number.NaN)).toBeNull();
  });

  it("REQ-CNT-10 REQ-TIER-05 shortens a count without overstating it", () => {
    expect(particleCount(1_000_000)).toBe("1M");
    expect(particleCount(1_500_000)).toBe("1.5M");
    expect(particleCount(262_144)).toBe("262K");
    expect(particleCount(999_999)).toBe("1M");
    expect(particleCount(640)).toBe("640");
  });
});

describe("short studies", () => {
  it("REQ-CNT-04 SystemSeven is in progress and says it is built, not running", () => {
    const study = short("systemseven");
    if (!study.inProgress) {
      throw new Error("SystemSeven must be an in-progress short study");
    }
    expect(study.status).toBe("Built, not running: no live features yet.");
    expect(study.listing.what).toContain("Built, not running yet.");
  });

  it("REQ-CNT-04 t7sen-url is not in progress", () => {
    expect(short("t7sen-url").inProgress).toBe(false);
  });

  it("REQ-CNT-04 each short study has what, why and stack, and a shipped one its links", () => {
    for (const study of shortStudies) {
      expect(study.what).not.toBe("");
      expect(study.why).not.toBe("");
      expect(study.stack.length).toBeGreaterThan(0);
      if (!study.inProgress) expect(study.links.length).toBeGreaterThan(0);
    }
  });

  it("REQ-CNT-04 SystemSeven has no links: its repository is private and nothing runs yet", () => {
    expect(short("systemseven").links).toEqual([]);
    expect(short("systemseven").listing.secondary).toBeUndefined();
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

  it("REQ-CNT-05 no result or row figure is a figure without a source", () => {
    for (const study of fullStudies) {
      for (const row of [...study.results, ...study.listing.metrics]) {
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
      if (typeof study.quotes === "string") {
        expect(isMarker(study.quotes)).toBe(true);
        continue;
      }
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

describe("study pages", () => {
  it("REQ-CNT-03 every full study has its tag, role line, screenshot, diagram and excerpt, each complete or a marker", () => {
    for (const study of fullStudies) {
      expect(study.tag.trim()).not.toBe("");
      expect(study.roleLine.trim()).not.toBe("");

      const { screenshot, diagram, excerpt } = study;
      if (typeof screenshot === "string") {
        expect(isMarker(screenshot)).toBe(true);
      } else {
        expect(screenshot.src).toMatch(/^\/\S+\.(?:avif|webp|png|jpe?g)$/);
        expect(screenshot.alt.trim()).not.toBe("");
        expect(screenshot.caption.trim()).not.toBe("");
        expect(screenshot.width).toBeGreaterThan(0);
        expect(screenshot.height).toBeGreaterThan(0);
      }

      if (typeof diagram === "string") {
        expect(isMarker(diagram)).toBe(true);
      } else {
        expect(diagram.name.trim()).not.toBe("");
        expect(diagram.boxes.filter((box) => box.isKey === true)).toHaveLength(
          1,
        );
      }

      if (typeof excerpt === "string") {
        expect(isMarker(excerpt)).toBe(true);
      } else {
        for (const text of [
          excerpt.caption,
          excerpt.path,
          excerpt.language,
          excerpt.code,
        ]) {
          expect(text.trim()).not.toBe("");
        }
      }
    }
  });

  it("REQ-CNT-04 every short study has its tag", () => {
    for (const study of shortStudies) {
      expect(study.tag.trim()).not.toBe("");
    }
  });

  it("REQ-CNT-12 ArcheLab's screenshot, while still to come, asks for its own interface with no game art", () => {
    const { screenshot } = full("archelab");
    if (typeof screenshot === "string") {
      expect(screenshot).toContain("own interface");
      expect(screenshot).toContain("no game art");
    }
  });

  it("REQ-CNT-03 REQ-CNT-04 the study pages name the seven parts and the four short parts in order", () => {
    expect(Object.values(studyPage.parts)).toEqual([
      "Summary",
      "Problem and role",
      "Approach",
      "The hard part",
      "Results",
      "What I would change",
      "Links",
    ]);
    expect(Object.values(studyPage.shortParts)).toEqual([
      "What it is",
      "Why it exists",
      "Stack",
      "Links",
    ]);
  });

  it("REQ-CNT-01 the study page's interface words follow the preview", () => {
    expect(studyPage.label).toEqual({
      full: "Full study",
      short: "Short study",
    });
    expect(studyPage.facts).toEqual({
      role: "Role",
      builtWith: "Built with",
      live: "Live",
      code: "Code",
      codeOnRequest: "On request",
    });
    expect(studyPage.breadcrumb).toEqual({
      name: "Breadcrumb",
      work: { label: "Work", href: "/work" },
    });
    expect(studyPage.contents).toBe("In this study");
    expect(studyPage.more).toEqual({
      name: "More studies",
      previous: "Previous",
      next: "Next",
    });
  });
});

const RESULTS = join(process.cwd(), "docs", "results");

/** A text file in the repository, by its path from the root. */
function repoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

/** A WebP file's size in pixels, read from its first chunk. */
function webpSize(bytes: Buffer) {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

describe("recorded facts", () => {
  const frames = readFileSync(join(RESULTS, "2026-11-12-making-of.md"), "utf8");

  it("REQ-PERF-06 REQ-TIER-05 A1 the frame times are the measured ones, the display's cap named and not shown as the cost", () => {
    for (const tier of [1, 2]) {
      expect(frames).toMatch(
        new RegExp(`^making-of tier ${tier} .* median 4\\.20 ms`, "m"),
      );
    }
    expect(frames).toContain("at 240 Hz");
    const timed = full("making-of").results.filter((row) =>
      /frame time/i.test(row.label),
    );
    expect(timed).toHaveLength(2);
    for (const row of timed) {
      expect(row.value).toBe("Under 4.2 ms");
      expect(row.source).toContain("240 Hz display");
      expect(row.source).toContain("docs/results/2026-11-12-making-of.md");
    }
    expect(passViewer.tiers.map((row) => row.value)).toEqual([
      "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display",
      "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display",
      "Static image",
    ]);
    expect(frames).toContain("NVIDIA GeForce RTX 4060 Ti");
  });

  it("REQ-PERF-05 A1 the 3D payloads are the budget check's own figures, kept in the making-of results", () => {
    const sized = full("making-of").results.filter((row) =>
      / KB$/.test(row.value),
    );
    expect(sized.map((row) => row.value)).toEqual([
      "239.0 KB",
      "245.4 KB",
      "745.5 KB",
    ]);
    // The day's budget file is written again at every gate, so the study
    // cites the making-of results, which keep the table of one build.
    const [desktop, phone, still] = sized.map((row) => row.value);
    expect(frames).toContain(`| 1 | desktop | ${desktop} |`);
    expect(frames).toContain(`| 2 | phone | ${phone} |`);
    expect(frames).toContain(`| 3 | phone | ${still} |`);
    for (const row of sized) {
      expect(row.source).toContain("docs/results/2026-11-12-making-of.md");
    }
  });

  it("REQ-CNT-03 the making-of's code excerpt is in its file as written", () => {
    const excerpt = full("making-of").excerpt;
    if (typeof excerpt === "string") throw new Error("the excerpt is supplied");
    expect(repoFile(excerpt.path)).toContain(excerpt.code);
  });

  it("REQ-CNT-06 the player quotes are as recorded, each with its permission of 12 Nov 2026", () => {
    const recorded = fullStudies.flatMap((study) =>
      typeof study.quotes === "string" ? [] : (study.quotes ?? []),
    );
    expect(recorded.map((quote) => [quote.who, quote.permission])).toEqual([
      [
        "Rafael Borges, Coup Online player",
        {
          grantedBy:
            "Rafael Borges through the coups.app post-game feedback form",
          date: "12 Nov 2026",
        },
      ],
      [
        "BunnyEnjoyer, ArcheLab player",
        { grantedBy: "BunnyEnjoyer by email", date: "12 Nov 2026" },
      ],
    ]);
  });

  it("REQ-CNT-05 REQ-PERF-01 every study screenshot is in public at the size it states, with a smaller phone file", () => {
    for (const study of fullStudies) {
      const shot = study.screenshot;
      if (typeof shot === "string") continue;
      for (const file of [shot, shot.phone]) {
        const bytes = readFileSync(join(process.cwd(), "public", file.src));
        expect(webpSize(bytes), file.src).toEqual({
          width: file.width,
          height: file.height,
        });
        expect(bytes.length, file.src).toBeLessThan(100 * 1024);
      }
      expect(shot.phone.width).toBeLessThan(shot.width);
      expect(shot.phone.width / shot.phone.height).toBeCloseTo(
        shot.width / shot.height,
        1,
      );
    }
  });

  it("REQ-CNT-05 no marker is left in the studies, and SystemSeven's why is T7SEN's approved line", () => {
    const markers = strings(studies).filter((text) =>
      /\[(?:FILL|CONFIRM)/.test(text),
    );
    expect(markers).toEqual([]);
    expect(short("systemseven").why).toBe(
      "A bot of my own for my stream's Discord server, starting with stream notifications.",
    );
    expect(isMarker(short("systemseven").why)).toBe(false);
  });
});

describe("ArcheLab", () => {
  it("REQ-CNT-12 says it is unofficial fan work for The First Descendant", () => {
    expect(full("archelab").notice).toBe(
      "ArcheLab is unofficial fan work for The First Descendant.",
    );
    expect(full("coup-online").notice).toBe(
      "Coup Online is an unofficial fan version of Coup, the card game designed by Rikki Tahta.",
    );
    expect(full("archelab").listing.what).toMatch(/^An unofficial /);
  });

  it("REQ-CNT-12 no content names the game's publisher", () => {
    for (const text of strings(everything)) {
      expect(text).not.toMatch(/nexon/i);
    }
  });
});

describe("about", () => {
  it("REQ-CNT-08 the streamer thread is told in T7SEN's accepted words", () => {
    expect(about.heading).toBe("Real time, on and off stream.");
    expect(about.paragraphs).toEqual([
      "I'm T7SEN, a software developer who also streams competitive games. Streaming is real time with an audience: every frame has to land, and people leave the moment it stalls.",
      "I build for the web the same way.",
    ]);
    // Live performance, real-time systems and a sense for audiences.
    const thread = about.paragraphs.join(" ");
    for (const point of ["streams", "real time", "audience"]) {
      expect(thread).toContain(point);
    }
  });

  it("REQ-CNT-08 the skills sit in four labelled groups", () => {
    expect(about.skills).toEqual([
      { label: "Graphics", items: ["WebGPU", "TSL", "three.js"] },
      { label: "Motion", items: ["GSAP", "Lenis"] },
      { label: "Product", items: ["Next.js", "React", "TypeScript"] },
      {
        label: "Real-time backends",
        items: ["Cloudflare Workers", "Durable Objects"],
      },
    ]);
  });

  it("REQ-CNT-05 GitHub links to its profile and the stream waits for its address", () => {
    const [github, stream] = about.links;
    expect(github).toEqual({
      label: "GitHub",
      href: "https://github.com/T7SEN",
    });
    expect(github).toEqual(site.github);
    expect(stream.label).toBe("Stream");
    expect(isMarker(stream.href)).toBe(true);
    expect(stream.href).toContain("the stream channel URL");
  });

  it("REQ-CNT-08 the CV is on request through /contact, with no file anywhere", () => {
    expect(about.cv.link.href).toBe("/contact");
    expect(about.cv.ask).toEqual({ label: "Ask for my CV", href: "/contact" });
    for (const link of links(everything)) {
      expect(link.href).not.toMatch(/\.(?:pdf|docx?|odt|rtf)(?:[?#]|$)/i);
    }
    for (const text of strings(everything)) {
      expect(text).not.toMatch(/\.(?:pdf|docx?)\b/i);
    }
  });
});

describe("services", () => {
  it("REQ-CNT-11 two headline offers carry the pitch with one also line", () => {
    expect(services.offers.map((offer) => offer.title)).toEqual([
      "3D and WebGPU hero scenes",
      "Interactive campaigns and web games",
    ]);
    expect(services.also).toBe(
      "Also: full sites with motion, creator tools and Discord bots.",
    );
  });

  it("REQ-CNT-11 each offer has its accepted description, and the hiring line follows", () => {
    expect(services.offers.map((offer) => offer.description)).toEqual([
      "Interactive centrepieces for a brand or product, with a fallback for every device.",
      "Playable, shareable and built to load fast.",
    ]);
    expect(services.hiring).toBe(
      "Hiring for a creative or WebGPU frontend role? Same form.",
    );
  });
});

describe("pages", () => {
  it("REQ-CNT-01 every route has a title and an intro", () => {
    for (const page of Object.values(pages)) {
      expect(page.title.trim()).not.toBe("");
      expect(page.intro.trim()).not.toBe("");
    }
    for (const page of [pages.work, pages.about, pages.contact]) {
      expect(page.heading.trim()).not.toBe("");
      expect(page.label.length).toBeGreaterThan(0);
    }
  });

  it("REQ-CNT-01 REQ-CNT-02 /work is the index with no 3D, as a table with the archive last", () => {
    expect(pages.work.label).toEqual(["All work", "No 3D"]);
    expect(Object.values(pages.work.table.headers)).toEqual([
      "No.",
      "Project",
      "What it is",
      "Built with",
      "Study",
    ]);
    expect(pages.work.table.v1.link.href).toBe("/v1");
    // /v1 is a marker until P8, so the row claims no screenshots yet (A1).
    expect(pages.work.table.v1.what).toBe(pages.v1.intro);
    expect(pages.work.table.v1.what).not.toMatch(/screenshot/i);
    expect(pages.work.closing).toEqual({
      text: "Want something like this built?",
      action: { label: "Send a message", href: "/contact" },
    });
  });

  it("REQ-CNT-01 /about reuses the About copy under its own label", () => {
    expect(pages.about.heading).toBe(about.heading);
    expect(pages.about.intro).toBe(about.paragraphs[0]);
    expect(pages.about.sections).toEqual({
      offers: "What I build",
      skills: "Tools I use",
      elsewhere: "Elsewhere",
    });
  });

  it("REQ-CNT-01 /contact shows the address with Copy and the Hiring panel; the form waits for P6", () => {
    expect(pages.contact.title).toBe("Contact");
    expect(pages.contact.heading).toBe("Tell me what you are building.");
    expect(pages.contact.address.email).toBe("hello@t7sen.com");
    expect(pages.contact.address.href).toBe("mailto:hello@t7sen.com");
    for (const text of Object.values(pages.contact.address.copy)) {
      expect(text.trim()).not.toBe("");
    }
    expect(pages.contact.hiring.title).toBe("Hiring?");
    expect(isMarker(pages.contact.form)).toBe(true);
    // No form until P6, so the intro describes none (A14).
    expect(pages.contact.intro).toBe(
      "Tell me what you are building, and I will reply by email.",
    );
    expect(pages.contact.intro).not.toMatch(/form|inbox/i);
  });

  it("REQ-CNT-01 A15 the index link's note claims nothing unmeasured", () => {
    expect(pages.home.work.index.note).toEqual(["No 3D", "Static HTML"]);
    expect(pages.home.work.index.note.join(" ")).not.toMatch(/instant|fast/i);
  });

  it("REQ-CNT-01 the home chapters carry their titles and the links to /work and /v1", () => {
    const { work, makingOf, contact } = pages.home;
    expect(work.title).toBe("Selected work");
    expect(work.index).toMatchObject({
      label: "Open the full index",
      href: "/work",
      note: ["No 3D", "Static HTML"],
    });
    expect(work.archive.link.href).toBe("/v1");
    expect(makingOf.title).toBe("How one frame is built");
    expect(makingOf.link).toEqual({
      label: "Read the full making-of",
      href: studyHref("making-of"),
    });
    expect(contact.title).toBe("Send a message.");
    expect(contact.panel.action.href).toBe("/contact");
  });

  it("REQ-CNT-01 REQ-ENG-09 A14 the making-of line says the passes come one at a time on the T7 mark, asks for no pick and claims no stirring", () => {
    expect(pages.home.makingOf.intro).toBe(
      "The render passes that draw this field, one at a time, each shown on the T7 mark.",
    );
    // The row brings each card to the middle as the page scrolls, and the
    // still grid shows them all, so the line asks the visitor to pick none.
    expect(pages.home.makingOf.intro).not.toMatch(/select|choose|pick/i);
    expect(pages.home.makingOf.intro).not.toMatch(/stirred|you stir/i);
  });
});

describe("site", () => {
  it("REQ-CNT-01 the footer carries the tagline and the build year", () => {
    expect(site.tagline).toBe("Real-time worlds, built in the browser.");
    expect(copyright(2026)).toBe("© 2026 T7SEN");
    expect(copyright(2027)).toBe("© 2027 T7SEN");
  });

  it("REQ-CNT-01 landmarks and the logo link use the previews' accessible names", () => {
    expect(site.names).toEqual({
      logoLink: "T7SEN, home",
      siteControls: "Site controls",
      intro: "Intro",
      field: "The particle field",
      footer: "Footer",
    });
  });
});

describe("copy voice", () => {
  // A code excerpt is the repository's own code, verbatim, so it is read as
  // code, not as copy: an inequality such as != is not an exclamation mark.
  const code = new Set(
    fullStudies.flatMap((study) =>
      typeof study.excerpt === "string" ? [] : [study.excerpt.code],
    ),
  );
  const texts = strings(everything).filter((text) => !code.has(text));

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
});
