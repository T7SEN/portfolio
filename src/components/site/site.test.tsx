import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { calmStore } from "@/lib/calm-store";

import { CalmToggle } from "./calm-toggle";
import { Logo } from "./logo";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";
import { TextLink } from "./text-link";

// The real calm store, built over a window whose OS setting the tests set.
const device = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const query = {
    matches: false,
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  };
  const stored = new Map<string, string>();
  const win = {
    matchMedia: () => query,
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => {
        stored.set(key, value);
      },
      removeItem: (key: string) => {
        stored.delete(key);
      },
    },
  };
  return {
    win,
    stored,
    setSystem(next: boolean) {
      query.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
});

vi.mock("@/lib/calm-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/calm-store")>();
  return {
    ...actual,
    calmStore: actual.createCalmStore(device.win as unknown as Window),
  };
});

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

function arrowOf(link: Element | null) {
  return link?.querySelector('[aria-hidden="true"]') ?? null;
}

describe("SkipLink", () => {
  it("REQ-A11Y-02 skip link targets the main landmark", () => {
    const link = render(<SkipLink />).querySelector("a");
    expect(link?.getAttribute("href")).toBe("#main");
    expect(link?.textContent).toBe("Skip to content");
  });
});

describe("SiteHeader", () => {
  it("REQ-NAV-02 the bar logo links home under the name T7SEN, home", () => {
    const home = render(<SiteHeader />).querySelector('a[href="/"]');
    expect(home?.getAttribute("aria-label")).toBe("T7SEN, home");
    expect(home?.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("REQ-A11Y-02 the bar links reach Work, About and Contact in order", () => {
    const links = [...render(<SiteHeader />).querySelectorAll("nav a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/work",
      "/about",
      "/contact",
    ]);
  });

  it("REQ-A11Y-04 the calm toggle is the last stop in the bar, after the links", () => {
    const header = render(<SiteHeader />);
    const stops = [...header.querySelectorAll("a, button")];

    expect(stops.map((stop) => stop.textContent)).toEqual([
      "",
      "Work",
      "About",
      "Contact",
      "Calm",
    ]);
    expect(stops.at(-1)?.closest("nav")).toBeNull();
  });
});

describe("CalmToggle", () => {
  let container: HTMLDivElement;
  let root: Root;

  function button() {
    const found = container.querySelector("button");
    if (found === null) throw new Error("The toggle is missing");
    return found;
  }

  async function click() {
    await act(async () => {
      button().click();
    });
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<CalmToggle />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    device.setSystem(false);
    calmStore.setChosen(false);
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("REQ-A11Y-04 the static HTML holds an unpressed button with a visible label", () => {
    const toggle = render(<CalmToggle />).querySelector("button");

    expect(toggle?.getAttribute("type")).toBe("button");
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    expect(toggle?.hasAttribute("aria-describedby")).toBe(false);
    expect(toggle?.textContent).toBe("Calm");
    expect(toggle?.querySelector("span")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });

  it("REQ-A11Y-04 the target is at least 44 by 44 px, with the bar links' hover and focus feedback", () => {
    const names = button().className.split(" ");
    for (const name of [
      "min-h-11",
      "min-w-11",
      "transition-colors",
      "hover:text-glow",
      "focus-visible:text-glow",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("REQ-A11Y-04 a click turns calm on for the visit and a second click turns it off", async () => {
    await click();
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(calmStore.getSnapshot().chosen).toBe(true);
    expect(device.stored.get("portfolio:calm")).toBe("on");

    await click();
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(calmStore.getSnapshot().calm).toBe(false);
    expect(device.stored.has("portfolio:calm")).toBe(false);
  });

  it("REQ-A11Y-03 while the OS asks for reduced motion the toggle shows pressed, says why and stays pressed", async () => {
    await act(async () => {
      device.setSystem(true);
    });
    const toggle = button();
    const noteId = toggle.getAttribute("aria-describedby");
    const note = noteId === null ? null : document.getElementById(noteId);

    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.disabled).toBe(false);
    expect(note?.hidden).toBe(true);
    expect(note?.textContent).toBe(
      "Your device asks for reduced motion, so calm stays on.",
    );

    await click();
    expect(button().getAttribute("aria-pressed")).toBe("true");
    expect(calmStore.getSnapshot().chosen).toBe(false);
  });

  it("REQ-A11Y-03 the explanation leaves when the OS setting does", async () => {
    await act(async () => {
      device.setSystem(true);
    });
    await act(async () => {
      device.setSystem(false);
    });

    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(button().hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("SiteFooter", () => {
  it("REQ-A11Y-01 footer links carry an arrow shown only on hover and focus", () => {
    const footer = render(<SiteFooter />);
    const links = [...footer.querySelectorAll("nav a")];
    expect(links.map((link) => link.textContent)).toEqual([
      "Work→",
      "About→",
      "Contact→",
      "v1 archive→",
    ]);
    for (const link of links) {
      expect(arrowOf(link)?.className).toContain("opacity-0");
    }
    expect(footer.textContent).toContain("T7SEN");
  });
});

describe("TextLink", () => {
  it.each([
    ["/work", "→"],
    ["#main", "→"],
    ["https://github.com", "↗"],
    ["//example.com", "↗"],
  ])(
    "REQ-A11Y-01 %s gets the arrow %s, hidden from screen readers",
    (href, glyph) => {
      const link = render(<TextLink href={href}>Text</TextLink>).querySelector(
        "a",
      );
      expect(link?.getAttribute("href")).toBe(href);
      expect(arrowOf(link)?.textContent).toBe(glyph);
      expect(arrowOf(link)?.className).not.toContain("opacity-0");
    },
  );

  it("REQ-I18N-02 the arrow mirrors on right-to-left pages", () => {
    const link = render(<TextLink href="/about">About</TextLink>).querySelector(
      "a",
    );
    expect(arrowOf(link)?.className).toContain("rtl:-scale-x-100");
  });
});

describe("Logo", () => {
  it("REQ-NAV-02 a titled mark is an image with that name", () => {
    const svg = render(<Logo variant="purple" title="T7SEN" />).querySelector(
      "svg",
    );
    expect(svg?.getAttribute("role")).toBe("img");
    expect(svg?.getAttribute("aria-label")).toBe("T7SEN");
    expect(svg?.hasAttribute("aria-hidden")).toBe(false);
  });

  it("REQ-NAV-02 every variant fills by attribute, never by class or style", () => {
    const host = render(
      <>
        <Logo variant="light" />
        <Logo variant="dark" />
        <Logo variant="purple" />
      </>,
    );
    const fills = [...host.querySelectorAll("polygon")].map((polygon) =>
      polygon.getAttribute("fill"),
    );
    expect(fills[0]).toBe("currentColor");
    expect(fills[1]).toBe("#111114");
    expect(fills[2]).toMatch(/^url\(#.+\)$/);
    expect(host.querySelector("style, [class], [style]")).toBeNull();
  });

  it("REQ-NAV-02 two purple marks on one page never share an id", () => {
    const host = render(
      <>
        <Logo variant="purple" />
        <Logo variant="purple" />
      </>,
    );
    const ids = [...host.querySelectorAll("[id]")].map((node) => node.id);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const polygon of host.querySelectorAll("polygon")) {
      const fillId = polygon.getAttribute("fill")?.slice(5, -1);
      const filterId = polygon.getAttribute("filter")?.slice(5, -1);
      expect(ids).toContain(fillId);
      expect(ids).toContain(filterId);
    }
  });
});
