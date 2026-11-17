import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studies, studyHref } from "@/content";
import { menuCopy } from "@/content/menu";
import { site } from "@/content/site";
import { calmStore } from "@/lib/calm-store";
import { overlayStore } from "@/lib/overlay-store";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import MenuDialog from "./menu-dialog";
import { MENU_ROWS } from "./menu-rows";

const route = vi.hoisted(() => ({ pathname: "/" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
}));

let host: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

/** Stands in for matchMedia: true answers a fine pointer query. */
function stubPointer(isFine: boolean) {
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: media.includes("pointer: fine") ? isFine : false,
    media,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** Radix gives focus back a task after the dialog leaves. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render() {
  await act(async () => {
    root.render(<MenuDialog />);
  });
}

async function openMenu() {
  opener.focus();
  await act(async () => {
    overlayStore.open("menu");
  });
}

function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function rows() {
  return [
    ...document.querySelectorAll<HTMLAnchorElement>('[data-part="menu-row"]'),
  ];
}

function nameOf(element: Element | null | undefined) {
  const labelledBy = element?.getAttribute("aria-labelledby");
  if (labelledBy) return document.getElementById(labelledBy)?.textContent;
  return element?.getAttribute("aria-label") ?? element?.textContent;
}

/** The words a row says, its aria-hidden number and arrow left out. */
function spoken(element: Element) {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => {
    node.remove();
  });
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubPointer(true);
  opener = document.createElement("button");
  opener.textContent = "Menu";
  host = document.createElement("div");
  document.body.append(opener, host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    overlayStore.close();
    root.unmount();
  });
  overlayStore.takeReturnFocus();
  route.pathname = "/";
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("MenuDialog", () => {
  it("REQ-NAV-03 shows nothing until the overlay store opens the menu", async () => {
    await render();
    expect(dialog()).toBeNull();

    await act(async () => {
      overlayStore.open("palette");
    });
    expect(dialog()).toBeNull();
  });

  it("REQ-NAV-03 REQ-A11Y-01 is a dialog named Menu, its project list a nav named Work, the preview an aside named for its project", async () => {
    await render();
    await openMenu();

    expect(nameOf(dialog())).toBe("Menu");
    const work = dialog()?.querySelector('nav[aria-label="Work"]');
    expect(work?.querySelectorAll("ol > li")).toHaveLength(studies.length);
    const preview = dialog()?.querySelector("aside");
    expect(preview?.getAttribute("aria-label")).toBe("Preview: Making-of");
    // The page under it is out of reach while it is open.
    expect(
      host.closest("[aria-hidden]") ?? opener.closest("[aria-hidden]"),
    ).not.toBeNull();
  });

  it("REQ-NAV-03 REQ-CNT-07 lists one row per study in study order, full studies large and short ones muted, with their tags", async () => {
    await render();
    await openMenu();

    expect(rows().map((row) => row.getAttribute("href"))).toEqual(
      studies.map((study) => studyHref(study.slug)),
    );
    expect(rows().map(spoken)).toEqual([
      "Making-of, WebGPU Full study",
      "Coup Online, Real-time Full study",
      "ArcheLab, Product Full study",
      "t7sen-url, Short study",
      "SystemSeven, In progress",
    ]);
    expect(
      rows().map(
        (row) => row.querySelector('[aria-hidden="true"]')?.textContent,
      ),
    ).toEqual(["01", "02", "03", "04", "05"]);
    const titles = rows().map((row) => row.children[1]);
    expect(titles[0]?.className).toContain("text-[clamp(");
    expect(titles[3]?.className).toContain("text-muted");
    expect(titles[3]?.className).not.toContain("text-[clamp(");
    // SystemSeven's In progress is violet.
    expect(rows()[4]?.lastElementChild?.className).toContain("text-violet");
  });

  it("REQ-NAV-03 the row in hover or focus turns glow with an arrow, and the preview follows it", async () => {
    await render();
    await openMenu();
    const [first, second, , fourth] = rows();

    expect(first?.dataset.active).toBe("true");
    await act(async () => {
      second?.focus();
    });
    expect(second?.dataset.active).toBe("true");
    expect(first?.dataset.active).toBe("false");
    expect(second?.children[1]?.className).toContain(
      "group-data-[active=true]:text-glow",
    );
    const preview = () => dialog()?.querySelector("aside");
    expect(preview()?.getAttribute("aria-label")).toBe("Preview: Coup Online");
    expect(preview()?.textContent).toContain(MENU_ROWS[1]?.line);
    const read = preview()?.querySelector("a");
    expect(read?.getAttribute("href")).toBe("/work/coup-online");
    expect(read?.getAttribute("aria-label")).toBe(
      "Read the study, Coup Online",
    );
    const shown = [...(preview()?.querySelectorAll("img") ?? [])].find(
      (image) => image.className.includes("opacity-100"),
    );
    expect(shown?.getAttribute("src")).toBe("/still/work-coup-online.webp");
    expect(shown?.getAttribute("alt")).toBe("");

    await act(async () => {
      fourth?.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    });
    expect(preview()?.getAttribute("aria-label")).toBe("Preview: t7sen-url");
    // A short study has no shape: its frame shows its badge and stack only.
    expect(
      [...(preview()?.querySelectorAll("img") ?? [])].every((image) =>
        image.className.includes("opacity-0"),
      ),
    ).toBe(true);
    expect(preview()?.textContent).toContain("Short-form");
    // Shown at every width: below 1024 px after the links, as a compact card.
    expect(preview()?.className).not.toContain("hidden");
    expect(preview()?.className).toContain("max-lg:grid");
  });

  it("REQ-NAV-03 the link row holds Home first, then About, Contact, All work no 3D, v1 archive and GitHub, the last leaving the site", async () => {
    await render();
    await openMenu();
    const pages = dialog()?.querySelector('nav[aria-label="Pages"]');
    const links = [...(pages?.querySelectorAll("a") ?? [])];

    expect(links.map((link) => link.textContent)).toEqual([
      "Home",
      "About",
      "Contact",
      "All work, no 3D",
      "v1 archive",
      "GitHub",
    ]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/",
      "/about",
      "/contact",
      "/work",
      "/v1",
      site.github.href,
    ]);
    expect(links.at(-1)?.querySelector("svg path")?.getAttribute("d")).toBe(
      "M7 17 17 7M8 7h9v9",
    );
  });

  it.each([
    ["/work/coup-online", "row"],
    ["/work", "page"],
  ] as const)(
    "REQ-A11Y-02 on %s the current page's link carries aria-current",
    async (pathname, kind) => {
      route.pathname = pathname;
      await render();
      await openMenu();
      const current = [
        ...(dialog()?.querySelectorAll('[aria-current="page"]') ?? []),
      ];
      expect(current).toHaveLength(1);
      expect(current[0]?.getAttribute("href")).toBe(pathname);
      if (kind === "row") {
        // The menu opens on the study on screen.
        expect(document.activeElement).toBe(current[0]);
        expect(
          dialog()?.querySelector("aside")?.getAttribute("aria-label"),
        ).toBe("Preview: Coup Online");
      }
    },
  );

  it("REQ-NAV-03 REQ-A11Y-02 focus moves to the first row on open and stays inside the dialog", async () => {
    await render();
    await openMenu();
    expect(document.activeElement).toBe(rows()[0]);

    // Focus that lands outside is taken back in.
    await act(async () => {
      opener.focus();
    });
    expect(dialog()?.contains(document.activeElement)).toBe(true);
  });

  it("REQ-NAV-03 Escape closes the menu and focus goes back to the control that opened it", async () => {
    await render();
    await openMenu();

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(overlayStore.getSnapshot()).toBeNull();
    expect(dialog()).toBeNull();
    await settle();
    expect(document.activeElement).toBe(opener);
  });

  it("REQ-NAV-03 Close ends the menu and gives focus back", async () => {
    await render();
    await openMenu();
    const close = dialog()?.querySelector<HTMLButtonElement>(
      '[data-part="menu-close"]',
    );
    expect(close?.textContent).toBe("Close");

    await act(async () => {
      close?.click();
    });
    expect(overlayStore.getSnapshot()).toBeNull();
    await settle();
    expect(document.activeElement).toBe(opener);
  });

  it("REQ-NAV-03 REQ-NAV-04 the menu's Ctrl K opens the palette in its place, which keeps the place to give focus back to", async () => {
    await render();
    await openMenu();
    const palette = dialog()?.querySelector<HTMLButtonElement>(
      '[data-part="palette-button"]',
    );

    await act(async () => {
      palette?.click();
    });
    expect(overlayStore.getSnapshot()).toBe("palette");
    expect(dialog()).toBeNull();
    await settle();
    expect(document.activeElement).not.toBe(opener);

    await act(async () => {
      overlayStore.close();
    });
    expect(overlayStore.takeReturnFocus()).toBe(opener);
  });

  it("REQ-NAV-03 a link chosen in the menu ends it; a link opened in a new tab leaves it open", async () => {
    await render();
    await openMenu();
    const about = dialog()?.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Pages"] a[href="/about"]',
    );
    // No router here: the parent stops the page change the click asks for.
    host.ownerDocument.addEventListener(
      "click",
      (event) => event.preventDefault(),
      { capture: true },
    );

    await act(async () => {
      about?.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          ctrlKey: true,
        }),
      );
    });
    expect(overlayStore.getSnapshot()).toBe("menu");

    await act(async () => {
      about?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    expect(overlayStore.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-03 a move to another page ends the menu", async () => {
    await render();
    await openMenu();

    route.pathname = "/about";
    await render();
    expect(overlayStore.getSnapshot()).toBeNull();
  });

  it("REQ-NAV-03 REQ-A11Y-04 holds the Calm mode switch after the page links, and it turns calm on and off", async () => {
    await render();
    await openMenu();
    const calm = dialog()?.querySelector<HTMLButtonElement>('[role="switch"]');
    expect(calm?.textContent).toContain("Calm mode");
    const pages = dialog()?.querySelector(
      `nav[aria-label="${menuCopy.pagesName}"]`,
    );
    expect(
      pages && calm
        ? pages.compareDocumentPosition(calm) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0,
    ).toBeTruthy();

    await act(async () => calm?.click());
    expect(calmStore.getSnapshot().chosen).toBe(true);
    expect(calm?.getAttribute("aria-checked")).toBe("true");
    await act(async () => calm?.click());
    expect(calmStore.getSnapshot().chosen).toBe(false);
  });

  it("REQ-NAV-03 shows Esc to close and Ctrl K for commands with a mouse, and neither on touch", async () => {
    await render();
    await openMenu();
    expect(dialog()?.textContent).toContain(menuCopy.closeHint);
    expect(dialog()?.textContent).toContain("Ctrl K for commands");

    await act(async () => {
      overlayStore.close();
    });
    stubPointer(false);
    await openMenu();
    expect(dialog()?.textContent).not.toContain(menuCopy.closeHint);
    expect(dialog()?.textContent).not.toContain("for commands");
  });

  it("REQ-NAV-03 repeats the bar: the home link, Sound, Ctrl K and Close in a nav named Site controls", async () => {
    await render();
    await openMenu();
    const bar = dialog()?.querySelector('nav[aria-label="Site controls"]');
    const names = [...(bar?.querySelectorAll("button") ?? [])].map(
      (button) => button.getAttribute("aria-label") ?? button.textContent,
    );

    expect(
      dialog()?.querySelector('a[href="/"]')?.getAttribute("aria-label"),
    ).toBe("T7SEN, home");
    expect(names).toEqual([
      "Sound off. Sound settings",
      "Open the command palette, Ctrl K",
      "Close",
    ]);
    // The menu covers the field, and Lenis leaves its wheel alone.
    expect(dialog()?.hasAttribute("data-lenis-prevent")).toBe(true);
  });

  it("REQ-I18N-01 uses no physical left or right utility", async () => {
    await render();
    await openMenu();
    const classes = [...(dialog()?.querySelectorAll("[class]") ?? []), dialog()]
      .map((node) => node?.getAttribute("class") ?? "")
      .join(" ");
    expect(findPhysicalClasses(classes)).toEqual([]);
  });
});
