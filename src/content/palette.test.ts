import { describe, expect, it } from "vitest";

import { EGGS } from "@/engine/story";

import { menuCopy } from "./menu";
import {
  paletteCopy,
  tierChoiceName,
  tierFallback,
  tierValue,
} from "./palette";
import { site } from "./site";

describe("palette copy", () => {
  it("REQ-NAV-04 names the dialog, its search and its results as the preview does", () => {
    expect(paletteCopy.name).toBe("Command palette");
    expect(paletteCopy.inputName).toBe("Search commands");
    expect(paletteCopy.placeholder).toBe(
      "Jump to a study, or change a setting",
    );
    expect(paletteCopy.placeholderShort).toBe("Jump to a study or a setting");
    expect(paletteCopy.keyHints).toBe("↑ ↓ move · Enter run · Esc close");
    expect(paletteCopy.hiddenHint).toBe("Some commands are hidden");
    expect(paletteCopy.groups).toEqual({
      goTo: "Go to",
      settings: "Settings",
      actions: "Actions",
      hidden: "Hidden",
    });
    // The close button's name holds the key cap it shows (WCAG 2.5.3).
    expect(paletteCopy.close.name).toContain(paletteCopy.close.key);
  });

  it("REQ-NAV-04 the pages are the menu's own pages of this site, GitHub left to the menu", () => {
    const menuPages = menuCopy.pages.filter(({ href }) => href.startsWith("/"));
    expect(
      [...paletteCopy.pages].sort((a, b) => a.href.localeCompare(b.href)),
    ).toEqual([...menuPages].sort((a, b) => a.href.localeCompare(b.href)));
  });

  it("REQ-NAV-04 the CV request is an email to the public address with its subject filled in", () => {
    expect(paletteCopy.cvHref).toBe(
      "mailto:hello@t7sen.com?subject=CV%20request",
    );
    expect(paletteCopy.cvHref).toContain(site.email);
  });

  it("REQ-NAV-05 every egg has one hidden command and one code, logo for the mark", () => {
    expect(paletteCopy.eggs.map(({ egg }) => egg)).toEqual([...EGGS]);
    expect(paletteCopy.eggs.map(({ code }) => code)).toEqual([
      "gg",
      "logo",
      "flip",
    ]);
  });

  it("REQ-TIER-04 the Quality tier value is the choice, then the tier that runs and its backend", () => {
    expect(tierValue("auto", 1)).toBe("Auto · Tier 1 · WebGPU");
    expect(tierValue("auto", 2)).toBe("Auto · Tier 2 · WebGL2");
    expect(tierValue("auto", 3)).toBe("Auto · Tier 3 · Still");
    expect(tierValue("auto", null)).toBe("Auto");
    expect(tierValue(2, 2)).toBe("Tier 2 · WebGL2");
    expect(tierValue(3, 3)).toBe("Tier 3 · Still");
    // Nothing runs yet: the choice alone, with no claim about a backend.
    expect(tierValue(1, null)).toBe("Tier 1");
  });

  it("REQ-TIER-04 A14 a forced tier the device did not give says what was asked and what runs", () => {
    expect(tierValue(1, 2)).toBe("Tier 1 asked · Tier 2 · WebGL2");
    expect(tierValue(2, 3)).toBe("Tier 2 asked · Tier 3 · Still");
    expect(tierFallback(1, 2, "webgpu-init-fallback")).toBe(
      "WebGPU did not start on this device, so Tier 2 · WebGL2 runs.",
    );
    expect(tierFallback(2, 3, "no-backend")).toBe(
      "No GPU renderer could start on this device, so the still frame shows.",
    );
    expect(tierFallback(1, 2, "device-lost")).toBe(
      "The GPU stopped responding, so Tier 2 · WebGL2 runs.",
    );
    expect(tierFallback(1, 2, null)).toBe(
      "Tier 1 is not available on this device, so Tier 2 · WebGL2 runs.",
    );
  });

  it("REQ-TIER-04 the second page lists Auto and the three tiers with their backends", () => {
    expect(paletteCopy.tierPage.options.map(({ label }) => label)).toEqual([
      "Auto",
      "Tier 1 · WebGPU",
      "Tier 2 · WebGL2",
      "Tier 3 · Still",
    ]);
    expect(tierChoiceName("auto")).toBe("Auto");
    expect(tierChoiceName(3)).toBe("Tier 3 · Still");
    expect(paletteCopy.announce.tierSet(tierChoiceName(2))).toBe(
      "Quality tier set to Tier 2 · WebGL2",
    );
  });

  it("REQ-HYG-06 no dash as punctuation and no exclamation mark", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    const texts: string[] = [
      paletteCopy.name,
      paletteCopy.inputName,
      paletteCopy.placeholder,
      paletteCopy.placeholderShort,
      paletteCopy.listName,
      paletteCopy.close.name,
      paletteCopy.keyHints,
      paletteCopy.hiddenHint,
      paletteCopy.empty,
      paletteCopy.calmSystem,
      paletteCopy.copied,
      paletteCopy.copyFailed,
      paletteCopy.addressName,
      paletteCopy.tierPage.placeholder,
      paletteCopy.tierPage.back,
      paletteCopy.tierPage.waiting,
      ...Object.values(paletteCopy.groups),
      ...Object.values(paletteCopy.sections),
      ...Object.values(paletteCopy.settings),
      ...Object.values(paletteCopy.values),
      ...Object.values(paletteCopy.actions),
      ...Object.values(paletteCopy.eggRefusals),
      ...paletteCopy.eggs.map(({ label }) => label),
      ...paletteCopy.pages.map(({ label }) => label),
      paletteCopy.announce.backgroundOn,
      paletteCopy.announce.backgroundOff,
      paletteCopy.announce.ticksOn,
      paletteCopy.announce.ticksOff,
      paletteCopy.announce.soundFailed,
      paletteCopy.announce.calmOn,
      paletteCopy.announce.calmOff,
      tierValue(1, 2),
      tierFallback(1, 2, "webgpu-init-fallback"),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(dashes);
      expect(text).not.toMatch(/\S\s+-\s+\S/);
      expect(text).not.toContain("!");
    }
  });
});
