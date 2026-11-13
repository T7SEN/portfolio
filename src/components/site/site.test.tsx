import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyright, site } from "@/content/site";
import { calmStore } from "@/lib/calm-store";
import { colors, type ColorName } from "@/tokens/colors";
import { contrastRatio } from "@/tokens/contrast";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { Badge } from "./badge";
import { BoxedLink } from "./boxed-link";
import { CalmToggle, type CalmToggleVariant } from "./calm-toggle";
import { Chip } from "./chip";
import { DashedBox } from "./dashed-box";
import { Label } from "./label";
import { Logo } from "./logo";
import { Panel } from "./panel";
import { PillButton, PillLink } from "./pill";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SkipLink } from "./skip-link";
import { TextLink } from "./text-link";
import { Wordmark } from "./wordmark";

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

/** A link's words: the box that carries its underline. */
function wordsOf(link: Element | null) {
  return link?.querySelector('[data-part="link-words"]') ?? null;
}

/** The text assistive technology reads: aria-hidden parts left out. */
function spokenText(element: Element | null) {
  if (element === null) return null;
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((node) => {
    node.remove();
  });
  return (copy.textContent ?? "").replace(/\s+/g, " ").trim();
}

function classesOf(element: Element | null) {
  return (element?.getAttribute("class") ?? "").split(/\s+/);
}

function allClasses(host: Element) {
  return [host, ...host.querySelectorAll("[class]")]
    .map((node) => node.getAttribute("class") ?? "")
    .join(" ");
}

const VARIANTS: readonly CalmToggleVariant[] = ["header", "pill", "words"];

describe("SkipLink", () => {
  it("REQ-A11Y-02 skip link targets the main landmark", () => {
    const link = render(<SkipLink />).querySelector("a");
    expect(link?.getAttribute("href")).toBe("#main");
    expect(link?.textContent).toBe("Skip to content");
  });
});

describe("SiteHeader", () => {
  it("REQ-NAV-01 the logo link is named T7SEN, home and shows the mark and the T7SEN wordmark", () => {
    const home = render(<SiteHeader />).querySelector('a[href="/"]');

    expect(home?.getAttribute("aria-label")).toBe("T7SEN, home");
    expect(home?.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    // The visible word is part of the name, so a speech user can say it.
    expect(home?.textContent).toBe("T7SEN");
    expect(home?.getAttribute("aria-label")).toContain(home?.textContent);
    expect(classesOf(home?.querySelector("span") ?? null)).toContain(
      "font-display",
    );
  });

  it("REQ-A11Y-02 the nav named Site controls holds Work, About and Contact as pills, then the Calm switch last", () => {
    const header = render(<SiteHeader />);
    const nav = header.querySelector('nav[aria-label="Site controls"]');
    const links = [...(nav?.querySelectorAll("a") ?? [])];
    const stops = [...header.querySelectorAll("a, button")];

    expect(header.querySelectorAll("nav")).toHaveLength(1);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/work",
      "/about",
      "/contact",
    ]);
    expect(stops.map((stop) => spokenText(stop))).toEqual([
      "T7SEN",
      "Work",
      "About",
      "Contact",
      "Calm mode",
    ]);
    expect(stops.at(-1)?.getAttribute("role")).toBe("switch");
    expect(stops.at(-1)?.closest("nav")).toBe(nav);
    for (const link of links) {
      expect(classesOf(link)).toEqual(
        expect.arrayContaining(["rounded-full", "min-h-11", "min-w-11"]),
      );
    }
  });

  it("REQ-NAV-01 below 640 px the controls take their own row, from 640 px they sit beside the logo", () => {
    const nav = render(<SiteHeader />).querySelector("nav");
    expect(classesOf(nav)).toEqual(
      expect.arrayContaining(["basis-full", "sm:basis-auto", "flex-wrap"]),
    );
  });
});

describe("CalmToggle", () => {
  let container: HTMLDivElement;
  let root: Root;

  function switches() {
    return [...container.querySelectorAll('[role="switch"]')];
  }

  function first() {
    const found = switches()[0];
    if (found === undefined) throw new Error("The switch is missing");
    return found as HTMLButtonElement;
  }

  async function click(target: HTMLElement = first()) {
    await act(async () => {
      target.click();
    });
  }

  async function mount(element: ReactElement) {
    await act(async () => {
      root.render(element);
    });
  }

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
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

  it.each(VARIANTS)(
    "REQ-A11Y-04 the %s form is an unchecked switch named Calm mode in the static HTML",
    (variant) => {
      const toggle = render(<CalmToggle variant={variant} />).querySelector(
        "button",
      );

      expect(toggle?.getAttribute("type")).toBe("button");
      expect(toggle?.getAttribute("role")).toBe("switch");
      expect(toggle?.getAttribute("aria-checked")).toBe("false");
      expect(toggle?.hasAttribute("aria-pressed")).toBe(false);
      expect(toggle?.hasAttribute("aria-describedby")).toBe(false);
      expect(spokenText(toggle ?? null)).toBe("Calm mode");
      expect(classesOf(toggle ?? null)).toEqual(
        expect.arrayContaining(["min-h-11", "min-w-11", "rounded-full"]),
      );
    },
  );

  it("REQ-A11Y-04 the header and hero forms show a track with a knob; the footer form says its state in words", () => {
    const host = render(
      <>
        <CalmToggle variant="header" />
        <CalmToggle variant="pill" />
        <CalmToggle variant="words" />
      </>,
    );
    const [header, pill, words] = [...host.querySelectorAll("button")];

    for (const form of [header, pill]) {
      const knob = form?.querySelector('[aria-hidden="true"] > span');
      expect(classesOf(knob ?? null)).toEqual(
        expect.arrayContaining(["bg-muted", "group-aria-checked:bg-glow"]),
      );
    }
    expect(pill?.textContent).toBe("Calm mode");
    expect(words?.textContent).toBe("Calm mode off");
    expect(words?.querySelector('[aria-hidden="true"]')?.textContent).toBe(
      " off",
    );
  });

  it("REQ-NAV-01 below 640 px the header form shows Calm and keeps the name Calm mode", () => {
    const toggle = render(<CalmToggle variant="header" />).querySelector(
      "button",
    );
    const word = [...(toggle?.querySelectorAll("span") ?? [])].find(
      (span) => span.textContent === " mode",
    );

    expect(classesOf(word ?? null)).toContain("max-sm:sr-only");
    expect(spokenText(toggle ?? null)).toBe("Calm mode");
  });

  it("REQ-I18N-01 the knob moves along the inline axis, so it mirrors on right-to-left pages", () => {
    const knob = render(<CalmToggle variant="pill" />).querySelector(
      '[aria-hidden="true"] > span',
    );
    expect(classesOf(knob)).toEqual(
      expect.arrayContaining([
        "start-[3px]",
        "group-aria-checked:start-[17px]",
      ]),
    );
  });

  it("REQ-A11Y-04 a click turns calm on for the visit and a second click turns it off", async () => {
    await mount(<CalmToggle variant="header" />);

    await click();
    expect(first().getAttribute("aria-checked")).toBe("true");
    expect(calmStore.getSnapshot().chosen).toBe(true);
    expect(device.stored.get("portfolio:calm")).toBe("on");

    await click();
    expect(first().getAttribute("aria-checked")).toBe("false");
    expect(calmStore.getSnapshot().calm).toBe(false);
    expect(device.stored.has("portfolio:calm")).toBe(false);
  });

  it("REQ-A11Y-04 the header, hero and footer forms share one store and always agree", async () => {
    await mount(
      <>
        <CalmToggle variant="header" />
        <CalmToggle variant="pill" />
        <CalmToggle variant="words" />
      </>,
    );
    const [, , words] = switches() as HTMLButtonElement[];
    if (words === undefined) throw new Error("The footer form is missing");

    await click(words);
    expect(switches().map((node) => node.getAttribute("aria-checked"))).toEqual(
      ["true", "true", "true"],
    );
    expect(words.textContent).toBe("Calm mode on");

    await click();
    expect(switches().map((node) => node.getAttribute("aria-checked"))).toEqual(
      ["false", "false", "false"],
    );
    expect(words.textContent).toBe("Calm mode off");
  });

  it("REQ-A11Y-03 while the OS asks for reduced motion every form shows on, says why and stays on", async () => {
    await mount(
      <>
        <CalmToggle variant="header" />
        <CalmToggle variant="pill" />
        <CalmToggle variant="words" />
      </>,
    );
    await act(async () => {
      device.setSystem(true);
    });

    for (const toggle of switches() as HTMLButtonElement[]) {
      const noteId = toggle.getAttribute("aria-describedby");
      const note = noteId === null ? null : document.getElementById(noteId);

      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(toggle.disabled).toBe(false);
      expect(note?.hidden).toBe(true);
      expect(note?.textContent).toBe(
        "Your device asks for reduced motion, so calm stays on.",
      );
    }

    await click();
    expect(first().getAttribute("aria-checked")).toBe("true");
    expect(calmStore.getSnapshot().chosen).toBe(false);
  });

  it("REQ-A11Y-03 the explanation leaves when the OS setting does", async () => {
    await mount(<CalmToggle />);
    await act(async () => {
      device.setSystem(true);
    });
    await act(async () => {
      device.setSystem(false);
    });

    expect(first().getAttribute("aria-checked")).toBe("false");
    expect(first().hasAttribute("aria-describedby")).toBe(false);
  });
});

describe("SiteFooter", () => {
  it("REQ-A11Y-02 the nav named Footer links Work, Making-of, About, Contact, v1 archive and GitHub", () => {
    const footer = render(<SiteFooter year={2027} />);
    const nav = footer.querySelector('nav[aria-label="Footer"]');
    const links = [...(nav?.querySelectorAll("a") ?? [])];

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/work",
      "/work/making-of",
      "/about",
      "/contact",
      "/v1",
      "https://github.com/T7SEN",
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      "Work→",
      "Making-of→",
      "About→",
      "Contact→",
      "v1 archive→",
      "GitHub↗",
    ]);
  });

  it("REQ-A11Y-02 arrows to pages of this site show on hover and focus only; GitHub's up-right arrow shows at rest", () => {
    const links = [
      ...render(<SiteFooter year={2027} />).querySelectorAll("nav a"),
    ];
    const github = links.pop();

    for (const link of links) {
      expect(arrowOf(link)?.className).toContain("opacity-0");
      expect(classesOf(link)).toContain("min-h-11");
    }
    expect(arrowOf(github ?? null)?.className).not.toContain("opacity-0");
  });

  it("REQ-NAV-01 the footer shows the wordmark, the tagline and the copyright row", () => {
    const footer = render(<SiteFooter year={2027} />);
    const paragraphs = [...footer.querySelectorAll("p")].map(
      (node) => node.textContent,
    );

    expect(paragraphs).toEqual(["T7SEN", site.tagline, "© 2027 T7SEN"]);
    expect(copyright(2027)).toBe("© 2027 T7SEN");
  });

  it("REQ-NAV-01 the copyright year is the year the page is built", () => {
    const footer = render(<SiteFooter />);
    expect(footer.textContent).toContain(`© ${new Date().getFullYear()} T7SEN`);
  });

  it("REQ-A11Y-04 the footer's Calm pill is a switch that says its state in words", () => {
    const toggle = render(<SiteFooter year={2027} />).querySelector(
      '[role="switch"]',
    );
    expect(toggle?.textContent).toBe("Calm mode off");
    expect(spokenText(toggle)).toBe("Calm mode");
  });
});

describe("TextLink", () => {
  it.each([
    ["/work", "→"],
    ["#main", "→"],
    ["https://github.com", "↗"],
    ["//example.com", "↗"],
  ])(
    "REQ-A11Y-02 %s gets the arrow %s, hidden from screen readers",
    (href, glyph) => {
      const link = render(<TextLink href={href}>Text</TextLink>).querySelector(
        "a",
      );
      expect(link?.getAttribute("href")).toBe(href);
      expect(arrowOf(link)?.textContent).toBe(glyph);
      expect(arrowOf(link)?.className).not.toContain("opacity-0");
      expect(spokenText(link)).toBe("Text");
    },
  );

  it("REQ-A11Y-06 two link weights: the main link in text colour with a glow arrow, the second muted; both underlined and brightening on hover", () => {
    const host = render(
      <>
        <TextLink href="/work/archelab">Read the case study</TextLink>
        <TextLink href="https://arche-lab.tech" variant="muted">
          arche-lab.tech
        </TextLink>
      </>,
    );
    const [main, second] = [...host.querySelectorAll("a")];

    expect(classesOf(main ?? null)).toEqual(
      expect.arrayContaining(["text-text", "hover:text-paper"]),
    );
    expect(classesOf(wordsOf(main ?? null))).toContain("underline");
    expect(arrowOf(main ?? null)?.className).toContain("text-glow");
    expect(classesOf(second ?? null)).toEqual(
      expect.arrayContaining(["text-muted", "hover:text-paper"]),
    );
    expect(classesOf(wordsOf(second ?? null))).toContain("underline");
    expect(arrowOf(second ?? null)?.className).not.toContain("text-glow");
  });

  it("REQ-A11Y-06 the underline is on the words alone, never under the arrow, however the link is laid out", () => {
    const host = render(
      <>
        <TextLink href="/work/archelab" className="inline-flex min-h-11">
          Read the case study
        </TextLink>
        <TextLink
          href="https://coup.example"
          variant="muted"
          className="inline-flex min-h-11"
        >
          Play it
        </TextLink>
        <TextLink href="/about" variant="footer">
          About
        </TextLink>
      </>,
    );
    const [main, second, footer] = [...host.querySelectorAll("a")];
    for (const link of [main, second]) {
      const anchor = link ?? null;
      // A flex link makes its arrow a flex item, which would take the
      // link's own underline.
      expect(classesOf(anchor)).not.toContain("underline");
      expect(classesOf(arrowOf(anchor))).not.toContain("underline");
      const words = wordsOf(anchor);
      expect(classesOf(words)).toEqual(
        expect.arrayContaining(["underline", "underline-offset-2"]),
      );
      expect(words?.contains(arrowOf(anchor))).toBe(false);
    }
    expect(wordsOf(main ?? null)?.textContent).toBe("Read the case study");
    expect(wordsOf(second ?? null)?.textContent).toBe("Play it");
    // The footer's links have no underline at all.
    expect(classesOf(wordsOf(footer ?? null))).not.toContain("underline");
    expect(classesOf(footer ?? null)).not.toContain("underline");
  });

  it("REQ-A11Y-06 classes for the words reach the words' own box", () => {
    const link = render(
      <TextLink href="/work" wordsClassName="max-sm:no-underline">
        Work
      </TextLink>,
    ).querySelector("a");
    expect(classesOf(wordsOf(link))).toEqual(
      expect.arrayContaining(["underline", "max-sm:no-underline"]),
    );
  });

  it("REQ-I18N-01 the arrow mirrors on right-to-left pages", () => {
    const link = render(<TextLink href="/about">About</TextLink>).querySelector(
      "a",
    );
    expect(arrowOf(link)?.className).toContain("rtl:-scale-x-100");
  });

  it("REQ-A11Y-01 a label for assistive technology reaches the link", () => {
    const link = render(
      <TextLink href="/work/coup-online" aria-label="Full study, Coup Online">
        Full study
      </TextLink>,
    ).querySelector("a");
    expect(link?.getAttribute("aria-label")).toBe("Full study, Coup Online");
  });
});

describe("Label", () => {
  it("REQ-A11Y-02 a home chapter label shows 01 / Field in capitals and reads as Field", () => {
    const label = render(
      <Label as="h2" number="01" parts={["Field"]} />,
    ).querySelector("h2");

    expect(label?.textContent).toBe("01 / Field");
    expect(spokenText(label)).toBe("Field");
    expect(classesOf(label)).toEqual(
      expect.arrayContaining(["font-mono", "uppercase", "text-muted"]),
    );
  });

  it("REQ-A11Y-02 words are joined by a middle dot that a screen reader skips, never running the words together", () => {
    const label = render(<Label parts={["All work", "No 3D"]} />).querySelector(
      "p",
    );

    expect(label?.textContent).toBe("All work · No 3D");
    expect(spokenText(label)).toBe("All work No 3D");
  });

  it("REQ-A11Y-06 the eyebrow is violet and the chosen item's label glow", () => {
    const host = render(
      <>
        <Label parts={["WebGPU developer"]} tone="violet" size="md" />
        <Label parts={["2", "Velocity"]} tone="glow" />
      </>,
    );
    const [eyebrow, chosen] = [...host.querySelectorAll("p")];
    expect(classesOf(eyebrow ?? null)).toContain("text-violet");
    expect(classesOf(chosen ?? null)).toContain("text-glow");
  });
});

describe("Pills", () => {
  it("REQ-NAV-01 the primary pill is lavender with void text and a forward arrow", () => {
    const link = render(
      <PillLink href="/work" variant="primary" size="lg">
        See the work
      </PillLink>,
    ).querySelector("a");
    const icon = link?.querySelector("svg");

    expect(link?.getAttribute("href")).toBe("/work");
    expect(spokenText(link ?? null)).toBe("See the work");
    expect(classesOf(link ?? null)).toEqual(
      expect.arrayContaining([
        "bg-glow",
        "text-void",
        "rounded-full",
        "min-h-13",
        "hover:bg-paper",
      ]),
    );
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.querySelector("path")?.getAttribute("d")).toBe(
      "M5 12h14M13 6l6 6-6 6",
    );
    expect(link?.lastElementChild).toBe(icon);
  });

  it("REQ-I18N-01 a pill to another site carries the up-right arrow, and both mirror on right-to-left pages", () => {
    const host = render(
      <>
        <PillLink href="https://github.com/T7SEN" arrow="auto">
          GitHub
        </PillLink>
        <PillLink href="/work" arrow="auto">
          Work
        </PillLink>
      </>,
    );
    const [out, forward] = [...host.querySelectorAll("svg")];

    expect(out?.querySelector("path")?.getAttribute("d")).toBe(
      "M7 17 17 7M8 7h9v9",
    );
    for (const icon of [out, forward]) {
      expect(icon?.getAttribute("class")).toContain("rtl:-scale-x-100");
    }
  });

  it("REQ-NAV-01 Skip intro is a small mono pill with a down arrow before the words", () => {
    const link = render(
      <PillLink href="#work" variant="quiet" size="sm" arrow="down">
        Skip intro
      </PillLink>,
    ).querySelector("a");
    const icon = link?.firstElementChild;

    expect(icon?.tagName.toLowerCase()).toBe("svg");
    expect(icon?.getAttribute("class")).not.toContain("rtl:-scale-x-100");
    expect(classesOf(link ?? null)).toEqual(
      expect.arrayContaining(["font-mono", "min-h-11", "min-w-11"]),
    );
  });

  it("REQ-A11Y-02 outline pills carry no arrow unless asked, and pill buttons are buttons", () => {
    const host = render(
      <>
        <PillLink href="/contact">Send a message</PillLink>
        <PillButton variant="quiet" size="sm">
          Copy
        </PillButton>
      </>,
    );
    const link = host.querySelector("a");
    const button = host.querySelector("button");

    expect(link?.querySelector("svg")).toBeNull();
    expect(classesOf(link)).toContain("border");
    expect(button?.getAttribute("type")).toBe("button");
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(["min-h-11", "min-w-11", "rounded-full"]),
    );
  });
});

describe("Chips, badges, panels and boxes", () => {
  it("REQ-A11Y-06 a chip is a small mono pill with a hairline border, a list item inside a stack", () => {
    const chip = render(
      <ul>
        <Chip as="li">three.js r187</Chip>
      </ul>,
    ).querySelector("li");

    expect(chip?.textContent).toBe("three.js r187");
    expect(classesOf(chip)).toEqual(
      expect.arrayContaining([
        "rounded-full",
        "border",
        "font-mono",
        "text-muted",
      ]),
    );
  });

  it("REQ-A11Y-06 Short-form is a plain muted pill; In progress is violet with an open circle", () => {
    const host = render(
      <>
        <Badge>Short-form</Badge>
        <Badge tone="progress">In progress</Badge>
      </>,
    );
    const [plain, progress] = [...host.children];

    expect(plain?.textContent).toBe("Short-form");
    expect(classesOf(plain ?? null)).toEqual(
      expect.arrayContaining(["text-muted", "uppercase", "font-mono"]),
    );
    expect(plain?.querySelector("span")).toBeNull();
    expect(spokenText(progress ?? null)).toBe("In progress");
    expect(classesOf(progress ?? null)).toContain("text-violet");
    expect(
      progress?.querySelector('[aria-hidden="true"]')?.getAttribute("class"),
    ).toContain("rounded-full");
  });

  it("REQ-A11Y-06 a panel has its own fill, a hairline border and 16 px corners, raised a step lighter", () => {
    const host = render(
      <>
        <Panel as="article" aria-labelledby="study-title">
          Card
        </Panel>
        <Panel as="blockquote" tone="raised" padding="md">
          Quote
        </Panel>
      </>,
    );
    const card = host.querySelector("article");
    const quote = host.querySelector("blockquote");

    expect(card?.getAttribute("aria-labelledby")).toBe("study-title");
    expect(classesOf(card)).toEqual(
      expect.arrayContaining(["bg-surface", "border", "rounded-2xl"]),
    );
    expect(classesOf(quote)).toEqual(
      expect.arrayContaining(["bg-raised", "rounded-2xl"]),
    );
  });

  it("REQ-NAV-01 the boxed link holds its words and a muted mono note, all one target", () => {
    const link = render(
      <BoxedLink href="/work" note="No 3D · Static HTML">
        Open the full index
      </BoxedLink>,
    ).querySelector("a");
    const [words, , note] = [...(link?.children ?? [])];

    expect(link?.getAttribute("href")).toBe("/work");
    // The two lines never run together in the link's name.
    expect(spokenText(link ?? null)).toBe(
      "Open the full index, No 3D · Static HTML",
    );
    expect(arrowOf(words ?? null)?.textContent).toBe("→");
    expect(classesOf(note ?? null)).toEqual(
      expect.arrayContaining(["font-mono", "uppercase", "text-muted"]),
    );
    expect(classesOf(link ?? null)).toEqual(
      expect.arrayContaining(["min-h-11", "border"]),
    );
  });

  it("REQ-A11Y-06 the dashed box is a dashed hairline", () => {
    const host = render(<DashedBox>Spam check</DashedBox>);

    expect(classesOf(host.querySelector("div"))).toContain("border-dashed");
  });

  it("REQ-NAV-01 the wordmark is Unbounded Bold text", () => {
    const mark = render(<Wordmark />).querySelector("span");
    expect(mark?.textContent).toBe("T7SEN");
    expect(classesOf(mark)).toEqual(
      expect.arrayContaining(["font-display", "font-bold"]),
    );
  });
});

describe("Colour and direction", () => {
  // Every text and background pairing the chrome and the shared pieces draw,
  // with the ratio WCAG 2.2 asks of it.
  const PAIRS: ReadonlyArray<[ColorName, ColorName, number, string]> = [
    ["text", "void", 4.5, "links, pills and the wordmark"],
    ["muted", "void", 4.5, "labels, the tagline, the copyright"],
    ["paper", "void", 4.5, "link hover"],
    ["glow", "void", 4.5, "link arrows, the Calm state word"],
    ["violet", "void", 4.5, "the eyebrow, In progress"],
    ["void", "glow", 4.5, "the primary pill"],
    ["void", "paper", 4.5, "the primary pill on hover"],
    ["text", "surface", 4.5, "text in panels"],
    ["muted", "surface", 4.5, "chips and badges on cards"],
    ["violet", "surface", 4.5, "In progress on a card"],
    ["paper", "surface", 4.5, "link hover in panels"],
    ["text", "raised", 4.5, "a raised panel"],
    ["muted", "raised", 3, "the Calm knob when off"],
    ["glow", "raised", 3, "the Calm knob and track ring when on"],
  ];

  it.each(PAIRS)(
    "REQ-A11Y-06 %s on %s meets %d to 1 (%s)",
    (foreground, background, needs) => {
      expect(
        contrastRatio(colors[foreground], colors[background]),
      ).toBeGreaterThanOrEqual(needs);
    },
  );

  function everything() {
    return render(
      <>
        <SiteHeader />
        <SiteFooter year={2027} />
        <Label number="01" parts={["Field"]} />
        <PillLink href="/work" variant="primary" size="lg">
          See the work
        </PillLink>
        <PillLink href="#work" variant="quiet" size="sm" arrow="down">
          Skip intro
        </PillLink>
        <CalmToggle variant="pill" />
        <Chip>GSAP</Chip>
        <Badge tone="progress">In progress</Badge>
        <Panel tone="raised">Panel</Panel>
        <BoxedLink href="/work" note="No 3D">
          Open the full index
        </BoxedLink>
        <DashedBox>Spam check</DashedBox>
      </>,
    );
  }

  it("REQ-A11Y-06 colours come only from the tokens", () => {
    const tokens = new Set<string>(Object.keys(colors));
    const used = allClasses(everything())
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
      "lg",
      "xl",
      "label",
      "center",
      "dashed",
      "t",
      "current",
    ]);

    expect(used.length).toBeGreaterThan(0);
    for (const name of used.filter((value) => !notColours.has(value))) {
      expect(tokens.has(name), name).toBe(true);
    }
    expect(allClasses(everything())).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("REQ-I18N-01 the chrome and the shared pieces use no physical left or right utility", () => {
    expect(findPhysicalClasses(allClasses(everything()))).toEqual([]);
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
