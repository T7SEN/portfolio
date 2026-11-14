// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFERRED_LIBRARIES,
  ENGINE_ENTRY,
  ENGINE_MARKER,
  FIRST_LOAD_LIMIT_BYTES,
  MOTION_LIBRARIES,
  SKY_CATALOGUE,
  chunkFiles,
  engineChunkBytes,
  findDeferredLibraries,
  firstLoadScripts,
  gzipBytes,
  htmlPathFor,
  missingDeferred,
  pageRoutes,
  payloadFailures,
  staticFilePath,
  unprerenderedPages,
} from "./budget-lib.mjs";

const read = (path) => readFileSync(`node_modules/${path}`, "utf8");

describe("first-load scripts", () => {
  it("REQ-PERF-04 lists module scripts once, in order, and skips nomodule polyfills", () => {
    const html = [
      '<script src="/_next/static/chunks/a.js" async=""></script>',
      "<script>self.__next_f=[]</script>",
      '<script src="/_next/static/chunks/polyfill.js" noModule=""></script>',
      '<script src="/_next/static/chunks/b.js" async=""></script>',
      '<script src="/_next/static/chunks/a.js" async=""></script>',
    ].join("");
    expect(firstLoadScripts(html)).toEqual([
      "/_next/static/chunks/a.js",
      "/_next/static/chunks/b.js",
    ]);
  });

  it("REQ-PERF-04 maps script URLs to build files without query strings", () => {
    expect(staticFilePath("/_next/static/chunks/a.js")).toBe("chunks/a.js");
    expect(staticFilePath("/_next/static/chunks/a.js?dpl=dpl_123")).toBe(
      "chunks/a.js",
    );
    expect(staticFilePath("/_next/static/chunks/%5Bslug%5D-a.js")).toBe(
      "chunks/[slug]-a.js",
    );
    expect(
      staticFilePath("https://challenges.cloudflare.com/turnstile/v0/api.js"),
    ).toBeNull();
  });

  it("REQ-PERF-04 measures gzip size, not raw size", () => {
    const repeated = "a".repeat(10_000);
    expect(gzipBytes(repeated)).toBeLessThan(200);
    expect(FIRST_LOAD_LIMIT_BYTES).toBe(204_800);
  });
});

describe("deferred library signatures", () => {
  it.each([
    ["three/build/three.core.js", "three.js"],
    ["three/build/three.webgpu.js", "three.js"],
    ["gsap/dist/gsap.min.js", "GSAP"],
    ["gsap/gsap-core.js", "GSAP"],
    ["gsap/dist/ScrollTrigger.min.js", "ScrollTrigger"],
    ["gsap/dist/SplitText.min.js", "SplitText"],
    ["gsap/SplitText.js", "SplitText"],
    ["lenis/dist/lenis.mjs", "Lenis"],
    ["posthog-js/dist/module.js", "PostHog"],
    ["@radix-ui/react-dialog/dist/index.mjs", "Radix Dialog"],
    ["cmdk/dist/index.mjs", "cmdk"],
  ])("REQ-PERF-04 finds %s as %s", (path, name) => {
    expect(findDeferredLibraries(read(path))).toContain(name);
  });

  it("REQ-PERF-04 finds ScrollTrigger in the module build the bundler takes", () => {
    expect(findDeferredLibraries(read("gsap/ScrollTrigger.js"))).toContain(
      "ScrollTrigger",
    );
  });

  it("REQ-PERF-04 does not take app code that names a loaded plugin for the plugin", () => {
    // Minified app code that destructures the plugins from a dynamic import.
    expect(
      findDeferredLibraries(
        "let{gsap:t,ScrollTrigger:r,SplitText:n}=await e;r.update()",
      ),
    ).toEqual([]);
  });

  it("REQ-PERF-04 does not take app code that registers ScrollTrigger for the plugin", () => {
    expect(
      findDeferredLibraries("gsap.registerPlugin(ScrollTrigger);"),
    ).toEqual([]);
    expect(
      findDeferredLibraries(readFileSync("src/lib/load-motion.ts", "utf8")),
    ).toEqual([]);
  });

  it("REQ-PERF-04 finds nothing in React DOM, which may load first", () => {
    expect(
      findDeferredLibraries(
        read("react-dom/cjs/react-dom-client.production.js"),
      ),
    ).toEqual([]);
  });
});

describe("libraries loaded after first content", () => {
  it("REQ-PERF-04 names every library the motion loader imports", () => {
    const loader = readFileSync("src/lib/load-motion.ts", "utf8");
    for (const specifier of [
      "gsap",
      "gsap/ScrollTrigger",
      "gsap/SplitText",
      "lenis",
    ]) {
      expect(loader).toContain(`import("${specifier}")`);
    }
    expect(MOTION_LIBRARIES).toEqual([
      "GSAP",
      "ScrollTrigger",
      "SplitText",
      "Lenis",
    ]);
    const known = DEFERRED_LIBRARIES.map(({ name }) => name);
    for (const name of MOTION_LIBRARIES) expect(known).toContain(name);
  });

  it("REQ-PERF-04 names the expected libraries no chunk was detected as", () => {
    const chunks = [
      { libraries: ["GSAP", "ScrollTrigger"] },
      { libraries: [] },
      { libraries: ["Lenis"] },
    ];
    expect(missingDeferred(chunks, MOTION_LIBRARIES)).toEqual(["SplitText"]);
    expect(missingDeferred([], MOTION_LIBRARIES)).toEqual(MOTION_LIBRARIES);
    expect(
      missingDeferred(
        [...chunks, { libraries: ["SplitText"] }],
        MOTION_LIBRARIES,
      ),
    ).toEqual([]);
  });

  it("REQ-PERF-04 detects each motion library in the module build the bundler takes", () => {
    const builds = {
      GSAP: "gsap/gsap-core.js",
      ScrollTrigger: "gsap/ScrollTrigger.js",
      SplitText: "gsap/SplitText.js",
      Lenis: "lenis/dist/lenis.mjs",
    };
    const chunksWithout = (left) =>
      Object.entries(builds)
        .filter(([name]) => name !== left)
        .map(([, path]) => ({ libraries: findDeferredLibraries(read(path)) }));
    expect(missingDeferred(chunksWithout(null), MOTION_LIBRARIES)).toEqual([]);
    expect(
      missingDeferred(chunksWithout("ScrollTrigger"), MOTION_LIBRARIES),
    ).toEqual(["ScrollTrigger"]);
  });
});

describe("engine entry", () => {
  it("REQ-PERF-04 REQ-PERF-05 finds the engine entry by the string the controller writes on its canvas", () => {
    expect(readFileSync("src/engine/controller.ts", "utf8")).toContain(
      `const CANVAS_MARK = "${ENGINE_MARKER}";`,
    );
    expect(
      findDeferredLibraries(`n.dataset.engine="${ENGINE_MARKER}"`),
    ).toEqual([ENGINE_ENTRY]);
  });

  it("REQ-PERF-05 counts three.js chunks and entry chunks apart and flags a chunk that holds both", () => {
    expect(
      engineChunkBytes([
        { bytes: 300, libraries: ["three.js"] },
        { bytes: 200, libraries: ["three.js"] },
        { bytes: 7, libraries: [ENGINE_ENTRY] },
        { bytes: 90, libraries: ["GSAP"] },
        { bytes: 50, libraries: [] },
      ]),
    ).toEqual({
      three: { count: 2, bytes: 500 },
      entry: { count: 1, bytes: 7 },
      sky: { count: 0, bytes: 0 },
      shared: 0,
      skyShared: 0,
    });
    expect(
      engineChunkBytes([{ bytes: 300, libraries: ["three.js", ENGINE_ENTRY] }]),
    ).toEqual({
      three: { count: 1, bytes: 300 },
      entry: { count: 0, bytes: 0 },
      sky: { count: 0, bytes: 0 },
      shared: 1,
      skyShared: 0,
    });
  });

  it("REQ-PERF-05 D-146 finds the sky catalogue by its data alone, counts its chunk for every tier and flags one that holds three.js", () => {
    expect(
      findDeferredLibraries(
        'e.s(["SKY_CONSTELLATIONS",0,["And","Ant","Aps","Aql","Aqr"]])',
      ),
    ).toEqual([SKY_CATALOGUE]);
    // App code that reads the list by name is not the data.
    expect(findDeferredLibraries("t.SKY_CONSTELLATIONS[e]")).toEqual([]);
    expect(
      engineChunkBytes([
        { bytes: 20, libraries: [SKY_CATALOGUE] },
        { bytes: 7, libraries: [ENGINE_ENTRY] },
      ]),
    ).toEqual({
      three: { count: 0, bytes: 0 },
      entry: { count: 1, bytes: 7 },
      sky: { count: 1, bytes: 20 },
      shared: 0,
      skyShared: 0,
    });
    expect(
      engineChunkBytes([{ bytes: 300, libraries: ["three.js", SKY_CATALOGUE] }])
        .skyShared,
    ).toBe(1);
  });
});

describe("routes", () => {
  it("REQ-PERF-04 takes pages from the app path manifest and skips route handlers", () => {
    expect(
      pageRoutes({
        "/page": "/",
        "/work/[slug]/page": "/work/[slug]",
        "/api/contact/route": "/api/contact",
      }),
    ).toEqual(["/", "/work/[slug]"]);
  });

  it("REQ-PERF-04 reports a page with no prerendered output", () => {
    expect(
      unprerenderedPages(["/", "/work/[slug]", "/contact"], {
        "/": { srcRoute: "/" },
        "/work/coup-online": { srcRoute: "/work/[slug]" },
      }),
    ).toEqual(["/contact"]);
  });

  it("REQ-PERF-04 maps routes to prerendered HTML files", () => {
    expect(htmlPathFor("/")).toBe("server/app/index.html");
    expect(htmlPathFor("/work/coup-online")).toBe(
      "server/app/work/coup-online.html",
    );
  });
});

describe("built chunks", () => {
  it("REQ-PERF-05 lists chunks in subfolders as well as at the top level", () => {
    const dir = mkdtempSync(join(tmpdir(), "chunks-"));
    try {
      mkdirSync(join(dir, "nested", "deeper"), { recursive: true });
      writeFileSync(join(dir, "a.js"), "");
      writeFileSync(join(dir, "nested", "b.js"), "");
      writeFileSync(join(dir, "nested", "deeper", "c.js"), "");
      writeFileSync(join(dir, "style.css"), "");
      mkdirSync(join(dir, "folder.js"));
      const found = chunkFiles(dir)
        .map((path) => relative(dir, path).split(sep).join("/"))
        .sort();
      expect(found).toEqual(["a.js", "nested/b.js", "nested/deeper/c.js"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("3D payload", () => {
  const sizes = {
    "public/a.bin": 2 * 1024 * 1024,
    "public/b.bin": 2 * 1024 * 1024,
  };
  const sizeOf = (file) => sizes[file] ?? null;

  it("REQ-PERF-05 passes payloads inside their device limit", () => {
    const result = payloadFailures(
      {
        payloads: [
          {
            tier: 1,
            device: "desktop",
            files: ["public/a.bin", "public/b.bin"],
          },
        ],
      },
      sizeOf,
    );
    expect(result.failures).toEqual([]);
    expect(result.totals[0]?.bytes).toBe(4 * 1024 * 1024);
  });

  it("REQ-PERF-05 fails a phone payload over 3 MB, a missing file and an unknown device", () => {
    const result = payloadFailures(
      {
        payloads: [
          { tier: 2, device: "phone", files: ["public/a.bin", "public/b.bin"] },
          { tier: 2, device: "tablet", files: [] },
          { tier: 1, device: "desktop", files: ["public/missing.bin"] },
        ],
      },
      sizeOf,
    );
    expect(result.failures).toHaveLength(3);
  });

  it("REQ-PERF-05 fails an empty manifest", () => {
    expect(payloadFailures({}, sizeOf).failures).toHaveLength(1);
  });

  it("REQ-PERF-05 adds the built three.js chunks to tiers 1 and 2 only", () => {
    const engineJs = 500 * 1024;
    const result = payloadFailures(
      {
        payloads: [
          { tier: 1, device: "desktop", files: ["public/a.bin"] },
          { tier: 2, device: "phone", files: ["public/a.bin"] },
          { tier: 3, device: "phone", files: ["public/a.bin"] },
        ],
      },
      sizeOf,
      engineJs,
    );
    expect(result.totals.map((total) => total.bytes)).toEqual([
      2 * 1024 * 1024 + engineJs,
      2 * 1024 * 1024 + engineJs,
      2 * 1024 * 1024,
    ]);
  });

  it("REQ-PERF-05 adds the engine entry chunks to every tier", () => {
    const engineJs = 500 * 1024;
    const entryJs = 3 * 1024;
    const result = payloadFailures(
      {
        payloads: [
          { tier: 1, device: "desktop", files: [] },
          { tier: 2, device: "phone", files: [] },
          { tier: 3, device: "phone", files: ["public/a.bin"] },
        ],
      },
      sizeOf,
      engineJs,
      entryJs,
    );
    expect(result.failures).toEqual([]);
    expect(result.totals.map((total) => total.bytes)).toEqual([
      engineJs + entryJs,
      engineJs + entryJs,
      2 * 1024 * 1024 + entryJs,
    ]);
  });

  it("REQ-PERF-05 D-146 adds the sky catalogue's chunks to every tier", () => {
    const engineJs = 500 * 1024;
    const entryJs = 3 * 1024;
    const skyJs = 20 * 1024;
    const result = payloadFailures(
      {
        payloads: [
          { tier: 1, device: "desktop", files: [] },
          { tier: 3, device: "phone", files: [] },
        ],
      },
      sizeOf,
      engineJs,
      entryJs,
      skyJs,
    );
    expect(result.totals.map((total) => total.bytes)).toEqual([
      engineJs + entryJs + skyJs,
      entryJs + skyJs,
    ]);
  });
});
