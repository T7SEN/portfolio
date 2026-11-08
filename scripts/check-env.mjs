// Prints "ok NAME" or "missing NAME" for every name in .env.example, checking
// .env.local and the process environment. Values are never printed
// (REQ-SEC-01). Missing names only block the phase that needs them, so this
// exits 0 unless --strict is passed.
import { existsSync, readFileSync } from "node:fs";
import { envReport, exampleNames, namesWithValues } from "./env-lib.mjs";

const names = exampleNames(readFileSync(".env.example", "utf8"));
const present = existsSync(".env.local")
  ? namesWithValues(readFileSync(".env.local", "utf8"))
  : new Set();

const lines = envReport(names, present, process.env);
lines.forEach((line) => console.log(line));

if (
  process.argv.includes("--strict") &&
  lines.some((line) => line.startsWith("missing"))
) {
  process.exit(1);
}
