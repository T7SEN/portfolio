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
import { pages } from "./pages";
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

  it("REQ-CNT-05 the figure slots hold markers until P4 supplies the figures", () => {
    const labels = fullStudies.map((study) =>
      study.listing.metrics.map((metric) => metric.label),
    );
    expect(labels).toEqual([
      ["Frame time per tier", "3D payload"],
      ["Players", "Matches"],
      ["Users"],
    ]);
    for (const study of fullStudies) {
      for (const metric of study.listing.metrics) {
        expect(isMarker(metric.value)).toBe(true);
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

  it("REQ-CNT-06 ArcheLab's row quote stays a marker until a player quote with permission is supplied", () => {
    // Markers are read from the content, so this file holds no marker text
    // for the release check to count.
    const archelabQuote = full("archelab").listing.quote;
    expect(typeof archelabQuote).toBe("string");
    expect(isMarker(String(archelabQuote))).toBe(true);
    expect(String(archelabQuote)).toContain("a player quote with permission");
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
    expect(full("archelab").notice).toBe(
      "ArcheLab is unofficial fan work for The First Descendant.",
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
      label: "Read the making-of",
      href: studyHref("making-of"),
    });
    expect(contact.title).toBe("Send a message.");
    expect(contact.panel.action.href).toBe("/contact");
  });

  it("REQ-CNT-01 A14 the making-of line asks for no pass before the pass viewer exists", () => {
    expect(pages.home.makingOf.intro).not.toMatch(/select|choose|pick/i);
    expect(pages.home.makingOf.intro).not.toMatch(/stirred/i);
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
  const texts = strings(everything);

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
