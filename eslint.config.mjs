import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const engineBoundary =
  "The engine never imports app code. Only @/tokens is shared (REQ-ENG-02).";
const frameworkFree = "The engine is framework-free (REQ-ENG-02).";

// Any @/ alias except the engine's own and the shared tokens.
const APP_ALIAS = "^@/(?!(?:engine|tokens)(?:/|$))";
const FRAMEWORK = "^(?:react|react-dom|next)(?:/|$)";
// The same two patterns for AST selectors, where a "/" would end the regex.
const APP_ALIAS_SELECTOR = "^@\\x2F(?!(?:engine|tokens)(?:\\x2F|$))";
const FRAMEWORK_SELECTOR = "^(?:react|react-dom|next)(?:\\x2F|$)";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/engine/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: APP_ALIAS, message: engineBoundary },
            { regex: FRAMEWORK, message: frameworkFree },
            {
              regex: "^(?:\\.\\./)+tokens(?:/|$)",
              message: "Tokens come in through @/tokens only (REQ-ENG-02).",
            },
          ],
        },
      ],
      // no-restricted-imports does not look at import() or require().
      "no-restricted-syntax": [
        "error",
        {
          selector: `ImportExpression[source.value=/${APP_ALIAS_SELECTOR}/]`,
          message: engineBoundary,
        },
        {
          selector: `ImportExpression[source.value=/${FRAMEWORK_SELECTOR}/]`,
          message: frameworkFree,
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=/${APP_ALIAS_SELECTOR}/]`,
          message: engineBoundary,
        },
        {
          selector: `CallExpression[callee.name="require"][arguments.0.value=/${FRAMEWORK_SELECTOR}/]`,
          message: frameworkFree,
        },
      ],
      // Catches relative paths that leave src/engine for app code, which the
      // alias patterns above cannot see.
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/engine",
              from: "./src",
              except: ["./engine", "./tokens"],
              message: engineBoundary,
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
]);
