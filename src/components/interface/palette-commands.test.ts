import { describe, expect, it } from "vitest";

import { studies, studyHref } from "@/content";

import {
  ACTION_ROWS,
  GO_ROWS,
  HIDDEN_ROWS,
  hiddenRowsFor,
  matchesSearch,
  runningTier,
  SETTING_ROWS,
  TIER_ROWS,
} from "./palette-commands";

const labels = (rows: readonly { label: string }[]) =>
  rows.map(({ label }) => label);

describe("palette commands", () => {
  it("REQ-NAV-04 REQ-CNT-07 Go to lists every study in study order, the home chapters, then the pages", () => {
    expect(labels(GO_ROWS)).toEqual([
      ...studies.map((study) => study.title),
      "Home: Work",
      "Home: Making-of",
      "Home: About",
      "Home: Contact",
      "Home",
      "All work, no 3D",
      "About",
      "Contact",
      "v1 archive",
    ]);
    expect(
      GO_ROWS.slice(0, studies.length).map(({ target }) => target),
    ).toEqual(
      studies.map((study) => ({ kind: "page", href: studyHref(study.slug) })),
    );
    expect(
      GO_ROWS.filter(({ target }) => target.kind === "section").map(
        ({ target }) => target.kind === "section" && target.id,
      ),
    ).toEqual(["work", "making-of", "about", "contact"]);
  });

  it("REQ-NAV-04 Settings and Actions are as the preview has them", () => {
    expect(labels(SETTING_ROWS)).toEqual([
      "Background sound",
      "Interface sounds",
      "Quality tier",
      "Calm mode",
    ]);
    expect(labels(ACTION_ROWS)).toEqual([
      "Copy email address",
      "Ask for my CV",
    ]);
  });

  it("REQ-NAV-04 REQ-SND-01 a search for sound or mute finds both sound rows, and each is found by what it plays", () => {
    const sound = SETTING_ROWS.filter(({ id }) =>
      ["background", "ticks"].includes(id),
    );
    for (const search of ["sound", "mute", "audio"]) {
      expect(sound.every((row) => matchesSearch(row, search))).toBe(true);
    }
    expect(
      labels(SETTING_ROWS.filter((row) => matchesSearch(row, "rain"))),
    ).toEqual(["Background sound"]);
    expect(
      labels(SETTING_ROWS.filter((row) => matchesSearch(row, "clicks"))),
    ).toEqual(["Interface sounds"]);
  });

  it("REQ-NAV-04 every row's cmdk value is unique across both pages", () => {
    const values = [
      ...GO_ROWS,
      ...SETTING_ROWS,
      ...ACTION_ROWS,
      ...HIDDEN_ROWS,
      ...TIER_ROWS,
    ].map(({ value }) => value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("REQ-NAV-04 a search matches every word in a row's words or keywords, in any case", () => {
    const coup = GO_ROWS.find(({ label }) => label === "Coup Online");
    const cv = ACTION_ROWS.find(({ id }) => id === "cv");
    if (coup === undefined || cv === undefined) throw new Error("rows");
    expect(matchesSearch(coup, "")).toBe(true);
    expect(matchesSearch(coup, "  ")).toBe(true);
    expect(matchesSearch(coup, "COUP")).toBe(true);
    expect(matchesSearch(coup, "coup onl")).toBe(true);
    expect(matchesSearch(coup, "coup lab")).toBe(false);
    expect(matchesSearch(cv, "resume")).toBe(true);
    expect(matchesSearch(cv, "résumé")).toBe(true);
    // The lead role finds About, as the old one does (D-178).
    const about = GO_ROWS.find(
      ({ target }) => target.kind === "page" && target.href === "/about",
    );
    if (about === undefined) throw new Error("no About row");
    expect(matchesSearch(about, "architect")).toBe(true);
    expect(matchesSearch(about, "software architect")).toBe(true);
    expect(matchesSearch(about, "developer")).toBe(true);
  });

  it("REQ-NAV-05 a hidden command shows only for its exact code, in any case", () => {
    expect(labels(hiddenRowsFor("gg"))).toEqual(["Spell GG in the field"]);
    expect(labels(hiddenRowsFor(" LOGO "))).toEqual(["Re-form the logo"]);
    expect(labels(hiddenRowsFor("Flip"))).toEqual(["Make it rain upward"]);
    for (const near of ["g", "ggg", "log", "flips", "spell", "gravity", ""]) {
      expect(hiddenRowsFor(near)).toEqual([]);
    }
    // No ordinary row gives a hidden one away.
    for (const { code } of HIDDEN_ROWS) {
      const shown = [...GO_ROWS, ...SETTING_ROWS, ...ACTION_ROWS].filter(
        (row) => matchesSearch(row, code),
      );
      expect(shown).toEqual([]);
    }
  });

  it("REQ-TIER-04 A14 the tier shown is the one the current choice runs, never the flow before it", () => {
    const ready = (
      tier: 1 | 2 | 3,
      reason: Parameters<typeof runningTier>[1]["reason"],
    ) => ({
      tier,
      reason,
      ready: true,
    });
    // Auto runs whatever the decision table and the probe chose.
    expect(runningTier("auto", ready(1, "probe-pass"))).toBe(1);
    expect(runningTier("auto", ready(2, "phone"))).toBe(2);
    expect(runningTier("auto", ready(2, "webgpu-init-fallback"))).toBe(2);
    // A forced tier that runs.
    expect(runningTier(2, ready(2, "forced"))).toBe(2);
    // A forced tier 1 the device could not start.
    expect(runningTier(1, ready(2, "webgpu-init-fallback"))).toBe(2);
    expect(runningTier(2, ready(3, "no-backend"))).toBe(3);
    expect(runningTier(1, ready(2, "device-lost"))).toBe(2);
    // The flow from before the choice changed: nothing runs for it yet.
    expect(runningTier(2, ready(1, "probe-pass"))).toBeNull();
    expect(runningTier(2, ready(1, "forced"))).toBeNull();
    expect(runningTier("auto", ready(3, "forced"))).toBeNull();
    // Auto's own fallback, still on screen as a still frame is chosen: tier
    // 3 has nothing below it, so it is the old flow.
    expect(runningTier(3, ready(2, "webgpu-init-fallback"))).toBeNull();
    expect(runningTier(2, ready(2, "webgpu-init-fallback"))).toBeNull();
    expect(runningTier(2, ready(1, "device-lost"))).toBeNull();
    // Nothing drawn yet.
    expect(
      runningTier("auto", { tier: 1, reason: "probe-pass", ready: false }),
    ).toBeNull();
    expect(
      runningTier(1, { tier: null, reason: null, ready: false }),
    ).toBeNull();
  });
});
