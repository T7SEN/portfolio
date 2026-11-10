import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { headlines } from "@/content/hero";
import { studies, studyHref } from "@/content";
import { services } from "@/content/services";
import type { EngineEvent } from "@/engine/types";
import { tierStore } from "@/lib/tier-store";

import { Hero } from "./hero";
import { HeroHeadline } from "./hero-headline";
import { ServicesSection } from "./services-section";
import { WorkSection } from "./work-section";

function render(element: ReactElement) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(element);
  return host;
}

describe("Hero", () => {
  it("REQ-CNT-10 the h1 holds only the tier 3 line", () => {
    const h1s = render(<Hero />).querySelectorAll("h1");
    expect(h1s).toHaveLength(1);
    expect(h1s[0]?.textContent).toBe("Real-time worlds, built for your GPU.");
  });

  it("REQ-PERF-03 the other line reserves its space in the h1's cell through a hidden ::before", () => {
    const host = render(<Hero />);
    const h1 = host.querySelector("h1");
    const cell = h1?.parentElement;
    expect(cell?.getAttribute("data-reserve")).toBe(headlines.gpu);
    for (const name of [
      "before:content-[attr(data-reserve)]",
      "before:invisible",
      "before:col-start-1",
      "before:row-start-1",
    ]) {
      expect(cell?.className.split(" ")).toContain(name);
    }
    for (const name of ["col-start-1", "row-start-1"]) {
      expect(h1?.className.split(" ")).toContain(name);
    }
  });

  it("REQ-PERF-03 A14 the static HTML text never states the tier 1 and 2 line", () => {
    const host = render(<Hero />);
    expect(host.textContent).not.toContain(headlines.gpu);
  });

  it("REQ-PERF-03 the reserved line and the h1 share the same type", () => {
    const host = render(<HeroHeadline id="x" text={headlines.still} />);
    const h1 = host.querySelector("h1");
    const cell = h1?.parentElement;
    const h1Type = (h1?.className ?? "")
      .split(" ")
      .filter((name) => !name.endsWith("-start-1"))
      .sort();
    const reservedType = (cell?.className ?? "")
      .split(" ")
      .filter(
        (name) =>
          name.startsWith("before:font-") || name.startsWith("before:text-"),
      )
      .map((name) => name.replace("before:", ""))
      .sort();
    expect(reservedType).toEqual(h1Type);
  });

  it("REQ-PERF-03 the tier 1 and 2 headline reserves the tier 3 line in turn", () => {
    const cell = render(
      <HeroHeadline id="x" text={headlines.gpu} />,
    ).querySelector("h1")?.parentElement;
    expect(cell?.getAttribute("data-reserve")).toBe(headlines.still);
  });

  it("REQ-NAV-01 See the work, Send a message and Skip intro link to /work, /contact and #work", () => {
    const links = [...render(<Hero />).querySelectorAll("a")].map((link) => [
      link.textContent?.replace("→", ""),
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["See the work", "/work"],
      ["Send a message", "/contact"],
      ["Skip intro", "#work"],
    ]);
  });

  it("REQ-NAV-01 hero actions are at least 44 px tall", () => {
    for (const link of render(<Hero />).querySelectorAll("a")) {
      expect(link.className).toContain("min-h-11");
    }
  });
});

describe("HeroHeadline with the tier store", () => {
  let container: HTMLDivElement;
  let root: Root;

  async function report(event: EngineEvent) {
    await act(async () => {
      tierStore.apply(event);
    });
  }

  function cell() {
    const h1 = container.querySelector("h1");
    return { h1, text: h1?.textContent, reserve: h1?.parentElement?.dataset };
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<HeroHeadline id="x" text={headlines.still} />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    tierStore.reset();
    vi.unstubAllGlobals();
  });

  it("REQ-CNT-10 A14 before the engine reports, the h1 holds the tier 3 line", () => {
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it.each([
    [1, "probe-pass"],
    [2, "no-webgpu"],
  ] as const)(
    "REQ-CNT-10 A14 tier %i switches the h1 to the tiers 1 and 2 line once it has drawn, and reserves the tier 3 line",
    async (tier, reason) => {
      const before = cell().h1;
      await report({ type: "tierChosen", tier, reason });
      expect(cell().text).toBe(headlines.still);

      await report({ type: "ready", tier });
      expect(cell().text).toBe(headlines.gpu);
      expect(cell().reserve?.reserve).toBe(headlines.still);
      expect(cell().h1).toBe(before);
    },
  );

  it("REQ-CNT-10 A14 tier 3 keeps the tier 3 line", async () => {
    await report({ type: "tierChosen", tier: 3, reason: "save-data" });
    await report({ type: "ready", tier: 3 });
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 A14 the tier 3 line returns when the tier drops to 3", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });
    expect(cell().text).toBe(headlines.gpu);

    await report({ type: "tierChosen", tier: 3, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);
    expect(cell().reserve?.reserve).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 A14 the tier 3 line shows while a lost tier 1 is rebuilt as tier 2", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });

    await report({ type: "tierChosen", tier: 2, reason: "device-lost" });
    expect(cell().text).toBe(headlines.still);

    await report({ type: "ready", tier: 2 });
    expect(cell().text).toBe(headlines.gpu);
  });

  it("REQ-CNT-10 frame rate reports leave the headline alone", async () => {
    await report({ type: "tierChosen", tier: 2, reason: "phone" });
    await report({ type: "ready", tier: 2 });
    await report({ type: "frameRate", fps: 30 });
    expect(cell().text).toBe(headlines.gpu);
  });

  it("REQ-CNT-01 A14 a server render keeps the tier 3 line whatever the store holds", async () => {
    await report({ type: "tierChosen", tier: 1, reason: "probe-pass" });
    await report({ type: "ready", tier: 1 });
    const host = render(<Hero />);
    expect(host.querySelector("h1")?.textContent).toBe(headlines.still);
    expect(host.textContent).not.toContain(headlines.gpu);
  });
});

describe("ServicesSection", () => {
  it("REQ-CNT-11 shows the two headline offers and the one also line", () => {
    const host = render(<ServicesSection />);
    expect(
      [...host.querySelectorAll("li")].map((item) => item.textContent),
    ).toEqual([...services.offers]);
    expect(host.textContent).toContain(services.also);
  });
});

describe("WorkSection", () => {
  it("REQ-CNT-07 lists every study in order, each linking to its page", () => {
    const host = render(<WorkSection />);
    expect(host.querySelector("section")?.id).toBe("work");
    const links = [...host.querySelectorAll("h3 a")].map((link) =>
      link.getAttribute("href"),
    );
    expect(links).toEqual(studies.map((study) => studyHref(study.slug)));
  });
});
