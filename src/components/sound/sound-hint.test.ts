import { afterEach, describe, expect, it, vi } from "vitest";

import { HINT_GUTTER, placeHint } from "./sound-hint";

function rectAt(left: number, width: number): DOMRect {
  return {
    left,
    right: left + width,
    width,
    top: 0,
    bottom: 40,
    height: 40,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

function place(screen: number, box: DOMRect, pill: DOMRect, dir = "ltr") {
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
    screen,
  );
  const element = document.createElement("p");
  element.style.direction = dir;
  const pointer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const target = document.createElement("button");
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(box);
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(pill);
  document.body.append(element, pointer, target);
  placeHint(element, pointer, target);
  return { element, pointer };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("placeHint", () => {
  it("REQ-SND-02 at 320 px the full-width hint moves inside the gutter, its pointer still on the speaker square", () => {
    // A 272 px box hung from the end of the square at 120 to 164 px.
    const { element, pointer } = place(
      320,
      rectAt(164 - 272, 272),
      rectAt(120, 44),
    );
    const shift = HINT_GUTTER - (164 - 272);
    expect(element.style.getPropertyValue("translate")).toMatch(
      new RegExp(`^${shift}px( 0(px)?)?$`),
    );
    // The square's middle, 142 px, less the box's new start, 16 px, less
    // half the pointer.
    expect(pointer.style.getPropertyValue("inset-inline-start")).toBe(
      `${142 - HINT_GUTTER - 6}px`,
    );
    expect(pointer.style.getPropertyValue("inset-inline-end")).toBe("auto");
  });

  it("REQ-SND-02 a hint inside the screen stays where it hangs, and moves back from the end edge when it would cross it", () => {
    const inside = place(1280, rectAt(900, 272), rectAt(1100, 160));
    expect(inside.element.style.getPropertyValue("translate")).toBe("");
    expect(inside.pointer.style.getPropertyValue("inset-inline-start")).toBe(
      `${1180 - 900 - 6}px`,
    );

    const past = place(375, rectAt(200, 272), rectAt(300, 44));
    expect(past.element.style.getPropertyValue("translate")).toMatch(
      new RegExp(`^${375 - HINT_GUTTER - 472}px( 0(px)?)?$`),
    );
  });
});
