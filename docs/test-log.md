# Test log

Results are written only after the command ran, copied from its output. Failures are recorded too. Each entry names the requirements it covers.

## 2026-11-09 P0 WebGPU probe, headless

- Environment: Windows 11 Pro, Node 26.12.1, Playwright 1.65.0, Chrome for Testing 158.0.8127.18 (channel chromium, new headless mode), NVIDIA GeForce RTX 4060 Ti, driver 32.0.16.2101
- Command: pnpm e2e (desktop project, e2e/webgpu-probe.spec.ts)
- Result: secure context true; navigator.gpu present; requestAdapter returned an adapter: vendor nvidia, architecture lovelace, device and description empty, isFallbackAdapter false, 22 features. WebGL2 context available (renderer string "WebKit WebGL").
- Covers: REQ-TIER-01 (probe input), rule D6
- Notes: headless WebGPU reaches the real GPU on this machine, so tier 1 checks may run headless here. Frame rates stay headed (REQ-PERF-06).

## 2026-11-09 P0 WebGPU probe, headed

- Environment: as above, headed window
- Command: pnpm e2e:gpu
- Result: identical to the headless run: adapter vendor nvidia, architecture lovelace, isFallbackAdapter false, 22 features; WebGL2 available.
- Covers: REQ-TIER-01 (probe input), rule D6

## 2026-11-09 P0 engine boundary, deliberate violation

- Command: pnpm exec eslint src/engine/violation.ts (a temporary file importing @/app/layout and ../app/page)
- Result: 3 errors, exit 1: no-restricted-imports on the alias import; import/no-restricted-paths on the alias and the relative import. The file was then deleted.
- Covers: REQ-ENG-02

## 2026-11-09 P0 budget check, deliberate violation

- Command: pnpm build, then pnpm budget, with a temporary client component on / importing three/webgpu, gsap, gsap/ScrollTrigger, gsap/SplitText, lenis, posthog-js, @radix-ui/react-dialog and cmdk
- Result, first run: FAIL. / had 6 scripts, 531.3 KB gzip, over the 200.0 KB limit; found three.js, GSAP, ScrollTrigger, Lenis, PostHog and cmdk, but not SplitText or Radix Dialog.
- Change: the SplitText and Radix Dialog signatures were replaced with strings that survive minification (autoSplit or deepSlice; DialogContent).
- Result, second run on the same build: FAIL as intended, all eight libraries found. The component was then deleted and the app rebuilt: / 5 scripts, 131.5 KB, ok.
- Covers: REQ-PERF-04

## 2026-11-09 P0 gate, attempt 1

- Environment: Windows 11 Pro, Node 26.12.1, pnpm 12.18.0, Chrome for Testing 158.0.8127.18
- Commands, in order: pnpm typecheck (exit 0), pnpm lint (exit 0), pnpm format:check (exit 1: README.md not formatted). Stopped there.
- Notes: README.md formatted with pnpm format, then the whole gate ran again.

## 2026-11-09 P0 gate, attempt 2

- pnpm typecheck: exit 0
- pnpm lint: exit 0, no warnings
- pnpm format:check: exit 0, 29 files
- pnpm test: exit 0, 3 files, 37 tests passed
- pnpm build: exit 0, routes / and /_not-found, both static
- pnpm e2e: exit 0, 9 passed, 1 skipped (the WebGPU probe on the phone project, by design)
- pnpm budget: exit 0; /, /_global-error and /_not-found each 5 scripts, 131.5 KB gzip; no 3D payload yet
- Covers: REQ-ENG-02, REQ-ENG-04, REQ-PERF-04, REQ-SEC-01, REQ-CNT-01, REQ-A11Y-01 (home page only), REQ-TIER-01 (probe input)

## 2026-11-09 P0 dev-only engine page on the development server

- Command: next dev on port 3201, one request to /engine, then the server stopped by its process IDs
- Result: HTTP 200 with the page text. With the production build, /engine returns 404 (e2e/dev-page.spec.ts).
- Covers: REQ-ENG-04

## 2026-11-09 P0 review fixes

- @webgpu/types 0.1.74: `pnpm exec tsc --noEmit --skipLibCheck false` reported 52 errors, 50 of them between @webgpu/types and TypeScript 6.0.3's lib.dom.d.ts. Package removed; the same command then reported 0 errors.
- Engine boundary: the rules now also cover import(), require(), relative paths to tokens and JavaScript files in src/engine; eslint.config.test.ts grew to 30 tests, all passing.
- Budget check, deliberate violation 2: a temporary client component loaded three/webgpu through import() in an effect. pnpm budget: / 6 scripts, 131.8 KB gzip, no deferred library in the first load; one built chunk holding three.js, 291.6 KB gzip; FAIL because three.js was in the build with no src/engine/manifest.json, exit 1, as intended. The component was then deleted and the app rebuilt.
- Covers: REQ-ENG-02, REQ-PERF-04, REQ-PERF-05

## 2026-11-09 P0 gate rerun after the review

- pnpm typecheck: exit 0
- pnpm lint: exit 0, no warnings
- pnpm format:check: exit 0, 29 files
- pnpm test: exit 0, 3 files, 52 tests passed
- pnpm build: exit 0, routes / and /_not-found, both static
- pnpm e2e: exit 0, 9 passed, 1 skipped (the WebGPU probe on the phone project, by design); headless probe result unchanged
- pnpm budget: exit 0; ok budget: 3 routes, largest first load 131.5 KB, no 3D payload yet (docs/results/2026-11-09-budget.md)
- Covers: REQ-ENG-02, REQ-ENG-04, REQ-PERF-04, REQ-PERF-05, REQ-SEC-01, REQ-CNT-01, REQ-A11Y-01 (home page only), REQ-TIER-01 (probe input)

## 2026-11-09 First Vercel preview build of main

- Environment: Vercel build in iad1, 2 cores and 8 GB, Vercel CLI 65.11.0; branch main, commit d7f3fed; no build cache yet; project settings Framework Preset Next.js with no overrides, Node.js Version 26.x; ENABLE_EXPERIMENTAL_COREPACK set to 1 for Production and Preview
- Source: the build log, read by T7SEN and pasted into the session
- pnpm: the log shows "Detected ENABLE_EXPERIMENTAL_COREPACK=1 and "pnpm@12.18.0" in package.json", Corepack downloading pnpm 12.18.0 for linux-x64, and "Done in 6.1s using pnpm v12.18.0". The lockfile passed pnpm's supply-chain policies (549 entries) and was up to date; 462 packages installed, and the listed dependency versions match package.json.
- Build: pnpm run build ran next build; Next.js 16.4.5 (Turbopack) compiled in 3.8 s, TypeScript finished, 3 of 3 static pages generated, routes / and /_not-found both static; "Deployment completed".
- Node: the log does not print the Node.js version. Vercel's docs say to run node -v in the Build Command to see it (vercel.com/docs/functions/runtimes/node-js/node-js-versions, read 9 Nov 2026). Not confirmed by a log yet.
- Covers: REQ-OPS-03 (pnpm confirmed; Node open)

## 2026-11-09 Node version in the Vercel build log

- Environment: Vercel preview build of main, commit 41f5121, the first build with the build script `node -v && next build` (decision D-024)
- Source: two lines of the build log, read by T7SEN and pasted into the session
- Result: "$ node -v && next build" followed by "v26.13.0". Locally the PC runs Node 26.12.1: a minor drift within 26.x, which is expected; only a major drift is a parity failure (A10).
- Covers: REQ-OPS-03 (Node 26.x confirmed; pnpm 12.18.0 confirmed by the first preview build above)

## 2026-11-09 P1 readiness review: guard checks and gate

- Environment: Windows 11 Pro, Node 26.12.1, pnpm 12.18.0, Chrome for Testing 158.0.8127.18
- Baseline at fe5d779, before any change: typecheck, lint, format:check (29 files), test (3 files, 52 tests), build, e2e (9 passed, 1 skipped), budget (3 routes, 131.5 KB each) and e2e:gpu (1 passed, the same adapter as headless) all exit 0.
- Budget check run against test build folders outside the repo: a 294.2 KB first-load script failed ("over 200.0 KB"); a first-load script holding three.js failed; a top-level three.js chunk with no engine manifest failed. A three.js chunk in a subfolder passed, which was wrong (decision D-026).
- Engine boundary, ESLint lintText with the repo config: @/app/layout, ../app/layout, @/tokens/../app/layout, @/engine/../app/layout and import("@/tokens/../app/layout") failed in src/engine; @/tokens/colors and three/webgpu passed. In src/tokens/colors.ts, @/app/layout and react passed, which was wrong (decision D-025).
- Env check with a test .env.local holding marker values: the output held only ok and missing lines and none of the values; --strict exited 1.
- After the fixes for D-025 and D-026: the subfolder chunk fails the budget check; typecheck, lint, format:check (29 files), test (3 files, 70 tests), build, e2e (9 passed, 1 skipped) and budget (131.5 KB per route, no 3D payload yet) all exit 0.
- Covers: REQ-ENG-02, REQ-PERF-04, REQ-PERF-05, REQ-SEC-01

## 2026-11-09 P1 gate, run 1

- Environment: Windows 11 Pro, Node 26.12.1, pnpm 12.18.0, Chrome for Testing 158.0.8127.18 headless (Playwright 1.65.0)
- pnpm typecheck: exit 0
- pnpm lint: exit 0
- pnpm format:check: exit 0, 91 files
- pnpm test: exit 0, 11 files, 282 tests
- pnpm build: exit 0; 13 static pages: /, /_not-found, /about, /contact, /icon.svg, /v1, /work and the five study pages prerendered through generateStaticParams
- pnpm e2e: exit 0, 106 passed, 4 skipped (the WebGPU probe on the phone project, and the three vitals tests on the desktop project, both by design)
- Lab vitals, phone project, Slow 4G (latency 562.5 ms, 180,000 and 84,375 bytes/s) and a 4x CPU slowdown, run alongside the other tests: / LCP 1648 ms, CLS 0.009; /work LCP 1616 ms, CLS 0.009; /work/making-of LCP 1652 ms, CLS 0.002
- pnpm budget: exit 0; 12 routes, largest first load 134.6 KB (131.8 KB on /_global-error), no 3D payload yet
- Covers: REQ-CNT-01, REQ-CNT-02, REQ-CNT-03, REQ-CNT-04, REQ-CNT-05, REQ-CNT-06, REQ-CNT-07, REQ-CNT-08, REQ-CNT-10, REQ-CNT-11, REQ-CNT-12, REQ-NAV-01, REQ-I18N-01, REQ-I18N-02, REQ-A11Y-01, REQ-A11Y-02, REQ-A11Y-06, REQ-PERF-01, REQ-PERF-03, REQ-PERF-04, REQ-ENG-02

## 2026-11-09 P1 review fixes

- The served stylesheet held at least 26 physical left and right rules, such as text-align: right, taken from strings in the class scan's own tests, because Tailwind read every file git does not ignore. After globals.css imported Tailwind with source(".."), the class scan run over the built stylesheet found 0, and text-align: right was gone. A browser test now runs that check on the served stylesheet (REQ-I18N-01).
- Skip intro on a 375 x 548 screen, measured on a production build with fonts loaded: its bottom edge sat at 541 px, 7 px inside the screen. After tighter hero spacing on screens 40rem tall or less: 532 px. On 375 x 667: 651 px; 375 x 740: 724 px; 375 x 812: 796 px (REQ-NAV-01).
- The class scan run over src after its new checks for arbitrary properties and uneven shorthands: ok, 58 files.

## 2026-11-09 P1 gate rerun, attempt 1

- pnpm typecheck, lint, format:check (91 files), test (11 files, 298 tests) and build: exit 0
- pnpm e2e: exit 1. Playwright could not load the class scan module from e2e/pages.spec.ts ("Cannot use 'import.meta' outside a module"), so no browser test ran. The checks moved into scripts/class-scan-lib.mjs, which uses no import.meta; scripts/class-scan.mjs keeps only the command line part.
- pnpm budget: exit 0, 134.6 KB

## 2026-11-09 P1 gate rerun, attempt 2

- Environment: as run 1
- pnpm typecheck: exit 0
- pnpm lint: exit 0
- pnpm format:check: exit 0, 92 files
- pnpm test: exit 0, 11 files, 298 tests
- pnpm build: exit 0, the same 13 static pages
- pnpm e2e: exit 0, 114 passed, 1 skipped (the WebGPU probe on the phone project, by design). New since run 1: the headline swap test (the h1 and the sub-line keep their place at 1280 and 375 px when the tier 1 and 2 line replaces the tier 3 line), the served stylesheet check, See the work and Skip intro on a 375 x 548 screen, and the 404 page (status, one h1, axe, skip link).
- Lab vitals, now in their own project after the others, one test at a time, same throttling: / LCP 1576 ms, CLS 0.009; /work LCP 1568 ms, CLS 0.009; /work/making-of LCP 1600 ms, CLS 0.002
- pnpm budget: exit 0; 12 routes, largest first load 134.6 KB, no 3D payload yet (docs/results/2026-11-09-budget.md)
- Covers: as run 1

## 2026-11-10 P2 tier 2 spike

- Environment: Windows 11 Pro, Node 26.12.1, Chrome for Testing 158.0.8127.18 headed (Playwright 1.65.0, channel chromium), viewport 1280 x 800, NVIDIA GeForce RTX 4060 Ti, driver 32.0.16.2101, display at 240 Hz. WebGL renderer string: ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti (0x00002803) Direct3D11 vs_5_0 ps_5_0, D3D11), so the real GPU, not a software renderer.
- Command: pnpm exec playwright test --config playwright.engine.config.ts (the development server on port 3102, started and stopped by the run; the page is /engine?backend=webgl&count=<n>)
- What ran: one per-particle simulation written in TSL (a noise field, a cursor force and a pull to one ring target per particle), built with compute(count) only, on the WebGL2 backend through forceWebGL, drawn as additive sprites. Three storage buffers: positions, velocities and targets.
- Result: 2 passed. After a 3 s warm-up, over a 10 s window of requestAnimationFrame intervals:
  - 100,000 particles: 2401 frames, median 4.20 ms, 95th percentile 4.30 ms
  - 250,000 particles: 2401 frames, median 4.20 ms, 95th percentile 4.30 ms
- Both counts sit on the display's 240 Hz ceiling, so the figures mean at least this fast. They do not show the GPU's limit or any difference between the two counts. The canvas was 1217 x 561 CSS px at a pixel ratio of 1, smaller than a full screen hero.
- Proof the simulation ran: the page reported the webgl2 backend and the count; the engine's own frame counter and the page's frame count both advanced by 2280 over the same 20 readouts; two screenshots 1 s apart differed; no page or console error.
- The same run was made five times while the spike was written and once more afterwards, with the same figures each time.
- Pass line: 30 fps or more at both counts (a median of 33.3 ms or less). Passed, so engine work continues on the shared simulation (REQ-ENG-05).
- Not measured here: frame times on WebGPU, a full screen canvas, a pixel ratio above 1, phones, and the paths tier 2 must not use (storage textures, atomics, reads of another particle).
- Covers: REQ-ENG-06, REQ-ENG-05, REQ-PERF-06

## 2026-11-10 P2 engine on the development page, headed

- Environment: as the spike entry. Primary display 1280 x 882 at 240 Hz, a second display at 75 Hz. Command: pnpm e2e:engine (playwright.engine.config.ts: the development server on port 3102, started and stopped by the run; e2e/gpu/frame-rate.spec.ts and e2e/gpu/lifecycle.spec.ts; the page is /engine with ?tier, ?count, ?calm and ?bare).
- Method: after a 3 s warm-up, 10 s of the page's own requestAnimationFrame intervals. Median and 95th percentile come from the engine's own probe functions. The engine's frameRate events are compared with the page's frame count over the same intervals and must agree within 3%. Pass lines: a median of 16.7 ms or less on tier 1, 33.3 ms or less on tier 2. The particle count in each line is the count asked for; the engine reports no count.
- Run 1, whole suite: exit 1; 14 passed, 1 failed, 2 skipped (the two still captures, which run only with CAPTURE_STILLS=1).
  - Failed: tier 2 forced, 100,000 particles on WebGL2: 10 frames, median 1004.10 ms. The engine reported 1.00 fps and the page's own frame count also gave 1.00 fps, so the browser was showing the window once a second. It was the first window of the run. The cause was not found.
  - Tier 2 forced, 250,000 particles on WebGL2: 2377 frames, median 4.20 ms, 95th percentile 4.30 ms (engine 237.45 fps, page 237.45 fps)
  - Tier 1 forced, 1,000,000 particles on WebGPU: 2388 frames, median 4.20 ms, 95th percentile 4.30 ms (engine 239.11 fps, page 239.12 fps)
  - No tier forced: the probe passed (reason probe-pass), tier 1, 1,000,000 particles: 2376 frames, median 4.20 ms, 95th percentile 4.30 ms (engine 237.18 fps, page 237.18 fps)
- Run 2, frame-rate spec only: exit 0; 4 passed.
  - Tier 2 forced, 100,000: 2388 frames, median 4.20 ms, 95th percentile 4.30 ms (238.68 fps)
  - Tier 2 forced, 250,000: 2384 frames, median 4.20 ms, 95th percentile 4.30 ms (238.11 fps)
  - Tier 1 forced, 1,000,000: 1311 frames, median 4.20 ms, 95th percentile 4.30 ms (131.78 fps). The frames that came kept the 240 Hz interval, but only 1311 came in 10 s, so the window was not shown for part of the time.
  - No tier forced, probe-pass, tier 1, 1,000,000: 2397 frames, median 4.20 ms, 95th percentile 4.30 ms (239.73 fps)
- Reading: every case that ran undisturbed sits on the 240 Hz ceiling, so the figures mean at least this fast and show no difference between the counts or the backends. The headed window's own frame cadence is disturbed at times on this desktop (1 fps once, a gap once; runs made while the engine was written also saw about 143 fps for the lightest and the heaviest case alike). The field's load does not explain it and the cause is not established.
- Lifecycle, run 1, all passed:
  - A WebGL2 context lost on tier 2 ended on tier 3 with reason device-lost and no canvas. A WebGPU device lost on tier 1 (the GPU process crashed through the browser's debugging protocol, in a browser of its own) rebuilt once as tier 2 on a new canvas with reason device-lost. three.js prints one console error on each loss.
  - Calm froze the field to one frame on tier 1 and on tier 2 and let it go again (share of lit pixels in the frozen frame: 0.4984 and 0.3804).
  - Tiers 1, 2, 3 and 1 again on one host element: each backend drew on a canvas of its own.
  - Leaving the page disposed the tier 1 and the tier 2 field with no console error and no warning afterwards.
  - A resize from 1217 x 560 to 937 x 490 redrew the calm field at its new size on both tiers.
  - Slow frames (30 ms, made by the test) lowered the drawing buffer's pixel ratio from 1 to 0.75 on tier 2, and fast frames raised it to 1 again. On tier 1 the test printed "ratio 1, then not restored" and passed.
- Not measured: phones, Firefox, Safari, memory, a display slower than 240 Hz, a pixel ratio above 1.
- Covers: REQ-ENG-05, REQ-ENG-06, REQ-ENG-07, REQ-ENG-08, REQ-TIER-01, REQ-TIER-04, REQ-TIER-05, REQ-PERF-06, REQ-A11Y-03

## 2026-11-10 P2 gate, run 1

- Environment: Windows 11 Pro, Node 26.12.1, pnpm 12.18.0, Chrome for Testing 158.0.8127.18 headless (Playwright 1.65.0)
- pnpm typecheck: exit 0
- pnpm lint: exit 0
- pnpm format:check: exit 0, 130 files
- pnpm test: exit 0, 19 files, 500 tests
- pnpm build: exit 0, the same 13 static pages as P1
- pnpm e2e: exit 0, 139 passed, 4 skipped by design (the WebGPU probe on the phone project; the phone tier test on the desktop project; the two desktop tier tests on the phone project). 143 tests in 7 files.
  - Tier choice on the desktop project with nothing forced: tier 1, reason probe-pass (headless, the real adapter, 14 workers). The gate accepts tier 1 or tier 2 here and asserts no frame rate.
  - Order on the home page: desktop first contentful paint 816 ms, three.js first requested 2176 ms, ready 4090 ms; phone first contentful paint 348 ms, three.js first requested 361 ms, ready 687 ms.
  - Reduced motion: one still frame, two screenshots 600 ms apart identical on the first pair; share of lit pixels 0.4575 on desktop and 0.7000 on phone.
- Lab vitals, phone-vitals project, same throttling as P1, measured on / until the field has faded in plus 1 s: / LCP 1588 ms, CLS 0.009, the field ready (tier 2, reason phone) by 6817 ms; /work LCP 1556 ms, CLS 0.009; /work/making-of LCP 1568 ms, CLS 0.002
- pnpm budget: exit 0; 12 routes, largest first load 136.5 KB on / (136.1 KB on the other pages, 131.8 KB on /_global-error); 3D payload within limits (docs/results/2026-11-10-budget.md)
- Covers: REQ-ENG-01, REQ-ENG-02, REQ-ENG-07, REQ-ENG-08, REQ-TIER-01, REQ-TIER-02, REQ-TIER-03, REQ-CNT-02, REQ-CNT-10, REQ-PERF-03, REQ-PERF-04, REQ-PERF-05, REQ-PERF-07, REQ-A11Y-01, REQ-A11Y-03, and the P1 list

## 2026-11-10 P2 home page on the production build, headed

- Environment: as the development page entry. Command: pnpm e2e:gpu (playwright.gpu.config.ts: next start on port 3101, started and stopped by the run, on the build of gate run 1; e2e/headed and e2e/webgpu-probe.spec.ts; one worker).
- Result: exit 0; 13 passed.
- Frame rates on /, same method and pass lines as on the development page:
  - Tier 1 (probe-pass), 1,000,000 particles, viewport 1280 x 800, canvas 1265 x 800: 2394 frames, median 4.20 ms, 95th percentile 4.30 ms (239.22 fps)
  - Tier 1 (probe-pass), 1,000,000 particles, viewport 1920 x 1080, canvas 1905 x 1080: 2398 frames, median 4.20 ms, 95th percentile 4.30 ms (239.77 fps). This viewport is larger than the primary display.
  - Tier 2 (navigator.gpu hidden by the test, reason no-webgpu), 250,000 particles, viewport 1280 x 800: 2401 frames, median 4.20 ms, 95th percentile 4.30 ms (240.01 fps)
- Order on / (REQ-PERF-07), on localhost with no network delay: first contentful paint 72, 84 and 80 ms; three.js first requested at 157, 167 and 96 ms; the field ready at 2243 and 2251 ms on tier 1 (the 2 s probe) and at 209 ms on tier 2. The wrapper's opacity was 0 on every frame sampled before ready. The headline changed at 2240, 2251 and 159 ms; layout shift total 0.0000 in all three.
- Text contrast over the field (REQ-A11Y-06), 12 screenshots per case with the page text hidden, measured against the brightest single pixel behind the bar links and the hero's text, with the veil at 0.7 as shipped. Muted text #9A9AAB: tier 1 at 1280 x 800 5.53 to 1; tier 1 at 375 x 812 6.09; tier 2 at 1280 x 800 5.21; tier 2 on a touch screen at 375 x 812 5.84; the tier 3 still at 1280 x 800 5.86; the tier 3 still at 375 x 812 6.33. Text #EDEDF2 was 12.36 to 1 at worst. With the veil at 0 the same cases gave muted text 2.07, 3.04, 1.72, 2.49, 2.65 and 3.79 to 1, so the veil is what keeps the text readable.
- Tier 3 with Save-Data set by the test: the still covers the screen (field-wide.jpg, 1920 x 1080, at 1280 x 800; field-tall.jpg, 1080 x 1920, at 375 x 812), 8 scripts requested, none holding three.js, the headline never changed.
- Leaving home for /work: no frameRate event in 2,500 ms; back on home they resume, on the same canvas element.
- Probe facts, headed: navigator.gpu present, adapter vendor nvidia, architecture lovelace, not a fallback adapter, 22 features, WebGL2 present.
- The two stills in public/still were captured while the engine was built, by e2e/gpu/stills.spec.ts with CAPTURE_STILLS=1 (one settled tier 1 frame at 1920 x 1080 and at 1080 x 1920). On disk: field-wide.jpg 221,324 bytes, field-tall.jpg 254,849 bytes.
- Not measured: contrast of text in the sections below the hero while the field scrolls behind them; contrast over more than 12 frames in this run.
- Covers: REQ-PERF-06, REQ-PERF-07, REQ-PERF-05, REQ-PERF-03, REQ-TIER-01, REQ-TIER-03, REQ-TIER-05, REQ-ENG-01, REQ-ENG-06, REQ-ENG-07, REQ-CNT-10, REQ-A11Y-06

## 2026-11-10 P2 review fixes

- The failed first test of the development page run: the same field, looked at in a browser pane that was not in front, also reported 1.00 fps. A window that is not being shown is drawn about once a second, so that test measured the window, not the field.
- A calm field kept the particles of its old frame when the frame changed shape. Checked headed on the development page, calm, 500 x 800 turned to 1280 x 700, share of lit pixels in a fifth of the width at one edge, in the middle and at the other edge: with the fix switched off, tier 1 0.0000, 0.9031, 0.0000 and tier 2 0.0000, 0.7959, 0.0000; with the fix, tier 1 0.5462, 0.5383, 0.5420 and tier 2 0.4244, 0.4200, 0.4229. The new test fails without the fix and passes with it (REQ-A11Y-03).
- A WebGPU runtime that cannot be built now gives WebGL2 its own try before tier 3; a throw inside the frame loop is reported as a loss; a tier forced from inside a tier 3 event keeps its own ready; a part that cannot be freed no longer keeps the renderer alive. Each has a unit test (controller: 2 new, 1 changed; runtime with three.js replaced by recorders: 12 new).
- The hero headline now changes when the tier 1 or 2 field has drawn, not when the tier is chosen. On the production home page, headed: headline at 2220, 2227 and 186 ms against ready at 2221, 2229 and 185 ms, and no sampled frame showed the tier 1 and 2 line before ready (REQ-CNT-10).
- The headed frame-rate tests now assert the tier their title names, so a forced tier 1 that fell back to WebGL2 can no longer pass as tier 2.

## 2026-11-10 P2 gate rerun after the review

- Environment: as gate run 1
- pnpm typecheck: exit 0
- pnpm lint: exit 0
- pnpm format:check: exit 0, 131 files
- pnpm test: exit 0, 20 files, 515 tests
- pnpm build: exit 0, the same 13 static pages
- pnpm e2e: exit 0, 139 passed, 4 skipped by design, as run 1. Tier choice on the desktop project with nothing forced: tier 1, reason probe-pass. Order on the home page: desktop first contentful paint 260 ms, three.js first requested 704 ms, ready 1568 ms; phone 488 ms, 795 ms, 1627 ms. Reduced motion: identical screenshots on the first pair; share of lit pixels 0.4575 and 0.7000.
- Lab vitals, phone-vitals project: / LCP 1588 ms, CLS 0.009, the field ready (tier 2, reason phone) by 6737 ms; /work LCP 1560 ms, CLS 0.009; /work/making-of LCP 1584 ms, CLS 0.002
- pnpm budget: exit 0; 12 routes, largest first load 136.6 KB on / (136.1 KB on the other pages, 131.8 KB on /_global-error); 3D payload within limits (docs/results/2026-11-10-budget.md)
- Headed, production build, pnpm e2e:gpu: exit 0, 13 passed.
  - Tier 1 (probe-pass), 1,000,000 particles: 2401 frames, median 4.20 ms, 95th percentile 4.30 ms at 1280 x 800 (239.98 fps) and at 1920 x 1080 (239.99 fps)
  - Tier 2 (no-webgpu), 250,000 particles, 1280 x 800: 2401 frames, median 4.20 ms, 95th percentile 4.30 ms (240.01 fps)
  - Order: first contentful paint 68, 72 and 72 ms; three.js first requested at 139, 143 and 83 ms; layout shift total 0.0000
  - Contrast, veil 0.7, 12 frames, muted text: tier 1 at 1280 x 800 5.53 to 1; tier 1 at 375 x 812 6.21; tier 2 at 1280 x 800 5.24; tier 2 on a touch screen at 375 x 812 5.89; the tier 3 still 5.86 and 6.33
  - Save-Data: the still covers at both sizes, no script holds three.js. /work: no frameRate event, the same canvas on return.
- Headed, development page, pnpm e2e:engine: exit 0, 17 passed, 2 skipped (the still captures).
  - Tier 2 forced at 100,000 and at 250,000, tier 1 forced at 1,000,000 and tier 1 through the probe at 1,000,000: each 2401 frames, median 4.20 ms, 95th percentile 4.30 ms (239.99 to 240.02 fps). No run was disturbed this time.
  - Loss, calm, tier changes, leaving the page and resize as in the first run. Slow frames lowered the pixel ratio to 0.75 and fast frames raised it to 1 again on both tiers.
- Covers: as gate run 1 and the two headed entries above
