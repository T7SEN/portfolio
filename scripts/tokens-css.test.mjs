// @vitest-environment node
import { readFileSync } from "node:fs";
import * as prettier from "prettier";
import { describe, expect, it } from "vitest";
import { colors } from "../src/tokens/colors.ts";
import { TOKENS_CSS_PATH, tokensCss } from "./tokens-css.mjs";

const onDisk = () => readFileSync(TOKENS_CSS_PATH, "utf8");

function declarations(css) {
  return [...css.matchAll(/^\s*--color-([^:\s]+):\s*([^;]+);$/gm)].map(
    ([, name, value]) => ({ name, value }),
  );
}

describe("tokens CSS", () => {
  it("REQ-A11Y-06 REQ-ENG-02 src/app/tokens.css matches what scripts/tokens-css.mjs writes", () => {
    expect(onDisk()).toBe(tokensCss());
  });

  it("REQ-A11Y-06 REQ-ENG-02 declares every token once with its hex from colors.ts", () => {
    const tokens = declarations(onDisk()).filter(({ name }) => name !== "*");
    const names = tokens.map(({ name }) => name);

    for (const [name, hex] of Object.entries(colors)) {
      expect(names.filter((found) => found === name)).toHaveLength(1);
      expect(tokens.find((token) => token.name === name)?.value).toBe(
        hex.toLowerCase(),
      );
    }
    expect(names).toHaveLength(Object.keys(colors).length);
  });

  it("REQ-ENG-02 turns off the default palette before the tokens, in one @theme block", () => {
    const css = onDisk();
    expect(css.match(/@theme\b/g)).toHaveLength(1);
    expect(declarations(css)[0]).toEqual({ name: "*", value: "initial" });
  });

  it("REQ-ENG-02 writes CSS that Prettier leaves unchanged", async () => {
    const options = await prettier.resolveConfig(TOKENS_CSS_PATH);
    expect(
      await prettier.check(tokensCss(), {
        ...options,
        filepath: TOKENS_CSS_PATH,
      }),
    ).toBe(true);
  });

  it("REQ-ENG-02 refuses a token name or hex that would write broken CSS", () => {
    expect(() => tokensCss({ "Bad name": "#000000" })).toThrow(/name/);
    expect(() => tokensCss({ void: "#000" })).toThrow(/hex/);
  });
});
