// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
const BOUNDARY_RULES = new Set([
  "no-restricted-imports",
  "no-restricted-syntax",
  "import/no-restricted-paths",
]);

async function boundaryErrors(code: string, filePath: string) {
  const [result] = await eslint.lintText(`${code}\n`, { filePath });
  return (result?.messages ?? []).filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  );
}

// The first lint loads the whole config, its plugins and the TypeScript
// parser. Beside forty other test files in the full run that took longer than
// Vitest's 5 s default, so the boundary tests get more room.
describe("engine and tokens boundary", { timeout: 30_000 }, () => {
  it.each([
    'import "@/app/layout";',
    'import "@/components/hero";',
    'import "@/content/studies";',
    'import "@/lib/env";',
    'import type { Metadata } from "@/app/layout";',
    'export * from "@/lib/env";',
    'import "react";',
    'import "react-dom/client";',
    'import "next/navigation";',
    'import "../app/layout";',
    'import "../app/page";',
    'import "../tokens/colors";',
    'export const load = () => import("react");',
    'export const load = () => import("next/navigation");',
    'export const load = () => import("@/lib/env");',
    'export const load = () => import("../app/page");',
    'export const react = require("react");',
    'export const env = require("@/lib/env");',
  ])("REQ-ENG-02 blocks %s in src/engine", async (code) => {
    expect(await boundaryErrors(code, "src/engine/sample.ts")).not.toHaveLength(
      0,
    );
  });

  it.each(["src/engine/sample.js", "src/engine/sample.mjs"])(
    "REQ-ENG-02 applies to %s as well as TypeScript files",
    async (filePath) => {
      expect(
        await boundaryErrors('import "react";', filePath),
      ).not.toHaveLength(0);
    },
  );

  it("REQ-ENG-02 blocks a relative path out of a nested engine folder", async () => {
    const errors = await boundaryErrors(
      'import "../../app/layout";',
      "src/engine/passes/sample.ts",
    );
    expect(errors.map((error) => error.ruleId)).toContain(
      "import/no-restricted-paths",
    );
  });

  it.each([
    'import "@/tokens/colors";',
    'import "@/tokens";',
    'import "@/engine/simulation";',
    'import "./simulation";',
    'import "three/webgpu";',
    'export const load = () => import("three/webgpu");',
    'export const load = () => import("@/tokens/colors");',
    'export const load = () => import("./simulation");',
  ])("REQ-ENG-02 allows %s in src/engine", async (code) => {
    expect(await boundaryErrors(code, "src/engine/sample.ts")).toHaveLength(0);
  });

  it.each([
    'import "@/app/layout";',
    'import "@/components/hero";',
    'import "@/content/studies";',
    'import "@/lib/env";',
    'import "@/engine/index";',
    'export * from "@/lib/env";',
    'import "react";',
    'import "next/font/google";',
    'import "../app/layout";',
    'export const load = () => import("@/components/hero");',
    'export const load = () => import("react");',
    'export const env = require("@/lib/env");',
    'export const react = require("react");',
  ])("REQ-ENG-02 blocks %s in src/tokens", async (code) => {
    expect(await boundaryErrors(code, "src/tokens/colors.ts")).not.toHaveLength(
      0,
    );
  });

  it("REQ-ENG-02 blocks a relative path out of a nested tokens folder", async () => {
    const errors = await boundaryErrors(
      'import "../../app/layout";',
      "src/tokens/nested/sample.ts",
    );
    expect(errors.map((error) => error.ruleId)).toContain(
      "import/no-restricted-paths",
    );
  });

  it.each([
    'import "./palette";',
    'import "@/tokens/palette";',
    'export const load = () => import("./palette");',
  ])("REQ-ENG-02 allows %s in src/tokens", async (code) => {
    expect(await boundaryErrors(code, "src/tokens/colors.ts")).toHaveLength(0);
  });

  it("REQ-ENG-02 leaves app code free to import React and app modules", async () => {
    expect(
      await boundaryErrors(
        'import "react";\nimport "@/lib/env";\nexport const load = () => import("next/navigation");',
        "src/components/hero.tsx",
      ),
    ).toHaveLength(0);
  });
});
