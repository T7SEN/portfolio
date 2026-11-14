import { readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// REQ-PERF-04: about 200 KB gzip of JavaScript before any 3D, counted in KiB.
export const FIRST_LOAD_LIMIT_BYTES = 200 * 1024;

// The engine's entry (the controller that decides the tier) builds into a
// chunk with no three.js in it, so it is found by a string of its own: the
// value src/engine/controller.ts writes on its canvas.
export const ENGINE_MARKER = "portfolio-field";
export const ENGINE_ENTRY = "engine entry";

// The contact sky's catalogue (D-146) builds into a chunk of its own, which
// the engine and the page load after first content on every tier. It is
// found by the start of its constellation list, which only the data holds:
// app code reads the list through property names.
export const SKY_CATALOGUE = "sky catalogue";
export const SKY_SIGNATURE = '["And","Ant","Aps","Aql"';

// Strings that survive minification in each library that must load after
// first content. Each one was checked against the pinned package source and
// against a Turbopack production build that imported the library.
// three.js has one per build file, so a build that splits three.core.js from
// three.webgpu.js still counts both: "__THREE__" is in the core alone and the
// renderer's message prefix in the WebGPU build alone.
// ScrollTrigger is found by its pin spacer class and the whole text of its
// registration warning, never by its name or the bare call: app code that
// receives the plugin from a dynamic import keeps the property name
// "ScrollTrigger" through minification, and app code that registers it holds
// "gsap.registerPlugin(ScrollTrigger)" in any build that keeps local names.
export const DEFERRED_LIBRARIES = [
  { name: "three.js", signatures: ["__THREE__", "THREE.WebGPURenderer"] },
  { name: ENGINE_ENTRY, signatures: [ENGINE_MARKER] },
  { name: SKY_CATALOGUE, signatures: [SKY_SIGNATURE] },
  { name: "GSAP", signatures: ["GSAP target"] },
  {
    name: "ScrollTrigger",
    signatures: ["pin-spacer", "Please gsap.registerPlugin(ScrollTrigger)"],
  },
  { name: "SplitText", signatures: ["autoSplit", "deepSlice"] },
  { name: "Lenis", signatures: ["lenis-smooth"] },
  { name: "PostHog", signatures: ["__POSTHOG", "posthog-js"] },
  { name: "Radix Dialog", signatures: ["DialogContent"] },
  { name: "cmdk", signatures: ["cmdk-item"] },
];

const SCRIPT_TAG = /<script\b[^>]*>/gi;
const SRC_ATTRIBUTE = /\ssrc="([^"]+)"/i;
const NOMODULE_ATTRIBUTE = /\snomodule(?:[\s=>]|$)/i;

// Module scripts a modern browser downloads for this HTML. Scripts marked
// nomodule are polyfills that modern browsers skip.
export function firstLoadScripts(html) {
  const sources = [];
  for (const tag of html.match(SCRIPT_TAG) ?? []) {
    const src = tag.match(SRC_ATTRIBUTE)?.[1];
    if (!src || NOMODULE_ATTRIBUTE.test(tag)) continue;
    if (!sources.includes(src)) sources.push(src);
  }
  return sources;
}

// "/_next/static/chunks/a.js?dpl=x" to "chunks/a.js", decoded. Null for a
// script that is not part of the build output.
export function staticFilePath(src) {
  const prefix = "/_next/static/";
  if (!src.startsWith(prefix)) return null;
  const path = src.slice(prefix.length).split(/[?#]/)[0] ?? "";
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function gzipBytes(content) {
  return gzipSync(content, { level: 9 }).length;
}

export function findDeferredLibraries(source) {
  return DEFERRED_LIBRARIES.filter(({ signatures }) =>
    signatures.some((signature) => source.includes(signature)),
  ).map(({ name }) => name);
}

// What src/lib/load-motion.ts loads after first content. Each must be found
// in some built chunk, or a signature that stopped matching would let the
// first-load check pass without testing anything.
export const MOTION_LIBRARIES = ["GSAP", "ScrollTrigger", "SplitText", "Lenis"];

// The names no chunk was detected as. chunks is a list of { libraries }, with
// libraries from findDeferredLibraries.
export function missingDeferred(chunks, names) {
  return names.filter(
    (name) => !chunks.some(({ libraries }) => libraries.includes(name)),
  );
}

// Page routes come from app-path-routes-manifest.json ("/work/[slug]/page" to
// "/work/[slug]"); prerendered routes from prerender-manifest.json. A page
// with no prerendered output cannot be measured and breaks pillar 1.
export function pageRoutes(appPathRoutes) {
  return Object.entries(appPathRoutes)
    .filter(([appPath]) => appPath.endsWith("/page"))
    .map(([, route]) => route);
}

export function unprerenderedPages(pages, prerenderRoutes) {
  const covered = new Set();
  for (const [route, entry] of Object.entries(prerenderRoutes)) {
    covered.add(route);
    if (entry?.srcRoute) covered.add(entry.srcRoute);
  }
  return pages.filter((page) => !covered.has(page));
}

export function htmlPathFor(route) {
  return `server/app${route === "/" ? "/index" : route}.html`;
}

// Every built JavaScript file under dir, at any depth. Turbopack writes chunks
// flat today, but a chunk in a subfolder must still count toward the 3D
// payload rather than pass unmeasured.
export function chunkFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => join(entry.parentPath, entry.name));
}

// REQ-PERF-05: about 8 MB on desktop and 3 MB on phones, counted in MiB.
export const PAYLOAD_LIMIT_BYTES = {
  desktop: 8 * 1024 * 1024,
  phone: 3 * 1024 * 1024,
};

// Sorts the built chunks into the 3D payload's JavaScript. chunks is a list
// of { bytes, libraries }, with libraries from findDeferredLibraries. Chunks
// with three.js load on tiers 1 and 2 only. The engine's entry loads on every
// tier, because it is the code that decides the tier; it must never share a
// chunk with three.js, or tier 3 would download three.js with it. The sky
// catalogue loads on every tier too, under the same rule (skyShared).
export function engineChunkBytes(chunks) {
  const totals = {
    three: { count: 0, bytes: 0 },
    entry: { count: 0, bytes: 0 },
    sky: { count: 0, bytes: 0 },
    shared: 0,
    skyShared: 0,
  };
  for (const { bytes, libraries } of chunks) {
    const hasThree = libraries.includes("three.js");
    const hasEntry = libraries.includes(ENGINE_ENTRY);
    const hasSky = libraries.includes(SKY_CATALOGUE);
    if (hasThree) {
      totals.three.count += 1;
      totals.three.bytes += bytes;
      if (hasEntry) totals.shared += 1;
      if (hasSky) totals.skyShared += 1;
    } else {
      if (hasEntry) {
        totals.entry.count += 1;
        totals.entry.bytes += bytes;
      }
      if (hasSky) {
        totals.sky.count += 1;
        totals.sky.bytes += bytes;
      }
    }
  }
  return totals;
}

// manifest: { payloads: [{ tier, device, files: ["public/..."] }] }, written
// by the engine. sizeOf returns a file's size in bytes, or null when
// the file is missing. engineJsBytes is the gzip size of the built chunks
// that hold three.js and the runtime; tiers 1 and 2 download them, tier 3
// does not. entryJsBytes is the gzip size of the engine's entry chunks, which
// every tier downloads, and skyJsBytes that of the sky catalogue's chunks,
// which every tier downloads too.
export function payloadFailures(
  manifest,
  sizeOf,
  engineJsBytes = 0,
  entryJsBytes = 0,
  skyJsBytes = 0,
) {
  const failures = [];
  const totals = [];
  const payloads = Array.isArray(manifest?.payloads) ? manifest.payloads : [];
  if (payloads.length === 0) failures.push("engine manifest lists no payloads");

  for (const { tier, device, files } of payloads) {
    const limit = PAYLOAD_LIMIT_BYTES[device];
    if (limit === undefined) {
      failures.push(`tier ${tier}: unknown device "${device}"`);
      continue;
    }
    let bytes =
      entryJsBytes +
      skyJsBytes +
      (tier === 1 || tier === 2 ? engineJsBytes : 0);
    for (const file of Array.isArray(files) ? files : []) {
      const size = sizeOf(file);
      if (size === null)
        failures.push(`tier ${tier} ${device}: missing ${file}`);
      else bytes += size;
    }
    totals.push({ tier, device, bytes, limit });
    if (bytes > limit) {
      failures.push(
        `tier ${tier} ${device}: 3D payload ${formatKb(bytes)} is over ${formatKb(limit)}`,
      );
    }
  }
  return { failures, totals };
}

export function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
