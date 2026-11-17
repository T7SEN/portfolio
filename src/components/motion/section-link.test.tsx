import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const scrollToSection = vi.hoisted(() =>
  vi.fn<(id: string) => boolean>(() => true),
);
vi.mock("./scroll-to-section", () => ({ scrollToSection }));

const { SectionLink } = await import("./section-link");

describe("SectionLink", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    scrollToSection.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  async function mount(href: `#${string}`) {
    await act(async () => {
      root.render(
        <SectionLink href={href} data-part="skip" className="pill">
          Skip
        </SectionLink>,
      );
    });
    const link = host.querySelector("a");
    if (link === null) throw new Error("no link");
    return link;
  }

  function part(id: string, tabindex?: string) {
    const element = document.createElement("section");
    element.id = id;
    if (tabindex !== undefined) element.setAttribute("tabindex", tabindex);
    document.body.append(element);
    return element;
  }

  function click(link: HTMLAnchorElement, init: MouseEventInit = {}) {
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ...init,
    });
    act(() => {
      link.dispatchEvent(event);
    });
    return event;
  }

  it("REQ-NAV-01 REQ-A11Y-02 is a real link to the part, with what it is given", async () => {
    const link = await mount("#work");
    expect(link.getAttribute("href")).toBe("#work");
    expect(link.dataset.part).toBe("skip");
    expect(link.className).toBe("pill");
    expect(link.textContent).toBe("Skip");
  });

  it("REQ-NAV-01 REQ-A11Y-02 a click scrolls to the part rather than jumping, and focus goes there first with no scroll of its own, for this one move", async () => {
    const work = part("work");
    const focus = vi.spyOn(work, "focus");
    const link = await mount("#work");
    const event = click(link);
    expect(event.defaultPrevented).toBe(true);
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(document.activeElement).toBe(work);
    expect(scrollToSection).toHaveBeenCalledExactlyOnceWith("work");
    // Focus first, then the scroll, so the focus never ends the glide.
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(
      scrollToSection.mock.invocationCallOrder[0] ?? 0,
    );
    // Focusable for the move only: once focus leaves, it is not.
    expect(work.getAttribute("tabindex")).toBe("-1");
    act(() => work.blur());
    expect(work.hasAttribute("tabindex")).toBe(false);
  });

  it("REQ-A11Y-02 a part that is focusable already keeps its own tabindex", async () => {
    const main = part("main", "-1");
    const link = await mount("#main");
    click(link);
    expect(document.activeElement).toBe(main);
    act(() => main.blur());
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(scrollToSection).toHaveBeenCalledExactlyOnceWith("main");
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
    ["Shift", { shiftKey: true }],
    ["Alt", { altKey: true }],
    ["the middle button", { button: 1 }],
  ] as const)(
    "REQ-NAV-01 a click with %s is the browser's",
    async (_name, init) => {
      part("about");
      const link = await mount("#about");
      expect(click(link, init).defaultPrevented).toBe(false);
      expect(scrollToSection).not.toHaveBeenCalled();
    },
  );

  it("REQ-NAV-01 a part not on this page, or a click the page already took, is left alone", async () => {
    const link = await mount("#nowhere");
    expect(click(link).defaultPrevented).toBe(false);
    expect(scrollToSection).not.toHaveBeenCalled();

    part("about");
    const about = await mount("#about");
    about.addEventListener("click", (event) => event.preventDefault(), {
      capture: true,
    });
    click(about);
    expect(scrollToSection).not.toHaveBeenCalled();
  });
});
