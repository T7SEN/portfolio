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
