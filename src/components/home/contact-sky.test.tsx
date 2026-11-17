import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findPhysicalClasses } from "../../../scripts/class-scan-lib.mjs";

import { ContactSky } from "./contact-sky";

// First content has passed as soon as it is asked for.
vi.mock("@/components/engine/after-first-content", () => ({
  afterFirstContent: (run: () => void) => {
    run();
    return () => undefined;
  },
}));

// The session's chunk fails to load, as an offline visitor's would.
vi.mock("./contact-sky-session", () => {
  throw new Error("chunk failed");
});

let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("ContactSky", () => {
  it("REQ-SCR-08 REQ-I18N-01 the name label is placed in px from the left as the stars are, so it lays out left to right on every page and pins one edge", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(<ContactSky />);
    const label = host.querySelector('[data-part="sky-label"]');
    expect(label?.getAttribute("dir")).toBe("ltr");
    expect(label?.getAttribute("aria-hidden")).toBe("true");
    expect(label?.className.split(" ")).toContain("start-0");
    expect(findPhysicalClasses(label?.className ?? "")).toEqual([]);
  });

  it("REQ-SCR-08 rule A11: a chunk that fails to load leaves the label hidden and rejects nothing unhandled", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("section");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<ContactSky />);
    });
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    expect(warn.mock.calls[0]?.[0]).toBe("contact sky: no-session");
    const label = host.querySelector<HTMLElement>('[data-part="sky-label"]');
    expect(label?.style.left).toBe("");
    expect(label?.textContent).toBe("");
  });
});
