# Decisions

Every departure from the brief, and every technical choice a later phase needs to know about. Newest entries go at the end. Each entry names who decided it and when.

## Departures from the brief

### D-001 PostHog runs opt-out worldwide

- Date: 8 Nov 2026. Decided by T7SEN: "Go with 'Opt-out worldwide' since most of my traffic is in MENA".
- Brief: PostHog free plan, cookieless until consent, replays only after consent.
- Now: PostHog tracks and records replays from the first load, EU region, with a banner to opt out. The opt-out stays reachable after the banner closes, from the command palette and a footer link (REQ-PRIV-01, REQ-PRIV-06).
- Revisit: if most traffic moves to a region whose law needs prior consent.

### D-002 One PostHog project, key only in Production

- Date: 8 Nov 2026. Decided by T7SEN: "One free project".
- Brief and setup plan: a separate development project.
- Now: one project on the free plan. Its key is set only in the Production environment, so development and previews send nothing. Tests build with a placeholder key and intercept every PostHog request (REQ-PRIV-05).
- Why: the free plan includes one project; a second needs a card.

### D-003 Turnstile in Managed mode

- Date: 8 Nov 2026. Decided by T7SEN: "Managed".
- Brief: spam checked invisibly.
- Now: Managed mode. Most visitors pass without doing anything; a visitor Cloudflare is unsure about gets one checkbox. Pre-clearance stays off.
- Why: invisible mode fails that visitor with no way through, and Cloudflare requires invisible mode to be named in the privacy policy.

### D-004 Tier 2 runs the shared simulation through transform feedback

- Date: 7 Nov 2026. Decided by T7SEN.
- Brief: tier 2 runs about 100k to 250k particles through GPGPU textures.
- Now: one TSL simulation serves tiers 1 and 2. On WebGL2, three.js runs it through transform feedback, so shared behaviour is per particle only: no neighbour writes, atomics or storage textures (REQ-ENG-05).
- Why: one simulation to build and keep correct. The P2 spike measures 100k and 250k particles first (REQ-ENG-06).
- Revisit: if the P2 spike fails.

### D-005 Tool versions held below the latest

- Date: 7 Nov 2026. Decided by T7SEN.
- Brief: latest stable versions pinned at setup.
- Now: pnpm 12.18.0, TypeScript 6.0.3 and ESLint 9.39.5, all exact.
- Why: TypeScript 7 is outside typescript-eslint's peer range, and ESLint 10 is outside the peer ranges of the React, import and accessibility plugins that eslint-config-next 16.4.5 uses.
- Revisit: at a pin refresh, once the peers support them.

### D-006 Radix Dialog and cmdk for the overlay and palette

- Date: 7 Nov 2026. Decided by T7SEN.
- Now: the overlay menu uses @radix-ui/react-dialog 1.3.1 and the command palette uses cmdk 1.1.1, both loaded on first use, never in the first load (REQ-NAV-03, REQ-NAV-04, REQ-PERF-04).
- Why: tested focus handling and keyboard behaviour for both.

### D-007 Holding page on Vercel Hobby, Pro from P9

- Date: 7 and 8 Nov 2026. Decided by T7SEN.
- Brief: Vercel Pro on t7sen.com.
- Now: until P9, t7sen.com serves a static holding page from the branch "holding" on Hobby. The 14-day Pro trial covers previews during the build, with no card. Pro is paid from P9, with a $20 on-demand budget that pauses production.
- Why: Hobby forbids commercial use, so the holding page sells nothing, and nothing is paid before launch.

### D-008 CV on request only

- Date: 8 Nov 2026. Decided by T7SEN.
- Brief: a CV route on /about.
- Now: no public CV download; /about offers the CV on request.
- Why: a public CV shows the real name, which never appears on the site.

### D-009 No licence

- Date: 8 Nov 2026. Decided by T7SEN.
- Now: the repository has no LICENSE file. The README says the code is public to read and all rights are reserved.

### D-010 Links carry a small resting purple arrow

- Date: 8 Nov 2026. Decided by T7SEN: "E: but make the ones in the footer aswell to have pointer on hover."
- Brief: purple only on the simulation, active states and the one primary button.
- Now: inline links use the body text colour with a small purple arrow (a right arrow for pages on this site, an up-right arrow for other sites). Footer links show the arrow on hover and focus only.
- Why: underlines read as cluttered; colour alone is not enough to mark a link, so the arrow is the second cue.

### D-011 Field errors go to PostHog, no error tracking service in R1

- Date: 8 Nov 2026. Decided by T7SEN.
- Now: renderer failures, tier fallbacks and probe results are sent as PostHog events with browser and tier only, and none after an opt-out (REQ-ENG-10). No separate error tracking service in R1.
- Revisit: if field errors go unseen after launch.

## P0 scaffold, 9 Nov 2026

### D-012 @webgpu/types removed; TypeScript's own WebGPU declarations used

- Decided by T7SEN on 8 Nov 2026: add @webgpu/types 0.1.74, and fall back to TypeScript's own declarations if it clashes or breaks the build.
- Result: it clashes. With skipLibCheck turned off, `tsc --noEmit --skipLibCheck false` reported 50 errors between @webgpu/types/dist/index.d.ts and TypeScript 6.0.3's lib.dom.d.ts (TS6200, TS2717 and TS2403: the same GPU interfaces declared twice with different types). skipLibCheck, on by default, only hid them.
- So the package is removed and tsconfig.json lists only "node" in "types". TypeScript 6.0.3's lib.dom.d.ts declares navigator.gpu, GPU, GPUAdapter and GPUAdapterInfo, which the WebGPU probe uses. With skipLibCheck off the project now reports 0 errors.

### D-013 Cache Components off

- create-next-app 16.4.5 turns Cache Components on by default; this project starts with it off.
- Why: with it on, data is dynamic by default, `partialPrefetching` must be set, and React Activity keeps the previous route in the DOM, hidden, after navigation (its effects are cleaned up). This site is static text plus one POST route handler, so the default static rendering already gives every page static HTML (pillar 1), and hidden routes left in the DOM are one more thing the scroll story and its teardown would have to handle (REQ-SCR-04).
- Revisit: the Next.js docs say both features become the default in the next major release; decide again then.

### D-014 React Compiler off

- Not in the brief or the pins, and it adds a Babel step to every build. Off unless a measured render cost needs it.

### D-015 Tailwind through @tailwindcss/postcss

- create-next-app 16.4.5 wires Tailwind through a Turbopack loader (@tailwindcss/turbopack). This project uses @tailwindcss/postcss 4.3.5 with postcss.config.mjs, as pinned, because Vitest and any other tool reading the CSS can use the same PostCSS setup.

### D-016 Dev-only engine page through a development page extension

- REQ-ENG-04. next.config.ts is a function of the build phase. Only for the development server it adds "dev.tsx" to pageExtensions, so src/app/(dev)/engine/page.dev.tsx is a route in development and an ignored file in every production build.
- Proof: the production build's route list shows / and /_not-found, and its app-path-routes-manifest.json holds /, /_not-found and /_global-error, never /engine. A browser test checks that manifest and a 404 on /engine from `next start`. On the development server /engine returned 200 with its text (9 Nov 2026).
- Source: Next.js 16.4.5 docs bundled in node_modules (next.config.js "Phase" section and pageExtensions).

### D-017 Engine boundary in three lint rules

- REQ-ENG-02. Script files of every extension in src/engine may import only src/engine, src/tokens (through `@/tokens`) and packages such as three.
- `no-restricted-imports` blocks every @/ alias except `@/engine` and `@/tokens`, the React and Next.js packages, and relative paths to tokens. `no-restricted-syntax` blocks the same sources in `import()` and `require()`, which `no-restricted-imports` does not check. `import/no-restricted-paths` blocks relative paths that leave src/engine for app code, which alias patterns cannot see.
- Proof: a lasting unit test lints static, type, re-export, dynamic and require imports as engine files, in TypeScript and JavaScript (eslint.config.test.ts), and one deliberate violation produced 3 errors before it was removed.

### D-018 How the budget check measures

- REQ-PERF-04, REQ-PERF-05. Next.js 16 removed the "First Load JS" figure from `next build`, so scripts/check-budgets.mjs measures it: for every prerendered page it reads the HTML, takes each module script (polyfills marked nomodule are skipped), gzips it at level 9 and sums. 1 KB is 1,024 bytes; the limit is 200 KB per route.
- The files it reads (app-path-routes-manifest.json, prerender-manifest.json and server/app/*.html in .next) are Next.js build internals, not a documented interface; the local docs do not describe them. So anything it cannot find or measure fails: a page route with no prerendered HTML (which also keeps pages static), a route with no scripts, a script file missing from the build, or no page measured at all.
- It fails when three.js, GSAP, ScrollTrigger, SplitText, Lenis, PostHog, Radix Dialog or cmdk appear in a first-load script, found by strings that survive minification. A temporary build that imported all eight proved each one is found.
- The 3D payload of tiers 1 and 2 counts every built chunk under .next/static/chunks, at any depth, that holds three.js (gzip), plus the asset files listed in src/engine/manifest.json, written by the engine from P2: a list of payloads, each with a tier, a device ("desktop" or "phone") and its files. Limits: 8 MB desktop, 3 MB phone (1 MB is 1,048,576 bytes). If the engine or three.js is in the build and there is no manifest, the check fails. A second temporary build that loaded three/webgpu through `import()` kept the first load at 131.8 KB, found one three.js chunk of 291.6 KB gzip, and failed on the missing manifest.
- [CONFIRM at P2: whether engine code lands in chunks without three.js; if so, give the engine entry a marker string the check can find.]

### D-019 Lab measurement through Playwright

- Decided by T7SEN on 8 Nov 2026 (P0 plan).
- LCP, INP and CLS are measured with Playwright and Chrome DevTools Protocol throttling, with no new dependency: a 4x CPU slowdown and a slow 4G network profile on the phone project.
- Trade-off: the numbers are not directly comparable with Lighthouse or PageSpeed scores.
- Settled at P1 (9 Nov 2026). The values are Chrome's own "Slow 4G" preset, read from front_end/core/sdk/NetworkManager.ts in the ChromeDevTools devtools-frontend repository on 9 Nov 2026: latency 562.5 ms, download 180,000 bytes/s, upload 84,375 bytes/s, sent through Network.emulateNetworkConditions, plus Emulation.setCPUThrottlingRate 4. e2e/vitals.spec.ts runs on the phone project only, for /, /work and /work/making-of. A PerformanceObserver installed before the page scripts records largest-contentful-paint and layout-shift; CLS is the largest session window (a burst ends after a 1 s gap or at 5 s), shifts after input are ignored, and values are read 1 s after the load event. The test fails if the navigation's responseStart is not above 562.5 ms, because Playwright 1.65.0's protocol types mark emulateNetworkConditions as deprecated, and a silent end to throttling would make every result look good. INP is P7 work.

### D-020 Test browsers

- Both Playwright projects use channel "chromium", the full browser in new headless mode. Desktop runs at 1280 x 800. The phone project emulates a Pixel 5 (Chromium, touch, mobile) at a 375 x 812 viewport, because no Chromium device in Playwright 1.65.0 is 375 px wide.
- Result of the WebGPU probe on 9 Nov 2026: headless and headed Chromium both returned a real adapter on this machine (see docs/test-log.md). Tier 1 checks may run headless here; frame rates are still measured headed (REQ-PERF-06).

### D-021 Format check over committed files

- `pnpm format:check` runs Prettier through its API on exactly the files git would commit (tracked and untracked, minus ignored), so files kept out of git are never checked or changed. Prettier settings are the defaults plus prettier-plugin-tailwindcss, whose README says Tailwind v4 needs `tailwindStylesheet` pointing at the CSS entry.

### D-022 Dependency install scripts

- pnpm 12 stops an install when a dependency's install script has not been reviewed. pnpm-workspace.yaml denies the scripts of core-js (a funding message, pulled in by posthog-js), sharp and unrs-resolver (both denied by create-next-app). Both install prebuilt Windows binaries as separate packages (@img/sharp-win32-x64 0.35.5 and @unrs/resolver-binding-win32-x64-msvc 1.13.0), and sharp loads without its script, so nothing that runs needs those scripts.

### D-023 Folders arrive with their first file

- Git keeps no empty folders, and placeholder files would be replaced a phase later. So P0 creates src/app, scripts, e2e and docs, which hold files now. src/components, src/content, src/lib, src/tokens, src/engine, src/app/api/contact, public and assets/og are created by the phase that writes their first file (P1, P2, P6, P8).

### D-024 The build prints the Node version

- REQ-OPS-03. Vercel prints no Node.js version in its build log; its docs say to run `node -v` in the Build Command to see it. The first preview build of main (commit d7f3fed) showed pnpm 12.18.0 but no Node version. T7SEN chose on 9 Nov 2026 to make the build script `node -v && next build`, so every Vercel and local build log names the Node version, with no dashboard override to keep in step.

## Before P1, 9 Nov 2026

### D-025 The tokens folder has its own import boundary

- REQ-ENG-02. Decided by T7SEN on 9 Nov 2026.
- Found: the engine may import `@/tokens`, but src/tokens had no rule, so a tokens file importing app code, React or Next.js would carry them into the engine. A lint run of such imports in src/tokens/colors.ts gave no error.
- Now: eslint.config.mjs builds both boundaries from one helper. Files in src/tokens may import only src/tokens, never React or Next.js, through static imports, re-exports, `import()` and `require()`; relative paths that resolve outside src/tokens fail too. The engine's rules are unchanged; eslint.config.test.ts covers both folders (47 tests).

### D-026 The budget check counts chunks at any depth

- REQ-PERF-05. Decided by T7SEN on 9 Nov 2026.
- Found: the 3D payload scan read only the top level of .next/static/chunks. A test build folder with a three.js chunk in a subfolder and no engine manifest passed the check; the same chunk at the top level failed it.
- Now: chunkFiles in scripts/budget-lib.mjs lists every JavaScript file at any depth, and a unit test proves a nested chunk is found. Turbopack's current output is flat, so today's figures do not change.

### D-027 The static hero headline is the tier 3 line

- REQ-CNT-10, REQ-CNT-01, REQ-PERF-03, rule A14. Decided by T7SEN on 9 Nov 2026: "Tier 3 line, then swap".
- The static HTML carries "Real-time worlds, built for your GPU.", which is true with JavaScript off and before the engine reports. It switches to "Real-time worlds, rendered by your GPU." only after the engine reports tier 1 or 2, in space reserved for the longer line, so the swap moves nothing.
- Not a departure from the brief: the brief's tier table and its tier 3 rule stay as written; this fixes which line the HTML holds before the tier is known.

## P1 Content and design system, 9 Nov 2026

### D-028 One tokens source, CSS written from it

- REQ-A11Y-06, REQ-ENG-02. Decided by T7SEN on 9 Nov 2026 (choice T1 of four: a TypeScript source plus a CSS file written from it).
- src/tokens/colors.ts holds the twelve colours of the palette, saved unchanged by T7SEN on 8 Nov 2026. `pnpm tokens` (scripts/tokens-css.mjs) writes src/app/tokens.css, one `@theme` block that globals.css imports. tokens.css is never edited by hand; a unit test fails when it differs from the script's output or when Prettier would change it.
- `--color-*: initial` comes first, so Tailwind's default palette, white and black included, is not generated and every colour on the site is a token.
- The CSS holds the hex in lower case because Prettier 3.9.10 prints CSS hex that way; the tests compare case-insensitively.
- src/tokens/contrast.ts holds the WCAG formula and the 19 colour pairs in use (the 18 of the palette table plus glow on raised for the focus ring on inputs). A unit test recomputes each one, checks its required ratio and the documented value to two decimals, and fails if text on violet (3.39) is ever used.
- Plain Node 26 loads colors.ts by stripping its types; the package script passes `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` because package.json has no "type" field, which the project keeps as it is.

### D-029 Fonts: Geist from its package, Unbounded through next/font/google

- Decided by T7SEN on 9 Nov 2026 (choice G1 and U1).
- Geist and Geist Mono come from the pinned geist 1.9.2 package (next/font/local inside it), so they need no network at build time, and the same package holds the ttf files share cards need at P8. Unbounded comes through next/font/google with the latin subset and the variable weight; it is downloaded at build time and served from this site, so visitors never request Google.
- All three are preloaded: Geist sets the body text and Geist Mono the bar links and labels on every first screen, and Unbounded sets every page title. The build of 9 Nov 2026 preloads Geist 69,488 bytes, Geist Mono 71,212 bytes and the Unbounded latin file 50,892 bytes.
- Trade-off: every production build needs fonts.googleapis.com and fonts.gstatic.com reachable, because next/font/google stops the build when the download fails. P8 needs a ttf, otf or woff copy of Unbounded for share cards.

### D-030 Logo copies with attribute fills

- Decided by T7SEN on 9 Nov 2026 (choice A). The original marks declare their colours in a style block on a shared class, and inline SVG styles apply to the whole page, so two inlined marks recoloured each other.
- public/brand/ holds the three marks with the same polygon points, the fill as an attribute and no class or style block; the purple mark's gradient and glow are attributes with ids of their own. src/app/icon.svg is the purple mark, served as the favicon.
- The inline Logo component fills the light mark with currentColor, so it takes the text colour in the bar and the hover colour of its link; the dark mark keeps #111114 from its file; the purple mark takes its gradient stops from the tokens and gets ids from React's useId, so it may appear more than once on a page.

### D-031 Type scale

- visual-system.md section 5 left the scale to P1. globals.css defines six sizes: display (32 to 72 px, fluid, Unbounded, hero only), title (28 to 48 px, page titles), heading (22 to 28 px), lead (18 to 20 px), body (17 px, line height 1.65) and label (13 px, Geist Mono, slight tracking). Fluid sizes grow at most 2.5 times, so browser zoom still reaches 200% (WCAG 1.4.4).
- Prose is capped at 30em, about 67 characters of Geist, not Tailwind's 65ch: Geist's zero is wider than its average letter, so 65ch would hold about 97 characters.

### D-032 The content model as built

- REQ-CNT-03 to REQ-CNT-08, REQ-CNT-10 to REQ-CNT-12. src/content holds typed objects: one file per study, an index in study order, the hero copy per tier, the services, the About copy and the copy of each page.
- A full study cannot compile without all seven parts; the summary is exactly three lines and the parts that are lists must hold at least one entry, so an unknown part holds a visible marker instead of being left out. A quote cannot compile without its permission record.
- Links are typed as a site path, a fragment, an https address, a mailto address or a marker, so a guessed or schemeless address does not compile.
- A short study marked in progress must carry a status line; SystemSeven's is "Built, not running: no live features yet." Its built features are listed as the README gives them, and it is not described with words the record does not use.
- The ArcheLab study carries a notice that it is unofficial fan work for The First Descendant. The CV link can only point to /contact, so no CV file can be linked.
- Every fact not on record is a visible [FILL] marker: 54 at the end of P1, all in src/content. The marker type and the tests are written so the marker scan counts only real content.

### D-033 Pages and layout

- REQ-CNT-01, REQ-CNT-02, REQ-NAV-01, REQ-PERF-03, REQ-A11Y-02. Every route is a Server Component and prerendered: /, /work, the five study pages (generateStaticParams with dynamicParams false), /about, /contact, /v1 and a not-found page that keeps one h1 and links back to the work.
- The root layout renders the skip link, the bar, `<main id="main" tabIndex={-1}>` and the footer, so every route has one main and the skip link always has a target; pages render no main of their own.
- The hero h1 holds only the tier 3 line (D-027). The other line is reserved by a hidden ::before in the same grid cell, whose text comes from a data attribute, so the cell keeps the height of the longer line, the h1 is read as the tier 3 line alone, and the tier 1 and 2 claim is never page text, not even with CSS off or in a reader view (rule A14). A browser test does what the engine will do from P2, showing the other line and reserving the tier 3 line, and checks that the h1 and the sub-line do not move, at 1280 and 375 px (docs/test-log.md).
- The hero fills the first screen minus the bar, so "Skip intro" sits at its bottom start from the first frame; it links to the work section on the home page. "See the work" goes to /work. The height depends on the bar's height and must change with it. Screens 40rem tall or less get tighter hero spacing, so both stay in view on a 375 by 548 screen, about what a 375 by 667 phone shows with its browser bars; a browser test checks that size.
- A link whose address is a marker renders as text with the marker, never as a link. Home has no title template, as the Next.js 16 docs say a layout's template does not apply in its own segment, so it sets its title in full.
- Section headings and labels such as "Services", "Full study" and the seven part headings live in the components, because they are interface words, not facts. The About headings "Streaming", "Skills" and "CV" are among them, for T7SEN's review.

### D-034 P1 checks in the existing gate commands

- REQ-I18N-01, REQ-I18N-02, REQ-A11Y-01. The gate commands do not change. `pnpm test` gains the class scan (scripts/class-scan.mjs), which reads string literals through the TypeScript compiler API, already pinned, and fails on any physical left or right utility or CSS property under src. `pnpm e2e` gains e2e/pages.spec.ts (content with JavaScript off, no three.js on /work, the fast path from the first frame, short studies on one screen, no CV file, axe and reflow on every route, the skip link), e2e/rtl.spec.ts (every route with dir set to rtl) and e2e/vitals.spec.ts (D-019). The vitals run in their own Playwright project, phone-vitals, after the desktop and phone projects and one test at a time, so no other browser competes for the CPU while they measure.
- The /work check fails on three.js only, not on every deferred library, because PostHog is allowed to load after first content there from P6.
- Tailwind 4 reads class names from every file git does not ignore, so strings in the class scan's own tests became shipped CSS rules such as text-align: right. globals.css now imports Tailwind with source(".."), so only src is read, and a browser test runs the class scan over the stylesheets the site serves. The class scan also flags arbitrary properties such as [margin-left:4px] and shorthands whose right and left values differ, such as margin: 0 1rem 0 0.
