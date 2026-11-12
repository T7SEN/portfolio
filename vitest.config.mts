import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const INCLUDE = ["**/*.test.{ts,tsx,mts,mjs}"];
const EXCLUDE = ["**/node_modules/**", "**/.git/**", ".next/**", "e2e/**"];
// The one test timed by the clock. It runs in its own project, after every
// other file has finished and alone, so no other test shares the processor
// while it times (REQ-SCR-01).
const TIMED = ["src/engine/runtime/shapes/cold-start.test.ts"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: INCLUDE,
          exclude: [...EXCLUDE, ...TIMED],
        },
      },
      {
        extends: true,
        test: {
          name: "timed",
          environment: "node",
          include: TIMED,
          exclude: EXCLUDE,
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
