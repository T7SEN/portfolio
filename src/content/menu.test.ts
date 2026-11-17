import { describe, expect, it } from "vitest";

import { tierChangeHint } from "./hero";
import { studies } from "./index";
import { menuCopy } from "./menu";
import { paletteButtonName, paletteInvite, site } from "./site";

describe("menu copy", () => {
  it("REQ-NAV-03 the label over the list counts the studies in the index", () => {
    expect(menuCopy.workLabel(studies.length)).toEqual(["Work", "5 projects"]);
  });

  it("REQ-NAV-03 the link row is Home, About, Contact, All work no 3D, v1 archive and GitHub, each a page of this site or a full address", () => {
    expect(menuCopy.pages.map(({ label }) => label)).toEqual([
      "Home",
      "About",
      "Contact",
      "All work, no 3D",
      "v1 archive",
      "GitHub",
    ]);
    expect(menuCopy.pages.at(-1)).toEqual(site.github);
    for (const { href } of menuCopy.pages) {
      expect(href).toMatch(/^(?:\/[a-z0-9]*|https:\/\/)/);
    }
  });

  it("REQ-NAV-03 a shorter row title is only ever a short form of the study's own", () => {
    for (const [slug, title] of Object.entries(menuCopy.rowTitles)) {
      const study = studies.find((each) => each.slug === slug);
      expect(study?.title.startsWith(title)).toBe(true);
    }
  });

  it("REQ-NAV-04 the palette's keys follow the keyboard: Ctrl K, or Command K on Apple; touch is pointed at the search button", () => {
    expect(paletteButtonName("Ctrl K")).toBe(
      "Open the command palette, Ctrl K",
    );
    expect(paletteButtonName("⌘ K")).toBe("Open the command palette, ⌘ K");
    expect(paletteInvite("Ctrl K")).toBe("Press Ctrl K for everything");
    expect(paletteInvite(null)).toBe("Search for everything");
    expect(menuCopy.commandsHint("Ctrl K")).toBe("Ctrl K for commands");
    expect(tierChangeHint("Ctrl K")).toBe("change in Ctrl K");
    expect(tierChangeHint(null)).toBe("change in search");
  });

  it("REQ-HYG-06 no dash as punctuation and no exclamation mark", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    const texts = [
      menuCopy.name,
      menuCopy.listName,
      menuCopy.readStudy,
      menuCopy.pagesName,
      menuCopy.closeHint,
      menuCopy.previewName("Coup Online"),
      menuCopy.commandsHint("Ctrl K"),
      ...menuCopy.pages.map(({ label }) => label),
      ...Object.values(menuCopy.rowTitles),
      site.controls.menu,
      site.controls.close,
      paletteInvite("Ctrl K"),
      paletteInvite(null),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(dashes);
      expect(text).not.toMatch(/\S\s+-\s+\S/);
      expect(text).not.toContain("!");
    }
  });
});
