import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Logo } from "./logo";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";
import { TextLink } from "./text-link";

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
