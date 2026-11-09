// Writes src/app/tokens.css, the Tailwind @theme block, from
// src/tokens/colors.ts, so the CSS and the engine read the same colours
// (REQ-ENG-02). With --check it writes nothing and exits 1 when the file on
// disk differs from what it would write.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { colors } from "../src/tokens/colors.ts";

export const TOKENS_CSS_PATH = fileURLToPath(
  new URL("../src/app/tokens.css", import.meta.url),
);

const NAME = /^[a-z][a-z0-9-]*$/;
const HEX = /^#[0-9a-f]{6}$/i;

// Hex values are written in lower case because Prettier prints them that way,
// so the written file passes the format check unchanged.
export function tokensCss(tokens = colors) {
  const declarations = Object.entries(tokens).map(([name, hex]) => {
    if (!NAME.test(name)) throw new Error(`Bad token name: ${name}`);
    if (!HEX.test(hex)) throw new Error(`Bad hex for ${name}: ${hex}`);
    return `  --color-${name}: ${hex.toLowerCase()};`;
  });

  return [
    "/*",
    " * Written by scripts/tokens-css.mjs from src/tokens/colors.ts.",
    " * Do not edit by hand: change the tokens there and run the script.",
    " */",
    "@theme {",
    "  --color-*: initial;",
    ...declarations,
    "}",
    "",
  ].join("\n");
}

function readIfPresent(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

if (import.meta.main) {
  const expected = tokensCss();

  if (process.argv.includes("--check")) {
    if (readIfPresent(TOKENS_CSS_PATH) !== expected) {
      console.log(
        "FAIL tokens: src/app/tokens.css differs from src/tokens/colors.ts; run node scripts/tokens-css.mjs",
      );
      process.exit(1);
    }
    console.log("ok tokens: src/app/tokens.css matches src/tokens/colors.ts");
  } else {
    writeFileSync(TOKENS_CSS_PATH, expected);
    console.log("wrote src/app/tokens.css");
  }
}
