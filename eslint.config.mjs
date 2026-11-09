import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const engineBoundary =
  "The engine never imports app code. Only @/tokens is shared (REQ-ENG-02).";
const tokensBoundary =
  "The tokens file is shared with the engine, so it imports no app code (REQ-ENG-02).";
const frameworkFree =
  "The engine and the tokens file are framework-free (REQ-ENG-02).";

const SCRIPT_FILES = "{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
const FRAMEWORK = "^(?:react|react-dom|next)(?:/|$)";
// The same pattern for AST selectors, where a "/" would end the regex.
const FRAMEWORK_SELECTOR = "^(?:react|react-dom|next)(?:\\x2F|$)";

// Any @/ alias except the named folders, for import statements and, with "/"
// written as \x2F, for AST selectors.
function aliasExcept(folders, slash) {
  const names = folders.join("|");
  return `^@${slash}(?!(?:${names})(?:${slash}|$))`;
}

// One boundary: files in src/<folder> may import only the allowed folders of
// src, never React or Next.js, through static imports, re-exports, import()
// and require().
function boundary({ folder, allowed, message, patterns = [] }) {
  const alias = aliasExcept(allowed, "/");
  const aliasSelector = aliasExcept(allowed, "\\x2F");

  return {
    files: [`src/${folder}/**/*.${SCRIPT_FILES}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: alias, message },
            { regex: FRAMEWORK, message: frameworkFree },
            ...patterns,
          ],
        },
      ],
      // no-restricted-imports does not look at import() or require().
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${aliasSelector}/]`,
          message,
        },
        {
          selector: `ImportExpression[source.value=/${FRAMEWORK_SELECTOR}/]`,
          message: frameworkFree,
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=/${aliasSelector}/]`,
          message,
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=/${FRAMEWORK_SELECTOR}/]`,
          message: frameworkFree,
        },
      ],
      // Catches relative paths that leave the folder for app code, which the
      // alias patterns above cannot see.
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: `./src/${folder}`,
              from: "./src",
              except: allowed.map((name) => `./${name}`),
              message,
            },
          ],
        },
      ],
    },
  };
}

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  boundary({
    folder: "engine",
    allowed: ["engine", "tokens"],
    message: engineBoundary,
    patterns: [
      {
        regex: "^(?:\\.\\./)+tokens(?:/|$)",
        message: "Tokens come in through @/tokens only (REQ-ENG-02).",
      },
    ],
  }),
  // The engine may import the tokens, so the tokens must not import app code,
  // or app code would reach the engine through them.
  boundary({ folder: "tokens", allowed: ["tokens"], message: tokensBoundary }),
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
