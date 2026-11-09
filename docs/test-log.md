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
