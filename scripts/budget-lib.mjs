import { gzipSync } from "node:zlib";

// REQ-PERF-04: about 200 KB gzip of JavaScript before any 3D, counted in KiB.
export const FIRST_LOAD_LIMIT_BYTES = 200 * 1024;

// Strings that survive minification in each library that must load after
// first content. Each one was checked against the pinned package source and
// against a Turbopack production build that imported the library.
export const DEFERRED_LIBRARIES = [
  { name: "three.js", signatures: ["__THREE__"] },
  { name: "GSAP", signatures: ["GSAP target"] },
  { name: "ScrollTrigger", signatures: ["ScrollTrigger"] },
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

// REQ-PERF-05: about 8 MB on desktop and 3 MB on phones, counted in MiB.
export const PAYLOAD_LIMIT_BYTES = {
  desktop: 8 * 1024 * 1024,
  phone: 3 * 1024 * 1024,
};

// manifest: { payloads: [{ tier, device, files: ["public/..."] }] }, written
// by the engine from P2. sizeOf returns a file's size in bytes, or null when
// the file is missing. engineJsBytes is the gzip size of the built chunks
// that hold three.js and the engine; tiers 1 and 2 download them, tier 3 does not.
export function payloadFailures(manifest, sizeOf, engineJsBytes = 0) {
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
    let bytes = tier === 1 || tier === 2 ? engineJsBytes : 0;
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
