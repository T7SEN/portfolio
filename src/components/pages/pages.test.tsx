import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AboutPage from "@/app/about/page";
import ContactPage from "@/app/contact/page";
import WorkPage from "@/app/work/page";
import { StudyTable } from "@/components/study/study-table";
import { studies, studyHref, studyNumber } from "@/content";
import { about } from "@/content/about";
import { isMarker } from "@/content/markers";
import { pages } from "@/content/pages";
import { services } from "@/content/services";
import { colors, type ColorName } from "@/tokens/colors";
import { contrastRatio } from "@/tokens/contrast";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { COPIED_MS, CopyAddress } from "./copy-address";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

/** The text assistive technology reads: aria-hidden parts left out. */
function spokenText(element: Element | null | undefined) {
  if (element === null || element === undefined) return null;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => {
    node.remove();
  });
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

function classesOf(element: Element | null | undefined) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

function allClasses(host: Element) {
  return [host, ...host.querySelectorAll("[class]")]
    .map((node) => node.getAttribute("class") ?? "")
    .join(" ");
}

const { headers, v1 } = pages.work.table;
const { address } = pages.contact;

describe("StudyTable", () => {
  function table() {
    return render(<StudyTable labelledBy="page-heading" />);
  }

  function bodyRows(host: Element) {
    return [...host.querySelectorAll("tbody tr")];
  }

  it("REQ-CNT-07 one row per study in study order, then the v1 archive", () => {
    const rows = bodyRows(table());

    expect(rows.map((row) => row.getAttribute("data-study"))).toEqual([
      ...studies.map((study) => study.slug),
      "v1",
    ]);
    expect(
      rows.map((row) => row.querySelector('th[scope="row"]')?.textContent),
    ).toEqual([...studies.map((study) => study.title), v1.title]);
    expect(rows.map((row) => row.querySelector("td")?.textContent)).toEqual([
      ...studies.map((study) => studyNumber(study.slug)),
      v1.number,
    ]);
  });

  it("REQ-CNT-02 each row gives what it is, what it is built with and its study link, from the content", () => {
    const rows = bodyRows(table());
    const expected = [
      ...studies.map((study) => ({
        what: study.listing.what,
        builtWith: study.listing.builtWith,
        label: study.listing.studyLabel,
        href: studyHref(study.slug),
      })),
      { what: v1.what, builtWith: v1.builtWith, ...v1.link },
    ];

    rows.forEach((row, index) => {
      const cells = [...row.querySelectorAll("td")];
      const link = cells[3]?.querySelector("a");
      const want = expected[index];

      expect(cells).toHaveLength(4);
      expect(spokenText(cells[1])).toBe(want?.what);
      expect(spokenText(cells[2])).toBe(want?.builtWith);
      expect(link?.getAttribute("href")).toBe(want?.href);
      expect(link?.textContent).toContain(want?.label);
    });
  });

  it("REQ-CNT-02 the header row names the five columns in mono capitals over a hairline rule", () => {
    const host = table();
    const headerRow = host.querySelector("thead tr");

    expect(
      [...host.querySelectorAll('th[scope="col"]')].map(
        (header) => header.textContent,
      ),
    ).toEqual([
      headers.number,
      headers.project,
      headers.what,
      headers.builtWith,
      headers.study,
    ]);
    expect(classesOf(headerRow)).toEqual(
      expect.arrayContaining([
        "font-mono",
        "uppercase",
        "text-muted",
        "border-b",
        "border-edge/40",
      ]),
    );
    expect(classesOf(host.querySelector("table"))).toEqual(
      expect.arrayContaining(["border-t", "border-edge/40"]),
    );
    for (const row of bodyRows(host)) {
      expect(classesOf(row)).toEqual(
        expect.arrayContaining(["border-b", "border-edge/40"]),
      );
    }
  });

  it("REQ-CNT-02 the table is named by the page heading and every part keeps its role when the rows stack", () => {
    const host = table();
    const rows = [...host.querySelectorAll("tr")];

    expect(host.querySelector("table")?.getAttribute("role")).toBe("table");
    expect(host.querySelector("table")?.getAttribute("aria-labelledby")).toBe(
      "page-heading",
    );
    for (const group of host.querySelectorAll("thead, tbody")) {
      expect(group.getAttribute("role")).toBe("rowgroup");
    }
    expect(rows.every((row) => row.getAttribute("role") === "row")).toBe(true);
    for (const header of host.querySelectorAll('th[scope="col"]')) {
      expect(header.getAttribute("role")).toBe("columnheader");
    }
    for (const header of host.querySelectorAll('th[scope="row"]')) {
      expect(header.getAttribute("role")).toBe("rowheader");
    }
    for (const cell of host.querySelectorAll("td")) {
      expect(cell.getAttribute("role")).toBe("cell");
    }
  });

  it("REQ-CNT-02 every study link has its own name: the column's word, then the project", () => {
    const links = bodyRows(table()).map((row) => row.querySelector("a"));
    const names = links.map((link) => link?.getAttribute("aria-label"));

    // A label, so the name is exact: no hidden span for Chromium to set
    // apart with a space before the comma. It holds the visible words.
    for (const link of links) {
      expect(link?.querySelector(".sr-only")).toBeNull();
      expect(
        link?.getAttribute("aria-label")?.startsWith(spokenText(link) ?? ""),
      ).toBe(true);
    }
    expect(names).toEqual([
      ...studies.map((study) => `${study.listing.studyLabel}, ${study.title}`),
      `${v1.link.label}, ${v1.title}`,
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("REQ-I18N-01 on phones each row stacks under its number with no sideways scroll, and the five columns start at 1024 px", () => {
    const host = table();
    const thead = host.querySelector("thead");

    // Out of sight on phones but still read, so the cells keep their headers.
    expect(classesOf(thead)).toEqual(
      expect.arrayContaining(["sr-only", "lg:not-sr-only"]),
    );
    for (const row of bodyRows(host)) {
      const classes = classesOf(row);
      expect(classes).toContain("grid-cols-[2.75rem_minmax(0,1fr)]");
      expect(classes).toContain(
        "lg:grid-cols-[4rem_minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1.4fr)_11.25rem]",
      );

      const cells = [...row.querySelectorAll("td, th")];
      // The number sits beside the title; the rest stack in the second track.
      expect(classesOf(cells[0])).toContain("col-start-1");
      for (const cell of cells.slice(1)) {
        expect(classesOf(cell)).toContain("col-start-2");
      }
      for (const cell of cells.slice(1, 4)) {
        expect(classesOf(cell)).toContain("wrap-break-word");
      }

      // Each cell's header, shown above its words while the header row is
      // out of sight, hidden from assistive technology and from 1024 px.
      const labels = [...row.querySelectorAll('span[aria-hidden="true"]')]
        .filter((span) => classesOf(span).includes("lg:hidden"))
        .map((span) => span.textContent);
      expect(labels).toEqual([headers.what, headers.builtWith]);
    }
  });

  it("REQ-I18N-01 the table uses no physical left or right utility and its arrows mirror", () => {
    const host = table();
    const arrows = bodyRows(host).map((row) =>
      row.querySelector('a [aria-hidden="true"]'),
    );

    expect(findPhysicalClasses(allClasses(host))).toEqual([]);
    for (const arrow of arrows) {
      expect(arrow?.textContent).toBe("→");
      expect(classesOf(arrow)).toContain("rtl:-scale-x-100");
    }
  });

  it("REQ-A11Y-06 study links are in the text colour with a glow arrow; the study in progress keeps the glow and says so", () => {
    for (const row of bodyRows(table())) {
      const link = row.querySelector("a");
      const arrow = link?.querySelector('[aria-hidden="true"]');
      const study = studies.find(
        (entry) => entry.slug === row.getAttribute("data-study"),
      );
      const inProgress = study?.kind === "short" && study.inProgress;

      expect(classesOf(link)).toEqual(
        expect.arrayContaining(["min-h-11", "hover:text-paper"]),
      );
      // The underline on the words alone, never under the arrow.
      expect(classesOf(link)).not.toContain("underline");
      const words = link?.querySelector('[data-part="link-words"]') ?? null;
      expect(classesOf(words)).toContain("underline");
      expect(words?.textContent).toBe(
        row.querySelector("a")?.textContent?.replace("→", ""),
      );
      expect(classesOf(arrow ?? null)).not.toContain("underline");
      if (inProgress) {
        expect(link?.getAttribute("data-state")).toBe("in-progress");
        expect(classesOf(link)).toContain("text-glow");
        expect(link?.textContent).toContain(study.listing.studyLabel);
      } else {
        expect(link?.hasAttribute("data-state")).toBe(false);
        expect(classesOf(link)).toContain("text-text");
        expect(classesOf(arrow)).toContain("text-glow");
      }
    }
  });
});

describe("/work", () => {
  it("REQ-CNT-02 the label, the h1 that names the table, the intro and the closing panel with its action", () => {
    const host = render(<WorkPage />);
    const heading = host.querySelector("h1");
    const label = heading?.previousElementSibling;
    const action = host.querySelector('a[href="/contact"]');

    expect(spokenText(label)).toBe(pages.work.label.join(" "));
    expect(label?.textContent).toBe(pages.work.label.join(" · "));
    expect(heading?.textContent).toBe(pages.work.heading);
    expect(classesOf(heading)).toEqual(
      expect.arrayContaining(["font-display", "text-title", "font-bold"]),
    );
    expect(host.querySelector("table")?.getAttribute("aria-labelledby")).toBe(
      heading?.id,
    );
    expect(host.textContent).toContain(pages.work.intro);
    expect(host.textContent).toContain(pages.work.closing.text);
    expect(spokenText(action)).toBe(pages.work.closing.action.label);
    expect(classesOf(action)).toEqual(
      expect.arrayContaining(["bg-glow", "text-void", "rounded-full"]),
    );
  });

  it("REQ-CNT-02 /work draws no canvas and needs no client island of its own", () => {
    const host = render(<WorkPage />);
    expect(host.querySelector("canvas, button, [data-stage]")).toBeNull();
  });
});

describe("/about", () => {
  function page() {
    return render(<AboutPage />);
  }

  it("REQ-CNT-08 the About heading and both paragraphs, a message pill and the CV on request", () => {
    const host = page();
    const paragraphs = [...host.querySelectorAll("p")].map(
      (node) => node.textContent,
    );
    const ask = [...host.querySelectorAll("a")].find(
      (link) => spokenText(link) === about.cv.ask.label,
    );
    const message = [...host.querySelectorAll("a")].find(
      (link) => spokenText(link) === pages.about.action.label,
    );

    expect(host.querySelector("h1")?.textContent).toBe(about.heading);
    expect(paragraphs).toEqual(expect.arrayContaining([...about.paragraphs]));
    expect(ask?.getAttribute("href")).toBe("/contact");
    expect(message?.getAttribute("href")).toBe(pages.about.action.href);
    expect(classesOf(message)).toContain("bg-glow");
  });

  it("REQ-CNT-08 Elsewhere offers the CV by message only, and no link points at a file", () => {
    const host = page();
    const anchors = [...host.querySelectorAll("a")];
    const cvLink = anchors.find(
      (link) => spokenText(link) === about.cv.link.label,
    );

    expect(host.textContent).toContain(about.cv.text);
    expect(cvLink?.getAttribute("href")).toBe("/contact");
    for (const anchor of anchors) {
      expect(anchor.hasAttribute("download")).toBe(false);
      expect(anchor.getAttribute("href") ?? "").not.toMatch(
        /\.(?:pdf|docx?)(?:[?#]|$)/i,
      );
    }
  });

  it("REQ-CNT-07 Elsewhere lists t7sen-url's live site, links.t7sen.com, with the arrow out of the site", () => {
    const host = page();
    const section = host.querySelector(
      'section[aria-labelledby="elsewhere-heading"]',
    );
    const site = [...(section?.querySelectorAll("a") ?? [])].find(
      (link) => link.getAttribute("href") === "https://links.t7sen.com",
    );

    expect(spokenText(site)).toBe("links.t7sen.com");
    expect(
      site?.querySelector('[aria-hidden="true"]')?.textContent?.trim(),
    ).toBe("↗");
    expect(about.elsewhere.slice(0, 2)).toEqual([...about.links]);
  });

  it("REQ-CNT-05 an address not supplied yet shows as its label and marker, never as a link", () => {
    const host = page();
    const hrefs = [...host.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    );

    expect(about.links.some((link) => isMarker(link.href))).toBe(true);
    for (const link of about.links) {
      if (isMarker(link.href)) {
        expect(hrefs).not.toContain(link.href);
        expect(host.textContent).toContain(`${link.label} ${link.href}`);
      } else {
        expect(hrefs).toContain(link.href);
      }
    }
  });

  it("REQ-CNT-11 What I build shows both headline offers as framed cards with their descriptions, then the also line", () => {
    const host = page();
    const section = host.querySelector(
      'section[aria-labelledby="offers-heading"]',
    );
    const cards = [...(section?.querySelectorAll("li") ?? [])];

    expect(section?.querySelector("h2")?.textContent).toBe(
      pages.about.sections.offers,
    );
    expect(cards).toHaveLength(services.offers.length);
    cards.forEach((card, index) => {
      const offer = services.offers[index];
      const label = card.querySelector("p");
      expect(card.querySelector("h3")?.textContent).toBe(offer?.title);
      expect(card.textContent).toContain(offer?.description);
      expect(label?.textContent).toBe(pages.about.offerLabel);
      expect(classesOf(label)).toContain("text-glow");
      expect(classesOf(card.firstElementChild)).toEqual(
        expect.arrayContaining(["bg-surface", "rounded-2xl"]),
      );
    });
    expect(section?.textContent).toContain(services.also);
  });

  it("REQ-CNT-08 Tools I use lists each group under its mono label, the tools as a list with the dots hidden", () => {
    const section = page().querySelector(
      'section[aria-labelledby="skills-heading"]',
    );
    const terms = [...(section?.querySelectorAll("dt") ?? [])];

    expect(section?.querySelector("h2")?.textContent).toBe(
      pages.about.sections.skills,
    );
    expect(terms.map((term) => term.textContent)).toEqual(
      about.skills.map((group) => group.label),
    );
    terms.forEach((term, index) => {
      const items = [
        ...(term.nextElementSibling?.querySelectorAll("li") ?? []),
      ].map((item) => spokenText(item));
      expect(classesOf(term)).toEqual(
        expect.arrayContaining(["font-mono", "uppercase", "text-muted"]),
      );
      expect(items).toEqual([...(about.skills[index]?.items ?? [])]);
    });
  });

  it("REQ-A11Y-05 the mark panel is decoration: hidden from assistive technology, the purple mark over a dot ring", () => {
    const panel = page().querySelector('[data-testid="mark-panel"]');
    const polygon = panel?.querySelector("polygon");

    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    expect(polygon?.getAttribute("fill")).toMatch(/^url\(#.+\)$/);
    expect(allClasses(panel ?? document.createElement("div"))).toContain(
      "[mask-image:radial-gradient(",
    );
  });

  it("REQ-SND-03 the waveform panel waits for Sound at P5", () => {
    expect(page().textContent).not.toMatch(/waveform|sound/i);
  });
});

describe("/contact", () => {
  function page() {
    return render(<ContactPage />);
  }

  it("REQ-CNT-01 the heading, the intro, the address as a mailto link and the Hiring panel are in the static HTML", () => {
    const host = page();
    const mail = host.querySelector(`a[href="${address.href}"]`);
    const hiring = [...host.querySelectorAll("h2")].find(
      (heading) => heading.textContent === pages.contact.hiring.title,
    );

    expect(host.querySelector("h1")?.textContent).toBe(pages.contact.heading);
    expect(host.textContent).toContain(pages.contact.intro);
    expect(spokenText(mail)).toBe(address.email);
    expect(hiring?.nextElementSibling?.textContent).toBe(
      pages.contact.hiring.text,
    );
  });

  it("REQ-CNT-05 the form's place holds its marker in a dashed box, with no fields that could not send", () => {
    const host = page();
    // The innermost element holding the marker: the box, not its wrapper.
    const box = [...host.querySelectorAll("div")]
      .reverse()
      .find((node) => node.textContent === pages.contact.form);

    expect(isMarker(pages.contact.form)).toBe(true);
    expect(classesOf(box)).toEqual(
      expect.arrayContaining(["border-dashed", "bg-void"]),
    );
    expect(host.querySelector("form, input, textarea, select")).toBeNull();
  });

  it("REQ-A11Y-02 the static HTML holds no Copy button, so no control waits for script", () => {
    const host = page();
    expect(host.querySelector("button")).toBeNull();
    expect(host.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("REQ-A11Y-05 the dot floor is decoration behind the page's words", () => {
    const floor = page().querySelector('[data-testid="dot-floor"]');
    expect(floor?.getAttribute("aria-hidden")).toBe("true");
    expect(classesOf(floor)).toEqual(
      expect.arrayContaining(["absolute", "-z-10", "pointer-events-none"]),
    );
    expect(classesOf(floor?.parentElement)).toEqual(
      expect.arrayContaining(["relative", "isolate"]),
    );
  });
});

describe("CopyAddress", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = vi.fn<(text: string) => Promise<void>>();

  function setClipboard(value: unknown) {
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value,
    });
  }

  async function mount() {
    await act(async () => {
      root.render(
        <CopyAddress
          email={address.email}
          href={address.href}
          copy={address.copy}
        />,
      );
    });
  }

  function button() {
    const found = container.querySelector("button");
    if (found === null) throw new Error("The Copy button is missing");
    return found;
  }

  function status() {
    return container.querySelector('[role="status"]');
  }

  async function press() {
    await act(async () => {
      button().click();
      // Lets the clipboard's promise settle inside act.
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    });
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    writeText.mockReset();
    setClipboard({ writeText });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    Reflect.deleteProperty(window.navigator, "clipboard");
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("REQ-A11Y-02 once running, Copy is a real button whose name starts with its visible word", async () => {
    await mount();

    expect(button().getAttribute("type")).toBe("button");
    expect(button().textContent).toBe(address.copy.label);
    expect(button().getAttribute("aria-label")).toBe(address.copy.name);
    expect(address.copy.name.startsWith(address.copy.label)).toBe(true);
    expect(button().getAttribute("data-state")).toBe("idle");
    expect(classesOf(button())).toEqual(
      expect.arrayContaining(["min-h-11", "min-w-11", "rounded-full"]),
    );
    // There before any press, so the first result is announced.
    expect(status()?.textContent).toBe("");
  });

  it("REQ-A11Y-01 a copy writes the address and announces Address copied. politely, then the line clears", async () => {
    writeText.mockResolvedValue(undefined);
    await mount();
    await press();

    expect(writeText).toHaveBeenCalledWith(address.email);
    expect(button().getAttribute("data-state")).toBe("copied");
    expect(status()?.textContent).toBe(address.copy.copied);
    expect(classesOf(status())).toContain("text-glow");

    await act(async () => {
      vi.advanceTimersByTime(COPIED_MS);
    });
    expect(button().getAttribute("data-state")).toBe("idle");
    expect(status()?.textContent).toBe("");
  });

  it("REQ-A11Y-01 a second copy is announced again, even with the same words", async () => {
    writeText.mockResolvedValue(undefined);
    await mount();
    await press();
    const first = status()?.firstElementChild;
    await press();

    expect(status()?.textContent).toBe(address.copy.copied);
    expect(status()?.firstElementChild).not.toBe(first);
  });

  it("REQ-A11Y-01 a refused copy says so and how to copy by hand, and stays until the next press", async () => {
    writeText.mockRejectedValue(new Error("Write permission denied."));
    await mount();
    await press();

    expect(button().getAttribute("data-state")).toBe("failed");
    expect(status()?.textContent).toBe(address.copy.failed);
    expect(classesOf(status())).toContain("text-text");

    await act(async () => {
      vi.advanceTimersByTime(COPIED_MS * 2);
    });
    expect(status()?.textContent).toBe(address.copy.failed);
  });

  it("REQ-A11Y-01 with no clipboard at all, as outside a secure context, the button fails the same way", async () => {
    setClipboard(undefined);
    await mount();
    await press();

    expect(button().getAttribute("data-state")).toBe("failed");
    expect(status()?.textContent).toBe(address.copy.failed);
  });

  it("REQ-A11Y-02 the address stays a link beside the button", async () => {
    await mount();
    const mail = container.querySelector(`a[href="${address.href}"]`);
    expect(spokenText(mail)).toBe(address.email);
    expect(mail?.parentElement).toBe(button().parentElement);
  });
});

describe("Colour and direction", () => {
  // Every text and background pairing these pages draw, with the ratio
  // WCAG 2.2 asks of it.
  const PAIRS: ReadonlyArray<[ColorName, ColorName, number, string]> = [
    ["text", "void", 4.5, "titles, table cells, the address"],
    ["muted", "void", 4.5, "labels, intros, the table's second columns"],
    ["glow", "void", 4.5, "arrows, In progress, Address copied."],
    ["paper", "void", 4.5, "link hover"],
    ["void", "glow", 4.5, "the primary pill"],
    ["void", "paper", 4.5, "the primary pill on hover"],
    ["text", "surface", 4.5, "panel words, offer titles"],
    ["muted", "surface", 4.5, "offer descriptions, the Hiring text"],
    ["glow", "surface", 4.5, "the Headline offer label"],
  ];

  it.each(PAIRS)(
    "REQ-A11Y-06 %s on %s meets %d to 1 (%s)",
    (foreground, background, needs) => {
      expect(
        contrastRatio(colors[foreground], colors[background]),
      ).toBeGreaterThanOrEqual(needs);
    },
  );

  async function everything() {
    const host = render(
      <>
        <WorkPage />
        <AboutPage />
        <ContactPage />
      </>,
    );
    // The Copy button only exists once script runs.
    const island = document.createElement("div");
    const root = createRoot(island);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await act(async () => {
      root.render(
        <CopyAddress
          email={address.email}
          href={address.href}
          copy={address.copy}
        />,
      );
    });
    host.append(island.cloneNode(true));
    await act(async () => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    return host;
  }

  it("REQ-A11Y-06 colours come only from the tokens", async () => {
    const host = await everything();
    const classes = allClasses(host);
    const tokens = new Set<string>(Object.keys(colors));
    const used = classes
      .split(/\s+/)
      .map((name) => name.slice(name.lastIndexOf(":") + 1))
      .flatMap((name) => {
        const match =
          /^-?(?:bg|text|border|decoration)-([a-z]+(?:-[a-z]+)*)(?:\/\d+)?$/.exec(
            name,
          );
        return match?.[1] === undefined ? [] : [match[1]];
      });
    const notColours = new Set([
      "xs",
      "sm",
      "base",
      "xl",
      "title",
      "lead",
      "heading",
      "label",
      "start",
      "center",
      "dashed",
      "t",
      "b",
    ]);
    const variables = [...classes.matchAll(/var\(--color-([a-z-]+)\)/g)].map(
      (match) => match[1],
    );

    expect(used.length).toBeGreaterThan(0);
    for (const name of used.filter((value) => !notColours.has(value))) {
      expect(tokens.has(name), name).toBe(true);
    }
    expect(variables.length).toBeGreaterThan(0);
    for (const name of variables) {
      expect(tokens.has(name ?? ""), name).toBe(true);
    }
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("REQ-I18N-01 the three pages and the Copy button use no physical left or right utility", async () => {
    expect(findPhysicalClasses(allClasses(await everything()))).toEqual([]);
  });
});
