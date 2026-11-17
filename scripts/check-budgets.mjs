// Budget check for every gate (REQ-PERF-04, REQ-PERF-05). Reads the production
// build in .next, so run `pnpm build` first. Writes a dated table to
// docs/results/ and prints one summary line for docs/test-log.md.
// The files it reads (app-path-routes-manifest.json, prerender-manifest.json,
// server/app/*.html) are Next.js build internals, not a documented interface,
// so anything it cannot find or measure is a failure, never a silent pass.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  ENGINE_MARKER,
  FIRST_LOAD_LIMIT_BYTES,
  MOTION_LIBRARIES,
  OVERLAY_LIBRARIES,
  chunkFiles,
  engineChunkBytes,
  findDeferredLibraries,
  firstLoadScripts,
  formatKb,
  gzipBytes,
  htmlPathFor,
  missingDeferred,
  pageRoutes,
  payloadFailures,
  soundCheck,
  soundFileCheck,
  soundFilesNamed,
  SOUND_FILES_DIR,
  staticFilePath,
  unprerenderedPages,
} from "./budget-lib.mjs";

const NEXT_DIR = ".next";
const CHUNKS_DIR = join(NEXT_DIR, "static", "chunks");
const MANIFEST_PATH = "src/engine/manifest.json";
const RUNTIME_DIR = "src/engine/runtime";
const SKY_CATALOGUE_FILE = "src/engine/sky/catalogue.ts";
const MOTION_LOADER = "src/lib/load-motion.ts";
const OVERLAY_LOADER = "src/components/interface/overlays.tsx";
const SOUND_SOURCE = "src/components/sound/voices.ts";
const SCRIPT_FILE = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const failures = [];

if (!existsSync(join(NEXT_DIR, "BUILD_ID"))) {
  console.log("FAIL budget: no production build in .next; run pnpm build");
  process.exit(1);
}

const buildId = readFileSync(join(NEXT_DIR, "BUILD_ID"), "utf8").trim();
const nextVersion = readJson("node_modules/next/package.json").version;
const pages = pageRoutes(
  readJson(join(NEXT_DIR, "app-path-routes-manifest.json")),
);
const prerenderRoutes = readJson(
  join(NEXT_DIR, "prerender-manifest.json"),
).routes;

for (const page of unprerenderedPages(pages, prerenderRoutes)) {
  failures.push(`${page} is not prerendered, so its first load is unmeasured`);
}

const fileCache = new Map();
function measureFile(path) {
  if (!fileCache.has(path)) {
    const source = readFileSync(path);
    fileCache.set(path, {
      bytes: gzipBytes(source),
      libraries: findDeferredLibraries(source.toString("utf8")),
    });
  }
  return fileCache.get(path);
}

const pageSet = new Set(pages);
const rows = [];
for (const [route, entry] of Object.entries(prerenderRoutes)) {
  if (!pageSet.has(entry?.srcRoute ?? route)) continue;
  const htmlPath = join(NEXT_DIR, htmlPathFor(route));
  if (!existsSync(htmlPath)) {
    failures.push(`${route}: no prerendered HTML at ${htmlPath}`);
    continue;
  }

  let bytes = 0;
  const libraries = new Set();
  const scripts = firstLoadScripts(readFileSync(htmlPath, "utf8"));
  if (scripts.length === 0) {
    failures.push(`${route}: no first-load scripts found in its HTML`);
  }
  for (const src of scripts) {
    const relative = staticFilePath(src);
    if (relative === null) {
      failures.push(
        `${route}: first-load script from outside the build: ${src}`,
      );
      continue;
    }
    const filePath = join(NEXT_DIR, "static", relative);
    if (!existsSync(filePath)) {
      failures.push(`${route}: first-load script missing from .next: ${src}`);
      continue;
    }
    const measured = measureFile(filePath);
    bytes += measured.bytes;
    measured.libraries.forEach((name) => libraries.add(name));
  }

  rows.push({
    route,
    scripts: scripts.length,
    bytes,
    libraries: [...libraries],
  });
  if (bytes > FIRST_LOAD_LIMIT_BYTES) {
    failures.push(
      `${route}: first-load JavaScript ${formatKb(bytes)} is over ${formatKb(FIRST_LOAD_LIMIT_BYTES)}`,
    );
  }
  if (libraries.size > 0) {
    failures.push(`${route}: first load contains ${[...libraries].join(", ")}`);
  }
}
if (rows.length === 0) failures.push("no prerendered page was measured");

const builtChunks = existsSync(CHUNKS_DIR)
  ? chunkFiles(CHUNKS_DIR).map(measureFile)
  : [];

// The loader brings these libraries in after first content. When no chunk is
// detected as one of them, its signature no longer matches the build, and the
// first-load check above could not have found it either.
const motionHasCode =
  existsSync(MOTION_LOADER) &&
  readFileSync(MOTION_LOADER, "utf8").trim() !== "";
const motionMissing = motionHasCode
  ? missingDeferred(builtChunks, MOTION_LIBRARIES)
  : [];
if (motionMissing.length > 0) {
  failures.push(
    `${MOTION_LOADER} has code but no built chunk is detected as ${motionMissing.join(", ")}, so the first-load check cannot find ${motionMissing.length === 1 ? "it" : "them"}`,
  );
}

// The same for the menu's and the palette's libraries, which the overlays
// import on a dialog's first open.
const overlayHasCode =
  existsSync(OVERLAY_LOADER) &&
  readFileSync(OVERLAY_LOADER, "utf8").includes("import(");
const overlayMissing = overlayHasCode
  ? missingDeferred(builtChunks, OVERLAY_LIBRARIES)
  : [];
if (overlayMissing.length > 0) {
  failures.push(
    `${OVERLAY_LOADER} imports its dialogs but no built chunk is detected as ${overlayMissing.join(", ")}, so the first-load check cannot find ${overlayMissing.length === 1 ? "it" : "them"}`,
  );
}

// The sound's own limits, outside the 3D payload [T7SEN, 9 Nov 2026]: the
// chunks the first switch turned on loads, and each of the bed's recordings
// (D-179).
const soundSource = existsSync(SOUND_SOURCE)
  ? readFileSync(SOUND_SOURCE, "utf8")
  : "";
const soundHasCode = soundSource.trim() !== "";
const sound = soundCheck(builtChunks, soundHasCode);
failures.push(...sound.failures);
const soundFiles = soundFileCheck(
  existsSync(SOUND_FILES_DIR)
    ? readdirSync(SOUND_FILES_DIR).map((name) => ({
        name,
        bytes: statSync(join(SOUND_FILES_DIR, name)).size,
      }))
    : [],
  soundFilesNamed(soundSource),
);
failures.push(...soundFiles.failures);

// Chunks that hold three.js count toward the 3D payload of tiers 1 and 2;
// the engine's entry chunk counts toward every tier.
const engineJs = engineChunkBytes(builtChunks);
if (engineJs.shared > 0) {
  failures.push(
    "the engine entry shares a chunk with three.js, so tier 3 would download three.js",
  );
}
if (engineJs.skyShared > 0) {
  failures.push(
    "the sky catalogue shares a chunk with three.js, so tier 3 would download three.js",
  );
}
if (
  existsSync(SKY_CATALOGUE_FILE) &&
  engineJs.sky.count === 0 &&
  engineJs.skyShared === 0
) {
  failures.push(
    `${SKY_CATALOGUE_FILE} exists but no built chunk holds its data, so the sky catalogue is uncounted`,
  );
}

let payloadLines = [];
const engineHasCode =
  existsSync("src/engine") &&
  readdirSync("src/engine", { recursive: true }).some(
    (file) => SCRIPT_FILE.test(file) && !/\.test\./.test(file),
  );
if (engineHasCode && engineJs.entry.count === 0 && engineJs.shared === 0) {
  failures.push(
    `src/engine has code but no built chunk holds its marker "${ENGINE_MARKER}", so the engine entry is uncounted`,
  );
}
// The runtime folder is the only code that imports three.js, so with code
// there and no chunk found, tiers 1 and 2 would be summed without it.
const runtimeHasCode =
  existsSync(RUNTIME_DIR) &&
  readdirSync(RUNTIME_DIR, { recursive: true }).some(
    (file) => SCRIPT_FILE.test(file) && !/\.test\./.test(file),
  );
if (runtimeHasCode && engineJs.three.count === 0) {
  failures.push(
    `${RUNTIME_DIR} has code but no built chunk is detected as three.js, so the three.js chunk is uncounted`,
  );
}
if (existsSync(MANIFEST_PATH)) {
  const manifest = readJson(MANIFEST_PATH);
  const sizeOf = (file) => (existsSync(file) ? statSync(file).size : null);
  const result = payloadFailures(
    manifest,
    sizeOf,
    engineJs.three.bytes,
    engineJs.entry.bytes,
    engineJs.sky.bytes,
  );
  failures.push(...result.failures);
  payloadLines = result.totals.map(
    ({ tier, device, bytes, limit }) =>
      `| ${tier} | ${device} | ${formatKb(bytes)} | ${formatKb(limit)} |`,
  );
} else if (
  engineHasCode ||
  engineJs.three.count > 0 ||
  engineJs.entry.count > 0
) {
  failures.push(
    `the engine or three.js is in the build but no ${MANIFEST_PATH} lists its 3D payload`,
  );
}

rows.sort((a, b) => a.route.localeCompare(b.route));
const largest = rows.reduce((max, row) => Math.max(max, row.bytes), 0);
const date = new Date().toLocaleDateString("en-CA");
const report = [
  `# Budget check, ${date}`,
  "",
  `Next.js ${nextVersion}, build ${buildId}. Gzip level 9; 1 KB is 1,024 bytes.`,
  "",
  "## First-load JavaScript per route (REQ-PERF-04)",
  "",
  "| Route | Scripts | Gzip | Deferred libraries found |",
  "| --- | --- | --- | --- |",
  ...rows.map(
    (row) =>
      `| ${row.route} | ${row.scripts} | ${formatKb(row.bytes)} | ${row.libraries.join(", ") || "none"} |`,
  ),
  "",
  `Limit: ${formatKb(FIRST_LOAD_LIMIT_BYTES)} per route.`,
  "",
  "## 3D payload (REQ-PERF-05)",
  "",
  `Built chunks holding three.js: ${engineJs.three.count}, ${formatKb(engineJs.three.bytes)} gzip, counted in tiers 1 and 2.`,
  "",
  `Built chunks holding the engine entry and no three.js: ${engineJs.entry.count}, ${formatKb(engineJs.entry.bytes)} gzip, counted in every tier.`,
  "",
  `Built chunks holding the contact sky's catalogue and no three.js (D-146): ${engineJs.sky.count}, ${formatKb(engineJs.sky.bytes)} gzip, counted in every tier.`,
  "",
  ...(payloadLines.length > 0
    ? [
        "| Tier | Device | Size | Limit |",
        "| --- | --- | --- | --- |",
        ...payloadLines,
      ]
    : [`Not measured: ${MANIFEST_PATH} does not exist yet.`]),
  "",
  "## Sound (REQ-SND-01, its own limit)",
  "",
  `Built chunks holding the sound's code: ${sound.count}, ${formatKb(sound.bytes)} gzip, loaded when the first sound switch is turned on. Limit: ${formatKb(sound.limit)}.`,
  `The bed's recordings in ${SOUND_FILES_DIR}: ${soundFiles.count}, the largest ${formatKb(soundFiles.largest)}, one fetched when the background is first turned on. Limit for each: ${formatKb(soundFiles.limit)}.`,
  "",
  "## Result",
  "",
  ...(failures.length > 0
    ? failures.map((failure) => `- FAIL ${failure}`)
    : ["- ok"]),
  "",
];

mkdirSync("docs/results", { recursive: true });
const reportPath = `docs/results/${date}-budget.md`;
writeFileSync(reportPath, report.join("\n"));

for (const row of rows) {
  console.log(`${row.route}  ${row.scripts} scripts  ${formatKb(row.bytes)}`);
}
if (failures.length > 0) {
  failures.forEach((failure) => console.log(`FAIL ${failure}`));
  console.log(`FAIL budget (${reportPath})`);
  process.exit(1);
}
console.log(
  `ok budget: ${rows.length} routes, largest first load ${formatKb(largest)}, ${payloadLines.length > 0 ? "3D payload within limits" : "no 3D payload yet"}, sound ${formatKb(sound.bytes)} of ${formatKb(sound.limit)}, its recordings at most ${formatKb(soundFiles.largest)} of ${formatKb(soundFiles.limit)} each (${reportPath})`,
);
