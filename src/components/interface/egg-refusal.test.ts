import { afterEach, describe, expect, it, vi } from "vitest";

import { paletteCopy } from "@/content/palette";
import { eggNotice } from "@/lib/egg-notice";
import { tierChoiceStore } from "@/lib/tier-choice-store";

import { refusalFor, requestEggAloud } from "./egg-refusal";

const mocks = vi.hoisted(() => ({ requestEgg: vi.fn() }));
vi.mock("@/lib/eggs", () => ({ requestEgg: mocks.requestEgg }));

const calmOff = { calm: false, system: false, chosen: false };

afterEach(() => {
  tierChoiceStore.set("auto");
  mocks.requestEgg.mockReset();
});

describe("egg refusals", () => {
  it("REQ-NAV-05 A14 each reason has its words: no field on the page or not drawn yet, calm or the OS setting, a still frame of the device or of the visitor's own choice", () => {
    const no = (reason: "no-field" | "still" | "calm") =>
      ({ played: false, reason }) as const;
    expect(refusalFor(no("no-field"), "/work", calmOff, "auto")).toBe(
      "no-field-page",
    );
    expect(refusalFor(no("no-field"), "/", calmOff, "auto")).toBe(
      "no-field-yet",
    );
    expect(refusalFor(no("calm"), "/", { ...calmOff, calm: true }, 1)).toBe(
      "calm",
    );
    expect(
      refusalFor(
        no("calm"),
        "/",
        { calm: true, system: true, chosen: false },
        1,
      ),
    ).toBe("calm-system");
    // A device that fell back to the still, whatever was asked.
    expect(refusalFor(no("still"), "/", calmOff, "auto")).toBe("still");
    expect(refusalFor(no("still"), "/", calmOff, 1)).toBe("still");
    // The visitor's own choice is named as theirs, never the device's.
    expect(refusalFor(no("still"), "/", calmOff, 3)).toBe("still-chosen");
    expect(paletteCopy.eggRefusals["still-chosen"]).not.toMatch(/device/i);
  });

  it("REQ-NAV-05 an egg asked for outside the palette says why in the page's status when it cannot play, and nothing when it plays", () => {
    const heard: string[] = [];
    const stop = eggNotice.subscribe(() => {
      heard.push(eggNotice.getSnapshot()?.text ?? "");
    });
    mocks.requestEgg.mockReturnValue({ played: true });
    expect(requestEggAloud("gg")).toEqual({ played: true });
    expect(heard).toEqual([]);

    tierChoiceStore.set(3);
    mocks.requestEgg.mockReturnValue({ played: false, reason: "still" });
    requestEggAloud("mark");
    requestEggAloud("mark");
    // Said twice for two presses: each notice has its own id.
    expect(heard).toEqual([
      paletteCopy.eggRefusals["still-chosen"],
      paletteCopy.eggRefusals["still-chosen"],
    ]);
    stop();
  });
});
