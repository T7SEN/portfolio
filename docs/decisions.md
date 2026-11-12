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
- Settled at P2: the engine entry lands in a chunk of its own without three.js and carries a marker string the check finds; see D-044.

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

## P2 Engine core, 10 Nov 2026

### D-035 The engine owns its canvas inside one host element

- REQ-ENG-01, REQ-ENG-08, REQ-TIER-04. A departure from the brief's wording of one persistent canvas, and from the planned `mount(canvas)` command.
- A canvas element holds one context type for life: after it has given a WebGPU context it returns null for WebGL2, and the other way round (the HTML and WebGPU specifications, and three r187's backends, which ask for the context on the canvas they are given). So a change of backend, after a slow probe, a lost device or a forced tier, needs a new canvas element.
- The root layout therefore renders one persistent, empty host element, and the engine creates, replaces and removes the canvas inside it. Navigation never recreates the host, the canvas or the renderer; only a change of backend replaces the canvas. A browser test visits other routes and checks that the canvas element is the same one on return.
- `createEngine(host, options)` takes the host. React never renders children into it.

### D-036 Commands, events and reasons as built

- REQ-ENG-03, REQ-ENG-08. Five commands at the start: `start`, `setTier`, `setStory`, `setPointer` and `setCalm`. `on` subscribes and `dispose` tears down; neither is a feature command. The planned `ripple` waits for P6, the phase whose feature needs it.
- Three events: `ready` with the tier that has drawn, `tierChosen` with the tier and a reason, and `frameRate` once a second while a settled tier runs. Nothing else leaves the engine.
- `start` never rejects. Every failure becomes a lower tier and a `tierChosen` event that says why. The thirteen reasons: forced, save-data, phone, no-webgpu, no-adapter, fallback-adapter, adapter-limits, probe-pass, probe-slow, probe-failed, webgpu-init-fallback, no-backend and device-lost.
- device-lost is also the reason when a call into the renderer throws, in a command or inside the frame loop, because the result for the visitor is the same: that renderer is finished. A reason of its own can be added if the reports at P6 need to tell the two apart.
- Each chosen tier sends its own `ready`, so a tier change or a lost device is followed by a new `ready` once the new tier has drawn.
- src/engine/types.ts holds the whole contract and imports nothing, so app code reads the types without pulling three.js into the first load. The controller holds no three.js; the runtime holds all of it and is loaded by a dynamic import only when a GPU tier is possible.

### D-037 The tier decision and what it reads

- REQ-TIER-01, REQ-TIER-02, REQ-TIER-03. The order is the order of precedence: a forced tier; Save-Data gives tier 3; a coarse primary pointer gives tier 2 (reason phone); no navigator.gpu gives tier 2; no adapter gives tier 2; a fallback adapter gives tier 2; an adapter with limits too small for one buffer of every particle gives tier 2; anything else goes to the probe.
- The decision does not read the adapter's feature list. As first built it also required the feature name `core-features-and-limits`. The engine asks for a default adapter, which is core level, so that check could never catch a compatibility-only device (by the specification it gets no adapter and stops at the step before; no such device was at hand to measure), and on a browser that does not list the name it would have sent a capable desktop to tier 2 with no probe. Removed on 10 Nov 2026 after a review of the phase; decided by T7SEN. three r187 makes its own request at compatibility level; that is its business and changes nothing here.
- The phone test is `matchMedia('(pointer: coarse)')`, read once. Its known errors: tablets count as phones; a touch-only hybrid counts as a phone; a phone docked to a mouse counts as a desktop and goes on to the probe; it says nothing about screen size, so the layout stays driven by CSS width. All but the third land on the safer tier, and in the third the probe still protects the visitor. The user agent's mobile flag is missing on every iPhone, `hover: none` misses some real phones, and touch points exist on touch laptops, so none of those is used.
- Save-Data is read from navigator.connection.saveData, which exists in Chromium browsers only, and from the prefers-reduced-data media feature, which no browser ships by default today. A Firefox or Safari visitor with a data saver on is not detected. The request header is visible only to a server, and reading it would make the page dynamic.
- The adapter is not requested when Save-Data or the pointer has already decided.
- three r187 falls back to WebGL2 by itself when WebGPU fails to start, so the engine reads the live backend after the renderer starts and reports tier 2 with reason webgpu-init-fallback. That fallback does not cover every case: a device lost as it starts, or a field that throws while it is set up, fails with WebGL2 never tried. So when the WebGPU runtime cannot be built at all, the engine gives WebGL2 one try on a new canvas, with the same reason, before it settles on tier 3.

### D-038 The tier 1 probe

- REQ-TIER-01. The probe runs the real field at tier 1's particle count for 2,000 ms on the canvas it will keep, with the canvas hidden and the wrapper still transparent. Frames in the first 500 ms are not counted, because shader compilation lands there. It passes at a median frame time of 20 ms or less over at least 10 counted frames; fewer frames means failed, a higher median means slow.
- 20 ms sits between a 60 Hz frame (16.7 ms) and a frame that missed one refresh (33.3 ms), so a field that holds 60 fps passes and one that mostly misses a refresh does not. Fewer than 10 counted frames in the 1,500 ms that count is under about 7 fps, or nothing drawn at all.
- Open for P7, not measured: the probe reads the time between frames, and a browser draws one frame per display refresh, so a display that refreshes below about 50 Hz (48 Hz gives 20.8 ms) would fail the 20 ms line whatever the GPU and get tier 2. No such display was at hand, so the number stays as it is until one is measured (decided by T7SEN, 10 Nov 2026).
- A pass keeps the canvas and costs no second start. Slow or failed disposes that renderer and builds tier 2 on a new canvas. REQ-TIER-03 lists a failed probe among the causes of tier 3; as built, a failed tier 1 probe tries tier 2 first and reaches tier 3 only when WebGL2 cannot start, because a GPU that cannot hold a million particles may still hold a quarter of them. Tier 2 has no probe of its own.
- The probe waits while the tab is hidden or the host is out of view, and starts again from nothing when the field is back in view, because frames from before a pause say nothing about the GPU.
- The result is kept in memory only. Nothing is stored on the device, so the probe runs once per page load and no consent question arises.
- Cost, measured on this PC: the field appears about 2.2 s after navigation on tier 1 and about 0.2 s on tier 2 (docs/test-log.md).

### D-039 Failure and loss

- REQ-ENG-08. A lost device or context ends that renderer for good; r187 has no way back. A loss on tier 1 rebuilds once as tier 2 on a new canvas; a loss on tier 2 ends on tier 3. The tier never climbs again during the visit.
- When WebGL2 cannot start, or the engine's code fails to load, the result is tier 3 with reason no-backend: the canvas is removed, the still is shown and the headline stays the tier 3 line.
- A throw from the renderer inside the frame loop is treated as a loss: the loop stops and the tier drops, so the page is never left with a chosen tier that draws nothing.
- three.js prints one console error when a device is lost. A renderer that cannot start prints nothing, so until P6 sends these events to analytics (REQ-ENG-10) such a visit leaves no trace.
- Not built: a time limit on the adapter request or on loading the runtime. A promise that never settles would leave the visitor on the static page with the tier 3 line, which is a true state; a limit can be added if field reports show it happens. In that same case the promise `dispose` returns never settles either, because it waits for the start that is stuck: the canvas, the listeners and the observers are already gone by then, so nothing leaks, but code that awaits `dispose` must not depend on it finishing.
- Known limit: between a lost device and the next `tierChosen` the store still holds the old tier as drawn, so the tier 1 and 2 headline stays over a canvas that has stopped until the WebGL2 field is built or the still is chosen. The three events have no way to say "no longer drawn", and the gap is the time one renderer takes to start.

### D-040 The simulation, the field and their numbers

- REQ-ENG-04, REQ-ENG-05, REQ-ENG-06, REQ-TIER-05, REQ-PERF-06. One simulation written in TSL runs on both backends. It has three storage buffers (positions, velocities and read-only seeds), every one made with instancedArray, and it reads and writes only its own particle, so WebGL2 runs it through transform feedback unchanged. It is built with a count only, never a dispatch size.
- Each particle has a home inside the camera's view, derived from its seed in the shader, and drifts around it on a slow noise flow. The pointer pushes nearby particles. One built-in ring stands in for the chapter formations until P3. Seeds come from a fixed number, so a still can be captured again.
- Particle counts stay at the targets: 1,000,000 on tier 1, 250,000 on tier 2 with a fine pointer and 100,000 with a coarse one. On this PC 1,000,000 and 250,000 held the 240 Hz display rate on the production home page, and all three counts did on the development page, far above the pass lines of 60 and 30 fps. No phone has been measured.
- Sprites are additive. Their opacity is set so the field adds the same share of light for every count and aspect.
- Adaptive resolution moves the drawing buffer's pixel ratio through fixed steps (0.75, 1, 1.25, 1.5, 2, capped at the device's own ratio): down below 45 fps after 750 ms, up at 55 fps or better after 4 s, and a ratio that failed straight after a rise is not tried again.
- The simulation step comes from three's Timer and is capped at one thirtieth of a second, so a pause never flings the field. Time spent paused is not simulated.
- Calm mode and reduced motion settle the field without drawing it, then draw exactly one frame, which stays on screen. A frozen field cannot flow to the homes of a new frame shape, so when the frame's aspect changes by more than a tenth (a phone turned on its side, a window made much wider) the particles are put back on their homes by one step of the same simulation and settled again. Homes reach a tenth past the frame, so smaller changes, such as a phone's browser bar hiding, keep the frame that is on screen.
- Known limits, not built: adaptive resolution keeps lowering the ratio while frames stay slow, so a browser that caps frames near 30 fps ends at the lowest ratio, and the tier 1 probe would read such a cap as slow; to be settled when phones are measured at P7. three r187 does not release a WebGL2 context when its renderer is disposed, so each tier 2 renderer's context lives until its canvas is collected, which matters once the palette can change tiers many times (P5). On WebGL2 the simulation uses three of the four transform feedback outputs the standard guarantees, so P3 has room for one more buffer there.
- A canvas with no size on the page is left alone. Every route but / hides the wrapper, which reports a size of nothing; as first built the runtime took that for a 1 x 1 canvas, shrank the drawing buffer on every route change and, in calm mode, settled the field again while hidden. Since 10 Nov 2026 a resize to nothing keeps the buffer and the particles' places, and the frame is drawn once more when the size returns.
- The field pauses while the tab is hidden or the host is out of view, and three.js is disposed with the awaited `dispose` when the engine is torn down.

### D-041 The field on the home page

- REQ-CNT-02, REQ-CNT-10, REQ-PERF-03, REQ-PERF-04, REQ-PERF-07. In P2 the field shows on / only. The wrapper sits in the root layout, fixed behind the page and hidden from assistive technology; on every other route it is hidden, so the engine pauses by itself, and a visit that starts on /work loads no engine code at all.
- After first content means: the load event, then the first contentful paint, then an idle moment. The paint step was added after a browser test caught three.js being requested before the first paint when the load event came first. Browsers without paint timing skip that step.
- The wrapper stays transparent until `ready`, then fades in over 700 ms.
- The hero headline is driven by a small store that mirrors the engine's events. The tier 1 and 2 line shows only while a tier 1 or 2 field is on screen, which means the tier is chosen and it has drawn; the tier 3 line returns while a tier changes and if the tier drops to 3 (rule A14). A browser test compares the frame before the real change with the frame that shows it and finds the h1 and the sub-line in the same place. This replaces the P1 test that changed the text by hand (D-033).
- At P2 the pointer was not sent to the field on the home page. P3 sends it (D-052, REQ-SCR-06).

### D-042 The tier 3 stills

- REQ-TIER-03, REQ-A11Y-05. Tier 3 shows one frame captured from the tier 1 field: public/still/field-wide.jpg (1920 x 1080, 221,324 bytes) and field-tall.jpg (1080 x 1920, 254,849 bytes), chosen by orientation. A kept test captures them when it is run with CAPTURE_STILLS=1, at the first JPEG quality, stepping down from 80, that fits 256,000 bytes.
- The still is decoration inside the hidden wrapper, so its alt is empty; the page's own text is the alternative to the scene. This replaces the earlier plan of an alt text that describes the frame.
- The still loads only on tier 3, with low priority, and is removed if it fails to load.
- The brief also allows a short video loop on tier 3. None was built.

### D-043 The veil over the field

- REQ-A11Y-06. A layer of the void colour sits above the field at 70% opacity. The figure comes from measurement: with the page text hidden, muted text against the brightest pixel behind the bar and the hero text is 5.21 to 1 at worst at 70% (docs/test-log.md). At 60% the worst case measured on 10 Nov 2026 was 4.72 to 1 over 12 frames, which passes with too little room for a field whose brightest pixel moves from frame to frame; the earlier wording of this entry cited a figure at 60% with no recorded run. Without the veil the same text would be under 2 to 1 on tier 2.
- Cost: the field shows at 30% of its light behind the page.
- The check is a headed test. axe cannot see the field, so the gate's accessibility scans say nothing about it. It measures the bar and the hero only, and additive sprites have no hard cap, so it must be run again when P3 packs particles into formations and when text below the hero scrolls over the field.

### D-044 Counting the engine in the budget

- REQ-PERF-04, REQ-PERF-05. The build splits the engine into two lazy chunks: the three.js chunk with the runtime (221.3 KB gzip) and an entry chunk with the controller and the tier decision (2.8 KB), which holds no three.js. The entry loads on every tier on the home page, because it is what decides the tier.
- The budget check finds the entry chunk by a marker string that the controller writes on every canvas it creates, so the string is real code and survives minification. A unit test fails if the script's copy and the controller's copy differ.
- The check now fails when the entry is in any first load, when it shares a chunk with three.js, or when the engine has code but no built chunk holds the marker.
- src/engine/manifest.json lists the files each tier downloads besides JavaScript: none on tiers 1 and 2, both stills on tier 3, which is the most one visit can fetch if the screen is rotated.
- First load after P2: 136.6 KB on / and 136.1 KB on the other pages, against the 200 KB limit.

### D-045 Testing the tiers

- REQ-TIER-04, REQ-PERF-06. No code that forces a tier ships. Browser tests force tiers from their own side before the page loads: hiding navigator.gpu gives tier 2, setting Save-Data gives tier 3, and refusing a WebGL2 context as well gives the failure path. Tier 1 cannot be forced that way; the natural desktop path is accepted as tier 1 or tier 2. The development page, which is never built for production, takes the tier, the count and calm from its query string.
- The wrapper carries the tier, its reason, ready and the last frame rate as data attributes, written straight to the element. The tests read them, and they ship; they force nothing.
- The gate (`pnpm e2e`, headless, many workers) proves behaviour and asserts no frame rate. Frame rates, contrast, device loss and the stills are checked headed on this PC's GPU: `pnpm e2e:engine` runs the development page and `pnpm e2e:gpu` runs the production build. Neither is part of the gate.
- Headed frame rates here sit on the display's 240 Hz ceiling, so they prove the pass lines and nothing about the GPU's limit. A window that is not being shown is drawn about once a second, which failed one headed test and thinned another; the test log carries every such run. The thinned run still passed, because the test read only the median time between frames; since 10 Nov 2026 the headed tests also hold the frame count to the run's own median: the window must hold at least 95% of the frames that median promises, so a window that stalls for more than a twentieth of its length fails. The thinned run had 1,311 frames where its median promised about 2,381. What the runtime frees on dispose, and that a throw in the frame loop is reported, are checked in unit tests with three.js replaced by recorders, because a page cannot see a renderer that was left alive.

## P3 Scroll story, 10 Nov 2026

### D-046 T7SEN's choices for the story

- REQ-SCR-01, REQ-SCR-07. Asked and answered on 10 Nov 2026, after previews: the hero opens on one pulsing dot; the work silhouettes are simple marks drawn now, as placeholders; the T7SEN mark forms in violet and glow; the two new chapters show a mono label and one line.
- Approved copy: "02 · Bloom" with "One field becomes every project on this site." (shown only while a tier 1 or 2 field draws; tier 3 and the static HTML carry its other form, D-059); "04 · Making-of" with "How the field is built, pass by pass." and the link "Read the making-of" to /work/making-of.
- The services block stays between the hero and the bloom as a plain section, not a chapter; for the field it counts as the end of the hero.

### D-047 The story contract

- REQ-SCR-01, REQ-ENG-02. Each chapter section carries data-chapter and one visually hidden data-scene paragraph that says what the field shows. A chapter's progress runs from 0 when its top reaches the middle of the viewport to 1 when its bottom does.
- The work chapter splits into five equal steps, one per study in the study index order (src/engine/story.ts, workStep). A unit test checks that list against the study index.
- The page and the engine never import each other. src/lib/story-bridge.ts keeps the latest story and pointer and hands them to the engine once it exists, so the field starts on the right chapter even on a reload partway down. App code may import values from src/engine/story.ts; that file imports nothing.
- The engine session mirrors the chapter onto the wrapper as data-chapter on every tier, from the first story, and keeps forwarding on tier 3, because the controller stores the story there and replays it if a GPU tier returns.
- The driver measures the chapter in view from the layout as soon as it mounts, then loads GSAP and the story runner after first content. Its own copy of the chapter ids keeps the study text out of the home page's first load.

### D-048 Shape targets

- REQ-SCR-01, REQ-SCR-07, REQ-ENG-05. Shapes are sampled on the CPU and packed into one read-only float texture, 1024 x 96 texels, 16,384 points for the mark and for each of the five studies, read in the shared simulation with textureLoad. The compute pass keeps its three storage buffers; tier 2 reported MAX_TRANSFORM_FEEDBACK_SEPARATE_ATTRIBS 4 on this PC, so a fourth buffer would have fitted, but nothing needs it. A particle's point is its own index modulo 16,384, with a small seeded jitter. At 4,096 points the shapes showed clumps.
- The texture costs 1,572,864 bytes of GPU memory and no download; src/engine/manifest.json is unchanged.
- The sampler cuts each filled outline (even-odd rule) into level trapezoids and places one point in each equal share of the area, then shuffles the order with a seeded generator. The points are evenly spread, always inside the shape and the same on every visit. 16,384 points take a few milliseconds.
- The mark is the polygon from public/brand/t7sen-purple.svg. The five work marks are placeholders built from simple primitives (a screen with a dot bloom, two fanned cards, a flask, two chain links, a terminal window), nothing from any game, each swappable by replacing one entry in src/engine/runtime/shapes/marks.ts. Previews for review are kept outside the repo.

### D-049 The choreography

- REQ-SCR-01, REQ-SCR-05, REQ-SCR-07. Pure functions in src/engine/runtime/story.ts turn a chapter and its progress into targets: the dot, the mark gathering and dissolving in the bloom, one shape per study with a camera push of 1.6 world units through the work chapter, a flat sheet for the making-of, a travelling wave for about and the settled field for contact.
- With no story at all the runtime draws P2's ambient field, so the development page and the tier 3 still capture behave as before.
- The release, the camera push and the formation light follow the story over 0.45, 0.6 and 0.5 seconds, so a jump between chapters never snaps; particle targets switch at once and the particles fly with their own inertia. A story sent before the first frame seats every particle on its targets.
- Formed shapes are dimmed to the share of the frame they cover (gain 1.6), and fast particles are dimmed, so light never piles to white behind text: the brightest pixel during the bloom fell from about luminance 0.82, reported for the first build (that output was not kept), to 0.25 on tier 1 and 0.37 on tier 2 in the P3 gate, under the test's limit of 0.5.
- Every chapter measured a median of 4.20 ms per frame on both tiers at this display's 240 Hz ceiling, so adaptive resolution needed no change. Phones are measured at P7.

### D-050 Calm mode

- REQ-A11Y-03, REQ-A11Y-04. src/lib/calm-store.ts holds calm for the whole site: the OS setting for reduced motion, or the visitor's choice from the toggle, remembered for the visit in the tab's session storage under portfolio:calm. The OS setting always wins; the toggle can only add calm.
- The toggle sits at the end of the bar as a button named "Calm" with aria-pressed and a shape that changes with its state, so colour is never the only signal. Under the OS setting it stays pressed, with the hidden description "Your device asks for reduced motion, so calm stays on." A click always asks for the opposite of what the button shows. The bar's end group wraps on narrow screens.
- In calm the field shows one still per chapter and per study, each at its fullest (the dot, the whole mark, each whole shape, the sheet, the wave, the settled field), drawn again only when the chapter or the study changes. The engine reads calm from the store instead of its own media query.

### D-051 Smooth scroll

- REQ-SCR-02, REQ-SCR-03, REQ-PERF-04. Lenis runs only with a fine primary pointer and calm off, watched live, and is created after first content; a browser that cannot answer the pointer query keeps native scroll. It uses the GSAP wiring from its README: GSAP's ticker drives Lenis and each Lenis scroll updates ScrollTrigger, so no third frame loop is added. The engine keeps its own frame loop.
- One option departs from the defaults: stopInertiaOnNavigate. Without it, a wheel scroll still gliding when a study link was clicked carried on after the router had put the new page at the top, and the study page landed at its bottom.
- When Lenis goes, GSAP's lag smoothing is set back to its defaults (500 and 33 ms). A failed import leaves native scroll and is tried again on the next change of calm or pointer.
- Lenis has no key listener, so the keyboard scrolls natively once no wheel glide runs. During a glide Lenis would undo a key scroll, so a scroll key ends the glide first (D-061). P5's palette navigates from code, which neither covers; it will need its own reset.

### D-052 Stirring the field

- REQ-SCR-06. The pointer reaches the field only on field routes, with calm off and a GPU tier. Moves are sent at most once per frame and a release at once. Touch is read from passive touch events on the window, never pointer events, because pointer events stop as soon as a finger scrolls the page; nothing calls preventDefault and touch-action is unchanged, so scrolling stays native. A headed touch test dragged 200 px, scrolled the page 185 px and stirred the field. A real phone is checked at P7.

### D-053 Title reveals

- REQ-SCR-05, REQ-A11Y-03. Only the Work, About and Contact titles are revealed, once, word by word with SplitText: 0.8 s, power3.out, 0.08 s between words, starting when the title is 85% down the viewport. A title already on screen at load is left alone. The hero headline and the chapter labels are never animated, since they are first content.
- In calm the whole title fades in over 0.3 s with no split, switching live with the toggle.
- Every function given to gsap.context is wrapped so it cannot throw, because gsap 3.15.1 leaves a failed context current. Teardown on leaving the page reverts the context, kills every trigger, reverts every split and removes every listener; a jsdom test with real GSAP counts 14 triggers while running and none after.

### D-054 Chapter lengths

- REQ-SCR-01. The storyboard puts the chapters at about 0, 10, 30, 55, 75 and 90% of the scroll. With the first heights, making-of started at 68.9% and about at 82.3%. Section heights are now: bloom 175svh, making-of 185svh, about 140svh, contact 120svh with its words at the bottom; work keeps its cards with 20svh of room under each.
- Measured starts: 0, 10.3, 28.7, 56.4, 75.8 and 90.4% at 1280 x 800, and 0, 11.2, 29.2, 56.6, 75.7 and 90.2% at 375 x 812. The home page is about 10.6 screens long at 1280 x 800. The gate fails a chapter that drifts more than 5 points from its share.

### D-055 The budget after P3

- REQ-PERF-04, REQ-PERF-05. The budget check found ScrollTrigger in the first load of every route, wrongly: the layout's code keeps the property name ScrollTrigger after minification even though the library arrives later by dynamic import. The check now looks for strings only the library contains ("pin-spacer" and its registration warning, matched in full since the audit, D-064), checked against the package files and the built chunk, with two unit tests.
- First load after P3, in the gate rerun: 139.8 KB on / and 138.2 KB on the other pages. The three.js chunk, which now also holds the shapes and the choreography, is 226.0 KB gzip; tiers 1 and 2 load 228.8 KB. Gate run 1, before the review fixes, measured 139.6 KB and 228.7 KB.
- The budget result file is written once per day of gates, so docs/results/2026-11-10-budget.md holds the rerun's figures above; P2's figures from the same day are in its commit.

### D-056 Contrast with the story

- REQ-A11Y-06. Text over formed shapes is measured headed, 12 frames each, with the veil at 70%: the mark, two work shapes, the sheet and the wave on tier 1 and tier 2 at 1280 and on tier 2 touch at 375. Each text colour is compared with the brightest pixel inside its own boxes; text on cards or other filled surfaces and visually hidden text are left out. Worst figures in the P3 gate: muted text 5.50 to 1 over the making-of sheet on tier 2 at 375 x 812, body text 12.29 to 1 over a work shape on tier 2 at 1280 x 800.
- The hero case keeps P2's method. Its muted figure is now 4.59 to 1, because the hero's dot sits inside the headline's box; it passes, with less room than P2's 5.21. Where the dot sits is on the design review list.

### D-057 Testing the story

- The gate gains e2e/story.spec.ts: chapter starts on the natural tier and forced tier 3, a wheel that moves exactly its own distance with nothing pinned or snapped, Lenis on desktop only and gone with calm, the story torn down and rebuilt across / to /work and back, calm stills, the toggle, keys and focus with Lenis running, and axe at the top and after every chapter. The keyboard test, added after the review, tabs through the bar to Calm, turns it on with Enter and off with Space, pages down into the work chapter and presses End to reach contact with the wrapper following, and tabs into every study, each fully in view and whole; Lenis sees the key scrolls as native ones and never animates them. Its keys, and the wheel test's wheel, wait until the field is shown: in a gate run of many browsers on one GPU, a Page Down pressed while the tier 1 probe drew sometimes did nothing, and a wheel glide counted too few positions. The reduced-motion test in e2e/engine.spec.ts now expects the hero still to be the dot, then checks the contact still for the lit field.
- No browser check counts live ScrollTriggers, because GSAP is not on window in the production build; the route test checks the story's behaviour instead (one write per chapter change, none on /work, the title split once on return).
- The headed suite gains e2e/headed/story.spec.ts (a frame-rate test per chapter, the mark forming and dissolving, cursor stirring with calm stopping it, and touch stirring) and e2e/gpu/story.spec.ts on the development page. Stirring is measured as the light at the pointer against four control boxes, which cancels the field's own drift.
- The per-chapter frame-rate test holds the median line and fails on any frame as long as four frames at the tier's pass line (about 67 ms on tier 1, 134 ms on tier 2), instead of P2's rule that 95% of the frames the measured median promises arrive. During the build, frames sitting at the edge of one 240 Hz interval were reported to fail that rule in 3 of 5 runs while every median was 4.20 to 4.30 ms; that output was not kept, so the figure is a report, not a recorded result. The P2 tests keep the 95% rule. The audit added checks to this test (D-064).
- pnpm e2e:gpu takes about 9.9 minutes, so it is run in two parts under the 10 minute command limit: the story and home field files, then the contrast and probe files.
- The formed-state contrast loop marks each state as text or field only. A text state must find at least one text box, so a broken selector fails; a field-only state (bloom 0.6, making-of 0.5) must find none, so the mark cannot go stale.

### D-058 The probe measures the ambient field

- REQ-TIER-01, REQ-PERF-06. Found in the P3 review: the engine handed the page's story to a runtime as soon as it was built, so the tier 1 probe timed whatever chapter the page was on. In the hero only the dot's 400 particles draw, so a landing at the top timed the compute pass and 400 sprites and could pass a GPU that cannot carry the whole field; a reload inside a dense formation leaned the other way.
- The controller now hands the story and the pointer to a field only when its tier is adopted, keeping the latest values until then. The probe's runtime hears neither, so it draws the ambient field at the real count, the load the probe judges. A runtime seats the first story it hears with one reseat step even after it has run, and the probed canvas stays hidden until tier 1 has drawn its first frame there, which is also when ready is sent, so a visitor never sees the ambient field gather into the dot.
- Tier 2, forced tiers, a lost device and calm keep their order: the story reaches the runtime before it runs. A runtime that throws while it is handed the story takes the lost-device path. On the development page a field started with no chapter now starts on the first chapter chosen instead of gliding into it. The engine contract in src/engine/types.ts is unchanged. Four unit tests citing REQ-TIER-01 fail on the earlier code.

### D-059 The bloom line follows the tier

- REQ-SCR-01, REQ-CNT-01, rule A14. Decided by T7SEN on 10 Nov 2026, after the review asked about the line on tier 3: work like the hero headline. The static HTML carries "On a capable device, one field becomes every project on this site.", which is true on every tier, and the approved line replaces it only while a tier 1 or 2 field is on screen, chosen and drawn; the first line returns while a tier changes and if it drops to 3.
- The section stays a server component. A small client island, src/components/home/bloom-line.tsx, reads the tier store; both lines reach it as props, because src/content/story.ts imports the study index and would bring every study's text into the client bundle. The other line is held in a hidden ::before in the same grid cell, so the cell keeps the height of the longer line at any width and the label above it never moves.

### D-060 The smooth scroll loads without SplitText

- REQ-PERF-04. Found in the P3 review: the smooth scroll loaded GSAP through the story's loader, which also imports SplitText, so every desktop route downloaded SplitText after first content although only the home page's story uses it. src/lib/load-motion.ts now has loadScrollTrigger (gsap and ScrollTrigger), which the smooth scroll uses; loadMotion calls it and adds SplitText, so both share one gsap and one ScrollTrigger. A unit test with the pinned GSAP checks that loadScrollTrigger never loads SplitText.

## P3 audit, 11 Nov 2026

### D-061 Lenis gives way to native moves

- REQ-SCR-02, REQ-NAV-01. Found in the audit: while a wheel glide runs (about a second after the last notch), Lenis 1.3.27 writes the scroll position on every frame and follows a native scroll only once no glide runs (dist/lenis.mjs 664 and 834 to 840). A click on Skip intro or on the skip link, a scroll key, or the scroll that brings a focused element into view, made during a glide, was undone. A gate test reproduced it on the P3 build: Skip intro clicked 87 ms into a glide left the page at 300 px, not at the work chapter at 2591 px.
- While Lenis runs, three capture-phase listeners on window end a running glide before the browser moves the page: a click on a link to a place on this page, a scroll key (Space, Page Up, Page Down, the arrows, Home, End) outside a form field, and focusin. The glide is ended with stop() then start(), the public methods that both run Lenis's reset() (lines 698 to 720); reset() itself is private in Lenis's types. The listeners are removed with Lenis.
- Left as they are: a drag of the scrollbar during a glide is overridden until the glide ends, and a link to this same page with no hash does not end it.

### D-062 A calm still feels no pointer

- REQ-A11Y-03, REQ-A11Y-04. Found in the audit: turning calm on with the mouse resting over the field settled the still with the pointer's push still on, because the calm store tells the engine at once while the page lets go of the pointer only after React has rendered. The still kept a hole at the cursor.
- The runtime keeps the last pointer the page sent and applies its push only while the field runs: none during any still settle, and the kept pointer again when the field runs. This holds D-052's rule inside the engine. Two unit tests fail on the earlier runtime.

### D-063 The hero allows for a two-row bar

- REQ-NAV-01. Found in the audit: below 22rem (352 px) the bar's links and the Calm toggle no longer fit one row and the bar wraps to two (112 px), while the hero still subtracted one row (4.25rem). At 320 by 568 Skip intro sat at 552 to 596 px, 16 of its 44 px on screen. Decided by T7SEN on 11 Nov 2026: the hero allows for the two-row bar. Below 22rem it subtracts 7rem; at 22rem and wider nothing changes, and below it the hero is 44 px shorter, so at 320 by 568 Skip intro moved from 552 to 596 px up to 515 to 559 px. A gate test at 320 by 568 checks the bar wraps and See the work and Skip intro show whole on the first screen; it fails on the P3 build.
- The limit, measured at 320 by 548 on the fixed build: the hero's content (403 px with the short-screen spacing) is taller than its minimum height there (436 px less the bar), so the content sets the height and Skip intro ends at 559 px, 11 px below the fold. Before P3 the one-row bar left it in view at that size. Closing it needs tighter spacing on narrow short screens, a visual change, so it is put to T7SEN.

### D-064 Checks the audit tightened

- REQ-PERF-04. The budget check now fails when src/lib/load-motion.ts has code and no built chunk is detected as GSAP, ScrollTrigger, SplitText or Lenis, as it already did for three.js and the engine entry, so a signature that stops matching can no longer pass in silence. ScrollTrigger's warning signature is matched in full, "Please gsap.registerPlugin(ScrollTrigger)", because the shorter string also matched the app's own registration line. Unit tests read the module builds the bundler takes.
- REQ-PERF-06, REQ-SCR-01. The headed per-chapter frame-rate test (D-057) also checks, per state, more than 5 frame-rate readouts, the engine's rate within 3% of the page's, and a frame floor at the pass line (at least 567 frames on tier 1 and 285 on tier 2 in the 10 s window), so a field that stops drawing early in a window, or stalls that lose about three quarters of the window at 240 Hz, fail it. The readouts arrive once a second, so calm switched on late in a window can still pass; that is a known limit of this check.
- REQ-A11Y-04. The calm half of the cursor test checks that the still is lit before comparing screenshots. That check showed the half had compared two frames of the hero's dot since P3: the bar is not sticky, so clicking Calm scrolled the page to the top. The test now takes the page back to contact before the still. The settle check reports the page height, the scroll position and Lenis's classes before and after, so a repeat of the 153 px move seen in the P3 rerun names its cause.
- Decided by T7SEN on 11 Nov 2026, each the option recommended to him: D-057's figures stay as reported, output not kept, with no extra runs; the scene lines keep their wording. The reason given with the recommendation: "where your device draws the field live" already makes each line true under calm.

## Design review, 11 Nov 2026

Decided by T7SEN on 11 Nov 2026 from the design review (screenshots of every chapter and page on each tier at 1280 and 375 px): veil by chapter with rim light; the dot into the clear band; marks beside the cards; outline cards on the home page; chapter titles in Unbounded; services as type; /work in two columns; the intro line with its title; the scrollbar ends a glide. He approved the plan as written, setStage as its own command. None of these departs from the brief.

### D-065 setStage, a sixth engine command

- REQ-ENG-03, REQ-SCR-01. The page measures two places from its own layout and sends them as stages, in normalised device coordinates: the hero's dot point and, from 64rem, the free side beside the study cards. The engine keeps the latest, hands it to a runtime before the story when a tier is adopted, and the runtime turns it into the dot's centre, the shapes' centre and the size the shapes are fitted to. The centres follow over 0.6 s, as the camera push does, so a resize or the step from the work stage to the whole frame glides; a calm field is put on its new stage and drawn once.
- Its own command, not a third argument on setStory: the stage changes with the layout, never with the scroll, so setStory keeps its cheap per-frame path.

### D-066 The dot sits in the clear band, and the bloom grows from it

- REQ-SCR-01, REQ-SCR-07. The review found the dot hidden under the headline at every width. It now sits at the middle of the band between the hero's actions and Skip intro, at the middle of the screen's width (data-stage marks in hero.tsx), clamped inside 0.9 of the screen's height. The bloom lets particles go in order of how far their home is from the dot, so the field grows out of it wherever it sits.
- The dark hole around the dot early in the bloom came from the bloom's light rule: homes nearer the centre than 0.15 counted from 0.15, so particles resting there were dimmed. The floor is now 0.02, below the dot's radius, and distances are measured from the dot.

### D-067 Study shapes form beside the cards; home cards are outlines

- REQ-SCR-01, REQ-I18N-01. From 64rem the work chapter's stage is the side of the content the card column leaves free (32 px gap, at least 240 px wide, 0.85 of the screen's height), measured with the column's own direction, so a right to left page mirrors it. Below 64rem the shapes keep the whole frame.
- The home page's study cards are outlines (border in the edge token, no fill), so a shape behind a card, as on a phone, shows through. /work keeps filled cards.

### D-068 Rim light on formations

- REQ-SCR-07, REQ-ENG-05. The review found every formation a flat, dim silhouette. A formed particle near its shape's outline now adds up to 2.8 times the light of one inside (RIM_GAIN 1.8) and leans toward glow (RIM_GLOW 0.6). Shapes carry an edge weight per point in the atlas's third channel, from an exact distance transform over a 256 grid of each shape (runtime/shapes/edge.ts, linear in the grid, on the CPU once per runtime); the sheet lights its outer 6% and the wave the outer 40% of its band. Every value is the particle's own, read by its instance index, so WebGL2 runs it as WebGPU does.

### D-069 The veil opens where no text is, plates keep 0.7 behind text

- REQ-A11Y-06, REQ-SCR-07. Decided as "veil by chapter". A veil across the whole screen could not open at the bloom mark's fullest, because the bloom's words are on that same screen (a probe measured 0.56 at best). So the veil is two layers: while the story runs on tier 1 or 2 the wrapper's veil opens to 0.35, and a soft plate of the void colour behind every text element brings those areas back to 0.7 (the plate's own opacity is 1 less 0.3 over 0.65; it covers the element's box plus 16 px and fades over a further 80 px). The plates sit in a layer at the page top, outside header, main and footer, so they scroll with the text natively and the contrast spec still measures them. Tier 3's still keeps 0.7 and shows no plates. Before the story starts and on every other page the veil is the wrapper's 0.7.
- Replaces the single 0.7 veil of D-043 on tiers 1 and 2 while the story runs. The contrast spec measures it as shipped (headed, 11 Nov 2026, docs/test-log.md): the hero's text over the void at 17.24 to 1 and muted 7.27 at 1280 x 800 (4.59 at P3, when the dot sat behind the headline); over the formations the worst muted is 4.62 to 1, at making-of 0.8 on tier 1, where the sheet's rim runs behind the chapter's words, and the worst text 6.92. That muted figure has less room than P3's 5.50; P4 rebuilds that chapter. Plates cover each text element's whole box (its outermost heading, paragraph, link or button, else its list item), as the spec measures it, and are kept inside the page's width so the page never scrolls sideways.
- The rim was first 2.5 (D-068). On the development page the tier 2 coup-online mark then reached a luminance of 0.52, over the spec's 0.5 limit for light piling to white, so it is 1.8.

### D-070 Chapter titles, services and /work

- REQ-SCR-05. The Work, About and Contact titles on the home page are set like a page title (Unbounded, text-title, 28 to 48 px): they are the story's big titles, where the cinematic tone and the word reveal belong. Services sets its two offers as type under a thin edge rule, not as boxes that held one line each. /work lists the studies in two columns from 64rem.

### D-071 The line under a title reveals with it

- REQ-SCR-05, REQ-CNT-01. The review found the Work intro line showing before its title. The line under each revealed title (data-story-intro) now waits hidden with it and fades in on the same trigger over 0.9 s, ease power2.inOut, so it trails the title's 0.8 s words; in calm mode it fades with the title in 0.3 s. Static HTML hides nothing.

### D-072 A scroll Lenis did not write ends the glide

- REQ-SCR-02. Amends D-061's "left as they are": during a glide Lenis writes its own position on every frame (dist/lenis.mjs 834 to 840) and follows a native scroll only once no glide runs (655 to 678). A scroll event whose position is more than 2 px from Lenis's animatedScroll while it glides was made by something else (a scrollbar drag, find in page, a script), and now ends the glide with stop() and start(), as D-061's listeners do. A link to this same page with no hash still does not end it.

## P3.5 Preview look, 11 and 12 Nov 2026

T7SEN added this phase after the design review and approved its plan as written on 11 Nov 2026. Two preview designs set the look: the home page at 1440 px and the launch artboards. His words: "Treat the previews as the main goal." Where the two differ, the home preview wins; the artboards set only the pages it does not show. The look is adopted; facts are not, unless they are on record or T7SEN accepted them. Pieces of the previews that belong to P4 to P8 stay in their phases. The entries below record what was built and every place it departs from an earlier decision or the brief.

### D-073 The previews are the goal

- REQ-CNT-01, REQ-CNT-10. Decided by T7SEN on 11 Nov 2026. Earlier layout decisions give way where the previews differ: the services placement of 9 Nov 2026 (D-033), the dot's band (D-066), the shapes beside the cards (D-067) and /work in two columns (D-070), each superseded below. Hard rules still win over the picture: facts on record only (A1), honest tiers (A14), no control before the phase that makes it work, contrast (REQ-A11Y-06), logical properties (REQ-I18N-01) and the first-load budget (REQ-PERF-04). The home preview's black and text colours, a step off the palette, are not adopted: the tokens stay.
- Copy the previews show that was not on record: T7SEN accepted ten items as shown on 11 Nov 2026 (the Coup Online, ArcheLab and SystemSeven lines, the stacks, the About words, the skills, the two service descriptions and the hiring line, the footer tagline) and still owes a check of them. The stream link stays a marker until he gives it. Figures and quotes stay markers until P4.

### D-074 The field is a halftone

- REQ-ENG-05, REQ-PERF-06. Decided by T7SEN on 11 Nov 2026 ("Halftone everywhere"), after stand-ins of each option. Particles are no longer drawn as additive sprites. Each splats one texel into a half-float target four texels a side per cell, and a gather pass sums each cell's tent filter from it: a half-float sum rounds every draw to 11 bits, so thousands of light particles summed into one texel would stall well short of their total. Two blur passes at cell size, then one full-screen pass draws one antialiased dot per cell, a soft glow under bright areas, a faint backdrop lattice near activity and the hero dot. Every pass is a plain render with additive blending: no compute, no storage texture, no atomics, so tier 2 draws it as tier 1 does.
- The plan named RenderPipeline, pass() and gaussianBlur. The field has one scene and needs the blurred density as a number inside its own pass, so it uses render targets and QuadMesh passes directly, with its own separable blur (21 taps, sigma 3.5 cells). P4 can wrap the same targets for the making-of's passes.
- A cell is 8 CSS px, sized from the canvas's CSS size and never the drawing buffer, so the adaptive resolution's steps never move the lattice. Below 480 px wide a cell is 6 px, because the wordmark read thin at 8 px on a 375 px screen, the risk the plan named.
- The rules for tone, dot size and colour are plain functions in runtime/halftone-rules.ts, unit tested in Node, and mirrored in the pass's shader.
- Headed on this PC (Chromium 158.0.8127.18, RTX 4060 Ti, 1280 x 800, 240 Hz display): tier 1 at 1,000,000 and tier 2 at 250,000 and 100,000 particles each held 2401 frames in 10 s at a median of 4.20 ms, the display's ceiling. REQ-PERF-06's lines (60 fps tier 1, 30 fps tier 2 desktop) hold with wide room.

### D-075 Violet, glow and white, and the burn rule per cell

- REQ-A11Y-06, REQ-SCR-07. Decided by T7SEN on 11 Nov 2026 ("Violet, glow and white"). Sparse cells are violet; a formation's fill lands on the glow token, its density scaled by the formed area; the near-white text token is kept for rim cells and the densest formed cells. Only a study shape or the making-of sheet turns its densest cells white: the About strands and the contact rings stay violet and glow, as the preview draws them, and on a phone the strands' crossings had reached white under the About text.
- The headed burn rule read the brightest canvas pixel against 0.5, which white dots fail by design. It now reads 8 px cells: the brightest cell's mean luminance stays under 0.5, and white cells (brightest pixel past 0.6) stay under 25% of the lit cells and 4.5% of all cells. Set from the runs of 12 Nov 2026 after the shapes became outlines (D-087): brightest cell mean 0.3358 at most, white 21.63% of the lit cells and 4.15% of all cells at most. The limit for all cells was 6% while ArcheLab's bubble lines were filled bars.

### D-076 The soft field stays as the fallback

- Rule A11, REQ-ENG-08. At start the runtime draws two additive quads of 0.75 into a half-float target and reads the sum back through an 8-bit target. Only a sum past 1 gives the halftone; a failure, a clamp or no blending gives the soft field of P3. Runtime.look reports which one is live. The development page forces the soft field with ?look=soft, and a headed test tells the two apart by the light at a cell's corners against its centre (0.025 for the halftone, 0.99 to 1.01 for the soft field).

### D-077 The bloom forms the mark, then the wordmark

- REQ-SCR-07. Decided by T7SEN on 11 Nov 2026 ("Mark, then wordmark"), replacing the mark-only bloom of 10 Nov 2026. The release from the dot completes by progress 0.3, the T7 mark gathers by 0.42 and holds to 0.5, turns into the T7SEN wordmark by 0.64, the wordmark holds to 0.84 and is gone by 0.97. The calm still is progress 0.74, the wordmark whole. The field chapter forms inside the middle 0.8 of the screen, so the flow's ellipse has room round the word.
- The wordmark is set in Unbounded Bold: the static fonts/ttf/Unbounded-Bold.ttf of github.com/googlefonts/unbounded, Copyright 2022 The Unbounded Project Authors, under the SIL Open Font License 1.1, which allows the font to be used and embedded. T7SEN said yes to the download on 11 Nov 2026; the file stayed outside the repository. A scratch script with no dependency read its cmap, head, hhea, hmtx, loca and glyf tables and its kerning, set the five letters with 0.02 em tracking, flattened the curves and simplified each outline to within 0.25% of the word's width. Only the five outlines are committed, in runtime/shapes/marks.ts, with a comment naming the font, its source and its licence.

### D-078 Flow lines and a flow clock

- REQ-ENG-05, REQ-SCR-07. Decided by T7SEN on 11 Nov 2026 ("Dotted flow lines"). After the bloom, 80% of the particles stream along six lines picked from each particle's own seed: a loose ellipse round the formation and five open curves that run past both sides of the frame. The other 20% keep noise homes and make the sparse backdrop, of which only a sprinkle is lit (1.5% of cells), so tier 1's million particles never lay an even screen of dots over the page. The lines take their particles as the release goes from 0.9 to 0.995, and the flow clock moves only after that, so the bloom still grows outward from the dot by home distance. A particle that passes the end of an open line is put back at its start outside the frame, judged from its own place before and after the step only.
- On the fixed lattice a gently sloping line shows as short runs of row-aligned dots, not the preview's evenly spaced dots along the curve. That is inherent to one dot per fixed cell; the lines are drawn dimmer and smaller to come closer.

### D-079 The page drives a moving stage

- REQ-ENG-03, REQ-SCR-05. No new command: setStage now carries three stages. The hero's is an empty box beside the headline (D-081); the work chapter's is the frame of the study row in view, sent on every scroll frame while the chapter is on screen and only when it moved; the contact chapter's is the contact panel as it rests at the page's end, where the rings wait for it. A stage that moves at most 0.2 of the half screen between two calls is taken at once; a longer move glides as before. The runtime follows the formed particles' own centre with the spring a formed particle feels (pull 9, drag 5.5) and draws them ahead by the gap, so a shape stays on its frame while the page scrolls; only the drawn place moves, the simulation is unchanged. A step of 0.2 of the half screen is 80 px on an 800 px screen, so a scroll's small moves from frame to frame are taken at once and a 100 px jump glides. Measured headed on the production home page (12 Nov 2026): 100% of a shape's light inside its frame at rest, after a wheel and in the middle of a scroll in 30 px steps, and 95.2 to 99.7% just after a 100 px jump, while it glides.
- In calm mode and under reduced motion the work stage is the frame with its middle at the screen's middle, so the stream stops and the field keeps one still per study.

### D-080 One label system, pills, panels, header and footer

- REQ-A11Y-02, REQ-A11Y-04, REQ-I18N-01, REQ-NAV-01. Home chapters are labelled "01 / Field" to "05 / Contact" in mono capitals; elsewhere words join with a middle dot. Actions are pills with an arrow (the primary a lavender glow pill with void text, 7.39 to 1; outline pills), stacks are mono chips, kinds are badges (Short-form plain, In progress in violet with an open circle), and framed panels take the surface fill, a hairline border and 16 px corners. Hairlines are the edge token at 40% on pills and chips and 55% on outline pills and the dashed box: they outline controls whose words already name them.
- Header: the T7 mark and the T7SEN wordmark (T7SEN's answer, 11 Nov 2026) in a link named "T7SEN, home"; Work, About, Contact and Calm in one nav named "Site controls" until P5 replaces the links with Sound, Ctrl K and Menu. Below 640 px the controls take their own row, so the bar is 120 px tall on phones until P5. Footer: the wordmark and the tagline, a link row with Making-of and GitHub, the Calm pill that says its state in words, and the copyright with the year of the build.
- Calm is a switch (role switch, aria-checked) in the bar, the hero's corner and the footer, all on the one calm store; the OS reduced motion setting still wins and says so.
- Links are underlined at rest, a departure from D-010's links with no resting underline: the main link in the text colour with its glow arrow, a second link beside it muted. Hover brightens to the paper token (#F4F4F7), the lightest the palette has, where the preview goes to white. The focus ring's offset goes from 2 to 3 px, as the preview sets it.
- The page column follows the preview: at most 1280 px wide with 56 px gutters from 1024 px (was 1152 px and 32 px). The wordmark and page titles are set in Unbounded at 700, outside the type scale's single weight of 600, as both previews set them.

### D-081 The hero, and the dot beside the headline

- REQ-SCR-01, REQ-CNT-10, REQ-PERF-03, REQ-NAV-01. Supersedes D-066's band. The hero, named Intro, has a violet eyebrow and a two-line headline on every tier, the second line muted; only the second line changes with the tier, and the static HTML still carries the tier 3 line (D-027). From 1024 px the dot's place is a 16rem box at the inline end beside the sub-line and the actions, and the headline takes the preview's size there (4.4% of the window, 44 to 64 px) so its plate never covers the dot; below 1024 px the dot sits in the room between the bar and the eyebrow. The dot is an analytic disc with two soft rings that breathe with the pulse, at the centre of a round dot-grid halo; its particles stay out of the splat.
- The foot of the hero from 640 px: Skip intro as a pill at the start, the Scroll cue in the centre, the Calm switch at the end. On phones See the work runs the full width with the tier readout under it, which shows the count the engine's ready event reports (1M, 250K or 100K) and nothing on tier 3 or before the field is ready (A14). The ready event gains that count as a field; it is still one of the three events.
- With the services gone from the top, the hero keeps empty room after its first screen where the dot pulses alone, so the field chapter still starts near its storyboard share. Measured chapter starts on a phone: 0.0, 7.5, 27.9, 57.8, 74.2 and 89.1% of the scroll.

### D-082 The field chapter, the study rows and the three shapes

- REQ-SCR-01, REQ-A11Y-03, REQ-A11Y-05. Supersedes D-067 and D-059's bloom line. The field chapter, named The particle field, has the label at the top start, the tier readout at the top end once the tier is ready, and a note at the bottom start that follows the visitor: "Move the cursor to stir the field" with a fine pointer, "Drag a finger to stir the field." on touch, "Still frame on this device" on tier 3, nothing in calm. Over the chapter, with a mouse on a live tier 1 or 2 field and calm off, a 44 px ring with a dot at its centre follows the cursor as well as the system cursor. The particles near an active pointer are drawn turned about it in this chapter only; the push that stirs the field works in every chapter (REQ-SCR-06).
- Each full study is a framed row: the frame at the start, see-through on tiers 1 and 2 so the field forms the study's shape inside it over a faint lattice, the details at the end. The plates behind text are cut along a frame's rounded border wherever their soft edge reaches one, so no plate dims the field inside a frame. Tier 3 shows a still of that shape, loaded only once tier 3 is chosen. Short studies are framed cards with their badge and no shape. A row quote that is still a marker shows muted in a raised panel with no quotation marks, so it never reads as words a person said.
- The work shapes follow the preview: the making-of as four sheets in perspective, Coup Online as five cards fanned by 15 degrees, ArcheLab as a chat bubble with three lines. Each layer has a weight carried in the atlas's fourth channel, so the back layers are dimmer. The t7sen-url and SystemSeven shapes are gone: short studies have no shape. The atlas holds five shapes, 16,384 points each (1,024 by 80 float texels, about 1.3 MB on the GPU).
- The About wave becomes three dotted strands across the full width, one bright and two faint, offset in phase. The contact chapter forms three faint dotted rings, a fourth formation weight, centred on the contact panel.

### D-083 /work as a table; /about and /contact; the address shown

- REQ-CNT-02, REQ-CNT-07, REQ-CNT-11. /work is the launch artboard's table (No., Project, What it is, Built with, Study), one row per study in study order, the v1 row, then a closing panel; it replaces D-070's two columns. Below 1024 px each row stacks under its number with small mono labels, so nothing scrolls sideways at 320 px, and every part keeps its table role. The Built with cells are the accepted stacks and SystemSeven's stack on record, not the artboard's unconfirmed cells.
- /about follows the launch artboard with the home preview's words: a framed panel with the purple mark as a logo over a ring of dots (decoration, hidden from assistive technology), the About text, the offers as cards, Tools I use and Elsewhere. Its headings Streaming, Skills and CV give way to What I build, Tools I use and Elsewhere. The waveform panel waits for Sound at P5, because its caption speaks of sound.
- /contact shows hello@t7sen.com as a mailto link with a Copy button: T7SEN's answer of 11 Nov 2026, a departure from the brief, which keeps the address hidden. The Copy button appears only once script runs, so the static HTML never shows a control that does nothing; it announces "Address copied." or "Could not copy. Select the address to copy it." politely. The form's place holds its marker in a dashed box until P6, with no fields.
- The services moved from the top of the home page into the contact chapter under "What I take on", with the hiring line, and onto /about: a departure from T7SEN's placement of 9 Nov 2026, taken from the preview by his newer instruction.

### D-084 The veil behind text is 0.8

- REQ-A11Y-06. The plates behind text go from 0.7 (D-069) to 0.8 on tiers 1 and 2 while the story runs. With the halftone, a white dot of the making-of sheet behind muted text on a phone measured 4.31 and 4.42 to 1 at 0.75; at 0.8 the worst muted text anywhere is 5.17 to 1 (headed, 12 Nov 2026). The open veil where no text is stays 0.35, and the wrapper's 0.7 before the story loads is unchanged; on tier 3 the wrapper's veil is now 0.75 (D-089). Text that arrives after the page was measured (the field's note and the readouts) gets its plate: the story lays the plates again after a tier or calm change.

### D-085 Words live in src/content

- REQ-CNT-01, REQ-CNT-05, REQ-CNT-06. Each study gains its listing: a kind label, one line, a short stack, the /work table's cells and, on full studies, metric slots whose values stay markers until P4 and an optional row quote that is a recorded quote or a marker. The chapter labels, scene lines, field notes and the alt text for the wordmark's still sit in content/story.ts, which now imports nothing at run time, so client islands read them directly. A new content/site.ts holds the tagline, the address, the GitHub link, the copyright line and the accessible names.
- The making-of chapter's line for now is "The render passes that draw this field, and what each device tier shows." The preview's line asks the visitor to select a pass, which only P4's pass viewer makes possible, and speaks of a field the visitor stirred, which is not true on tier 3 or in calm mode.

### D-086 WebP stills, and the files that went

- REQ-TIER-03, REQ-PERF-05. The tier 3 stills take the smaller format, chosen against JPEG on 12 Nov 2026. At the first capture the field stills were lossless WebP at 87,570 and 84,086 bytes, where JPEG at quality 80 was 97,932 and 94,903 bytes and lost detail; the study stills were WebP at quality 0.8 or 0.85, where JPEG needed quality 40 to 48 to fit 100 KB. After the review's fixes: field-wide.webp 87,582 and field-tall.webp 82,448 bytes (lossless), the three study stills 89,908 to 96,176 bytes at quality 0.8. The capture test encodes the lossless frame in the browser, since Playwright writes no WebP. The field stills show the field between formations, no mark, so their alt stays empty. The manifest lists these five and the two wordmark stills (D-089) on both tier 3 rows.
- Removed as replaced or unused: public/still/field-wide.jpg and field-tall.jpg (D-042), and the components nothing imports any more: home/action-link.tsx, home/bloom-line.tsx, study/study-list.tsx and study/study-card.tsx.

### D-087 The study shapes are drawn as outlines

- REQ-SCR-07, REQ-A11Y-06. Refines D-082's layered shapes to match the preview. Every layer of the making-of's sheets, Coup Online's cards and ArcheLab's bubble takes its points along its own outline. The layers behind add a faint fill only where no layer in front covers them, and the front layer's fill sets the light, so the fill lands on the glow token; only the front layer's rim can turn white. Coup Online reads as five separate cards. ArcheLab's three lines are thin single rows of dots: the accent, white, and a light lavender between the two. With the outlines, white cells are 4.15% of all cells at most (Coup Online), and the burn rule's limit for all cells goes from 6% to 4.5% (D-075).

### D-088 The field chapter holds its words on their own plates

- REQ-A11Y-06, REQ-SCR-01. The field chapter keeps one sticky screen through the chapter, so the label, the tier readout and the note stay in view with the mark and the wordmark, as the preview shows them. The veil's plates are laid on the page and cannot follow a sticky element, so each of the three carries its own plate, tied to the veil's numbers by a test, and the page's plates skip them. Measured headed over the formed wordmark: muted text 7.27 to 1, text 17.24.

### D-089 A tier 3 still of the wordmark, and tier 3's veil at 0.75

- REQ-TIER-03, REQ-A11Y-05, REQ-A11Y-06. On tier 3 the field chapter shows a still of the formed wordmark behind its held screen, loaded only once tier 3 is chosen, with the alt "The T7SEN wordmark formed in the particle field". The two files are JPEG, the smaller format for this frame at the same loss (D-086's rule): field-wordmark-wide.jpg 120,419 bytes at quality 0.85 and field-wordmark-tall.jpg 97,444 bytes at quality 0.9.
- The wrapper's veil on tier 3 goes from 0.7 to 0.75. The hero's headed check on tier 3 found a glow dot of the field still (#A68AF8) behind muted text: at 0.7 that leaves the text at about 4.5 to 1, at the line, and at 0.75 it measured 5.01 to 1. The field chapter's wordmark still sits behind the same 0.75.

### D-090 The phone wordmark, the halo, the rings, the strands, the swirl and calm

- REQ-SCR-06, REQ-SCR-07, REQ-A11Y-03. On a frame narrower than 0.7 of its height the wordmark spans the full width, a quarter larger with its letters further apart, and the flow's ellipse widens to 0.92 to close round it. The hero's halo reaches the larger of half the dot's box and 170 px scaled by the window's width over 1440, so 170 px at 1440 and 151 px at 1280; the box is unchanged. The contact rings are half as thick and the About strands thinner. The frame's faint lattice fades over two cells of the live size, 6 px on phones. The swirl shows only in the field chapter (D-082). A calm field settles once per change: setStage and setStory record what is owed, and one microtask seats, settles and draws the still.

### D-091 Focus, link names and copy

- REQ-A11Y-01, REQ-A11Y-02, A14, A15. Every focusable element holds the glow outline colour at rest, so Tailwind's colour transitions never fade the focus ring in: focus changes only the outline's style, which does not animate. Study links in the short cards and the /work table carry the study's title in their names ("Full study, Coup Online"), starting with the visible words. The tier readouts are plain text, not live regions. Copy corrected: the making-of row says the field re-forms into each full study; /contact's intro promises only a reply until P6 builds the form; the /work note reads "No 3D · Static HTML" in place of a claim nothing measured; the v1 row takes /v1's own intro. links.t7sen.com joins /about's Elsewhere. Scene lines name nothing only the halftone draws, so they stay true on the soft field. Code that nothing used was removed.

## After P3.5, 12 Nov 2026

### D-092 Development builds say why the field could not start

- REQ-ENG-08, REQ-ENG-10. On 12 Nov 2026 a browser session whose graphics had been turned off showed the still frame on the development server with the reason no-backend, and nothing said which renderer had failed or why; a restart of the browser fixed it. The engine now writes a console warning, outside production only, for each renderer that cannot start ("engine: the webgpu renderer could not start", then webgl2), with the error it threw, and a console error when anything unforeseen stops the field. The events and their reasons are unchanged, so the contract keeps its three events. Each call site tests NODE_ENV itself, so the production build drops the messages whole: no built chunk holds them and the engine entry stays 2.9 KB gzip. Renderer failures reach analytics at P6.

## P4 Making-of and full studies, 12 Nov 2026

Built on 12 Nov 2026 to the preview's P4 part, with T7SEN's answers of the same day for every fact the studies show. The entries below record what was built and every place it departs from the brief, a requirement or an earlier decision.

### D-093 The making-of passes are points, velocity, density, glow and final frame

- REQ-ENG-09, REQ-ENG-05, REQ-TIER-03. A departure from the requirement's wording, which names wireframe, velocity buffer, lighting and bloom: the halftone field has no mesh and no lights, so a wireframe or a lighting pass would show nothing the field draws. The five passes are the frame's own steps in its order (PASSES in src/engine/story.ts): points, every particle splatted at one texel; velocity, each particle's speed and direction from the simulation; density, the cells' summed tents; glow, the blurred density; final, the halftone screen itself.
- Tier 1 draws all five live. Tier 2 draws four (LIVE_PASSES): a live velocity pass costs a second draw of every particle, so tier 2 shows a still of it, which is how its "fewer buffers" reads. Tier 3 shows a still of every pass. The soft look (D-076) has no halftone targets and draws no pass.
- The five stills are frames of forced tier 1 at 1,000,000 particles in the making-of chapter at progress 0.5, calm, each pass laid over the making-of sheet's box and cut from the middle of the sheet to 400 by 540 (the 200 by 270 face at twice its density), as a live card crops it (D-114), and saved as WebP: points 79,152 bytes, velocity 5,870, density 59,262, glow 2,344, final 80,946 (e2e/gpu/stills.spec.ts, captured again on 12 Nov 2026 after the review; the first capture cut the whole frame's height and left void bands). The manifest lists the velocity still on both tier 2 rows and all five on both tier 3 rows: tier 2 goes from 236.1 to 244.6 KB and tier 3 from 655.3 to 877.6 KB (docs/results/2026-11-12-making-of.md, build pg63VLh3PSL8Buzr_ghvM), far inside 3,072 KB on phones. Tier 3, all stills and no three.js, is now the largest payload.

### D-094 setPasses, a seventh engine command

- REQ-ENG-03, REQ-ENG-09. The page measures each pass card's face and sends its four corners in normalised device coordinates (PassCard in src/engine/types.ts), in the order top left, top right, bottom right, bottom left of the face as it stands unturned, so a turned face keeps its picture the right way round in either reading direction. Each call replaces the last. The page sends the cards on every scroll frame while the viewer is on screen or within half a screen of it (PASS_REACH), only when they moved, and null once it is further away and on teardown, so the passes cost nothing elsewhere.
- The controller keeps the latest cards and hands them to a runtime when its tier is adopted, after the stage, the story and the pointer; the probe hears none. The runtime copies them, skips a list equal to the last, draws only the passes LIVE_PASSES lists for its tier and only the first card of each pass, and drops a card whose corners do not make a convex face. While calm it draws its still again once per task, with no simulation step, so the cards keep to the page as it scrolls.
- Its own command, not part of setStage: a stage is a box the field forms inside, while a card is four free corners the field draws a finished pass into after the frame. Since the review each card also carries its face's own size and its corner radius (D-114), and the ready event says which look draws (D-115); the events stay three.

### D-095 The projective card map and the turned cards

- REQ-ENG-09, REQ-I18N-01, REQ-ENG-05. From 1024 px the five cards stand in a row as the preview sets them: 200 by 270 px faces turned by rotateY(-34deg), 34deg when right to left, overlapping by 26 px. The page sets no perspective, so a turned face shows at 0.83 of its width. Below 1024 px the faces lie flat: two columns on phones with the fifth card across both (140 px tall faces), three columns from 640 px (180 px), a width no artboard covers. Four empty marks in each face's corners, placed with logical insets, give the field the corners as the browser draws them; the page reads them by reading direction, so a right to left page swaps start and end (story-passes.ts).
- The engine draws each live card as a mesh whose vertices are its corners. Every pixel goes back through the inverse projective map (runtime/homography.ts, no three.js, unit tested against CSS's perspective and rotateY maths) to its place on the face, then to the part of the frame the face shows, where it reads its pass. Since the review each card shows the making-of sheet, cropped to the face's own width over height, with nothing drawn past its rounded corners (D-114), so every card shows the same part of the same frame. All cards draw in one render after the screen pass, so the frame is copied to the canvas once more per frame, not once per card. A live face has no fill and the veil's plates keep clear of it, so the pass shows under the open veil.
- The final pass is drawn again, not copied: each card works the halftone screen out at its own pixels through the screen pass's own colour function, averaging four samples where it shows the frame smaller. A copy would need a target the size of the canvas (about 8 MB at 1280 by 800) and would shimmer as the dot lattice shrinks threefold into a card. On the development page a final pass laid over the sheet's box matched the frame on every pixel, the largest difference 1 of 255, on both tiers (e2e/gpu/passes.spec.ts, 12 Nov 2026).
- The velocity pass is the only one that draws anything new: on tier 1 every particle is drawn again, one texel each, into a half-float target two texels a side per cell, coloured by a wheel of three tokens (glow for motion to the right, violet and text a third of a turn either side) and lit by speed with a floor of 0.25.
- Gaps found at the build and closed after the review: the crop took the whole frame's height, so the sheet filled only the middle 0.7 of each face; it took the width over height of a turned face as drawn, so the picture showed about 1.2 times wide; faces were drawn square inside the cards' rounded corners; and on the soft look the live cards stayed empty windows. D-114 and D-115 close them. One stays: a 270 px card on an 800 px frame shows the sheet at about half its size, so its dots read as a fine mesh, not the preview's 9 px dots.

### D-096 The pass viewer

- REQ-ENG-09, REQ-A11Y-02, REQ-A11Y-05, REQ-CNT-01, A14. The making-of chapter keeps its title, intro and link, then shows the viewer: the five cards in a group named Render passes, then a panel with the chosen pass's breakdown and the tier table. Each card is a toggle button (aria-pressed, aria-controls the panel, described by what its pass shows); Tab reaches it, Enter or Space chooses it. The panel always shows one pass, so there is nothing to close and no Escape: the keyboard map's "Escape closes it" is dropped. Velocity is chosen at load. A polite live region names the pass once the visitor chooses one; it is empty at load.
- Every breakdown sits in the same grid cell, the ones not chosen invisible and hidden from assistive technology, so the panel keeps the height of the longest and a choice moves nothing below it, which would leave the plates and the scroll triggers stale.
- A card shows its pass live only once a tier 1 or 2 field is ready, draws the halftone (D-115) and its tier draws that pass; otherwise it shows its still, which is in the static HTML, loads lazily and is removed if it fails. Calm keeps a live card live, because the engine draws its still again as the cards move.
- The tier table gives one figure for the whole frame on each tier, the same under every pass: "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display" on tiers 1 and 2 (D-107, D-116) and "Static image" on tier 3, named Still there as the preview names it, where the hero says Still frame. Timing each pass would need timestamp queries, which WebGPU has and WebGL2 does not.
- Changed from the preview: the panel takes the site's 16 px corners, 32 px padding and Unbounded at 600 (the preview 20 px, 36 px and 500); the chosen face gets a 1 px border and a 1 px inner ring, so no face changes size and its corners stay where the field last read them; cards not chosen brighten on hover, which the preview does not show.
- The making-of scene line now reads "Where your device draws the field live, the light flattens into one sheet behind the pass cards and the panel, and each card it draws live shows that pass of the frame as it is drawn."

### D-097 Each home chapter is as tall as its content

- REQ-SCR-01, REQ-NAV-01. Decided by T7SEN on 12 Nov 2026 ("Apply it to these two" for the making-of and about chapters, then "Okay, add your recommendation to the p4 plan" for the rest), after he found long empty stretches on the preview build of f58ef87, where the home page was 10,311 px long at 1440 by 900 against the preview's 7,700. REQ-SCR-01's storyboard shares (chapters starting at 0, 10, 30, 55, 75 and 90% of the scroll) are dropped, a departure from the brief's storyboard. The requirement now reads: six chapters in order, each as tall as its content, a held stretch only in the field chapter, and no screen's height inside a chapter without text.
- Supersedes D-081's empty room after the hero, where the dot pulsed alone: the hero is its first screen and nothing more, and Skip intro still shows whole on the first screen at 320 by 568. The making-of chapter loses its 180svh (210svh on phones), about loses its 160svh (190svh) but keeps the room above its heading where the strands draw (pt-[45svh]), and contact loses its 135svh (130svh) and the words pushed to its bottom; the rings still centre on the contact panel where it rests (D-079). Work is unchanged.
- Measured in the gate's story test (e2e/story.spec.ts, its printed chapter-rooms lines, 12 Nov 2026, after the review's fixes): at 1280 by 800 the hero is 700 px tall, the field chapter 1,600 px with a held stretch of 799 px, work 2,507 px, making-of 1,251, about 867 and contact 752; at 375 by 812 on a touch screen 692, 1,624 (held 811), 2,947, 1,709, 1,278 and 997 px. Outside the field chapter every chapter is its content's height to the pixel; the longest stretch without text there is 383 px at 1280 (the making-of cards' faces) and 366 px at 375 (the room above the about heading).

### D-098 The field chapter's timeline is set in screens, in a 200svh room

- REQ-SCR-07, REQ-SCR-01, REQ-A11Y-03. Supersedes D-077's progress points. The bloom's timeline is now counted in screens of scroll from the chapter's arrival (BLOOM_SCREENS in src/engine/runtime/story.ts), so each shape stays whole for the same stretch of scroll on any screen: the dot has let every particle go by 0.1 of a screen, the T7 mark is whole by 0.15 and holds to 0.9, the T7SEN wordmark is whole by 1.05 and holds to 1.85, and it is gone by 1.97. The room is 2 screens (BLOOM_ROOM): the section is min-h-[200svh] at every width (it was 260svh on phones and 220svh from 1024 px), and a point's progress is its screens over 2.
- The release and the mark's gathering now start together at arrival, so the mark grows straight out of the dot; before, the release ran alone to progress 0.3. The held screen fills the view from half a screen in until half a screen before the room ends: the mark is whole before it fills the view, the wordmark forms while it holds, and the wordmark is still whole as the work chapter comes up under it. Calm shows the middle of the wordmark's hold, progress 0.725 (it was 0.74); the middle of the mark's hold is 0.2625 (BLOOM_MARK_AT).
- Tuned on the production build at 1280 by 800 and 375 by 812 on tier 1, scrolled by script at 300 and 400 px a second and read from screenshots; a first room of 1.75 screens was lengthened to 2 so each hold can be read. Unit tests keep the section's class equal to BLOOM_ROOM and the timeline inside the room, and the gate's story test measures the room in the browser.

### D-099 The study page model

- REQ-CNT-03, REQ-CNT-06, REQ-PERF-01, REQ-PERF-03. A full study gains a tag (one word after its number in the label, "Full study 02 · Real-time"), a role line for the facts row, a screenshot, an approach diagram and a code excerpt, each a value or a marker. A screenshot stores its size and a smaller phone file, so the page keeps its place while it loads and a phone never fetches the desktop file. A diagram has at least two boxes, joined by labelled arrows, and exactly one key box. An excerpt names its file's path and its language. Quotes are a list of at least one or a marker, so a quote still to come shows as a marker and never in quotation marks. Short studies gain the tag. Every interface word of the study pages is in studyPage in src/content/pages.ts, kept apart from the page copy because a test reads each of those entries as a route. A compile-time guard in types.test.ts covers each new part.
- The screenshots: six WebP files in public/work, sized to the column, 1,168 px wide for desktop and 686 px for phones under 640 px (a picture source by media query), loaded lazily at low fetch priority. Of WebP, PNG and JPEG at quality 85 WebP was the smallest each time: making-of 38,192 and 14,950 bytes, Coup Online 21,198 and 8,674, ArcheLab 44,494 and 23,594. A unit test checks each file's real size against the size stored with it, under 100 KB, with a smaller phone file, and a gate test checks that a phone loads the phone file. Phone vitals on Slow 4G with a 4x CPU slowdown: LCP 1,936 ms on the making-of, 1,880 on Coup Online and 1,892 on ArcheLab, CLS 0, the largest paint the summary's text each time and never the picture (docs/results/2026-11-12-making-of.md).

### D-100 The study page layout

- REQ-CNT-03, REQ-CNT-04, REQ-A11Y-01, REQ-A11Y-02, REQ-I18N-01. Built to the launch artboard's study page: a breadcrumb, the label, the Unbounded h1, the notice where a study has one (between the title and the summary), the summary as one line in the text colour and two muted lines under a visually hidden Summary heading, the facts row (Role, Built with, Live, Code), the screenshot, then the "In this study" list at the start beside the six other parts, and Previous and Next cards. The list is the page's one client island: plain anchors in the static HTML, and once script runs it marks the part being read (the top third of the window) with aria-current="location", the value for a place in a table of contents (it was "true" until the review).
- Where it differs from the artboard, each for a site rule: part headings follow the artboard ("Problem and role", "Approach") in the outline's order; the lead angle is no longer shown, while the model keeps it; prose keeps the measure of about 67 characters, while the diagram, cards, quotes and excerpt span the column; the h1 is text-title (28 to 48 px) at 700, not the artboard's 56 px, which moves the study h1s from 600 to 700 like the other page titles; a result still to come is set at 16 px so a long marker reads as a note; the short study's stack is one mono line, as on the short cards, to keep it on one screen; the list is sticky only from 1024 px and a grid above the parts below that; a screenshot still to come is a dashed box at the artboard's 83 to 35; the breadcrumb's Work link is underlined with a 44 px target, as the site's links are; panels keep the site's 16 px corners and raised border; the diagram's arrow labels are violet; Previous and Next do not wrap round, so the making-of has only Next and SystemSeven only Previous.

### D-101 Code: On request for Coup Online and ArcheLab

- REQ-CNT-03, A13. Decided by T7SEN on 12 Nov 2026 ("No Code links for now"). Neither study links its repository: both are public, and their commit history carries a personal address the site keeps out. The facts row always shows Code, reading "On request" when a study has no repository link, and part 7 lists only the live link: "Play it live" for Coup Online (https://coups.app/) and "Live site" for ArcheLab (https://arche-lab.tech). A departure from the outline's "live and repo links". The earlier build left Code out when there was no repository. The making-of keeps its link to this site's repository, "Read the code", as the preview labels it. The ArcheLab row's second link reads "arche-lab.tech".

### D-102 Coup Online's credit line

- REQ-CNT-12, REQ-HYG-05, A1. Decided by T7SEN on 12 Nov 2026 ("Add a credit line"): the study's notice reads "Coup Online is an unofficial fan version of Coup, the card game designed by Rikki Tahta." Its screenshot is the live site's play page, which shows no card art: the game table needs a sign-in and three players, and its cards carry the game's character names.

### D-103 One role line

- REQ-CNT-03. Decided by T7SEN on 12 Nov 2026 ("Solo project"): the facts row of Coup Online and ArcheLab reads "Solo project: design, build and hosting." The making-of takes the same line, drafted for his check (D-108). Part 2's role paragraphs are drafted from the repositories and the brief and name what each repository holds.

### D-104 Quotes with their permission, and the kept spelling

- REQ-CNT-06, A1, A13. From T7SEN's answers of 12 Nov 2026. Coup Online: "No download, no ads. I was in a game with friends in under a minute. Looks gorgeous, and calling out a fake Duke never gets old." shown as "Rafael Borges, Coup Online player", granted by Rafael Borges through the coups.app post-game feedback form on 12 Nov 2026: T7SEN's answer is that sending the form gives that consent, and the form's box, unticked by default, reads "You may quote my comment on the site, credited to {nickname}." (post-game-feedback.tsx in the coup-online repository at cc7e9ac). The credit is the nickname the player typed in the form, as the box promised (D-111); it read "Rafael B." until T7SEN gave the nickname.
- ArcheLab: "Colored chat messages that actually fit, plus all the database pages and timers in one spot. Super handy." shown as "BunnyEnjoyer, ArcheLab player", permission by email reply on 12 Nov 2026, on the home row and in the study. It replaces the first quote T7SEN gave, about the Arche Tuning planner, which the live site does not have (/arche-tuning answered 404 on 12 Nov 2026). "Colored" stays as the speaker wrote it [T7SEN, 12 Nov 2026: keep "Colored"]: British spelling is the rule for the site's own words, not for a quote.

### D-105 Accounts and Unique visitors

- REQ-CNT-05, A1, A15. T7SEN's sheet labelled the figures Players and Users; his answers of 12 Nov 2026 say what each one counts, so the labels say that. Coup Online: Accounts 6,713 (registered accounts) and Matches 3,251, from the coups.app admin page, counted since 25 May 2026 07:34 UTC and read on 12 Nov 2026. ArcheLab: Unique visitors 213, from the domain's Cloudflare analytics, the last 30 days to 12 Nov 2026. The home rows show the same figures under the same labels.

### D-106 SystemSeven has no links

- REQ-CNT-04. Decided by T7SEN on 12 Nov 2026 ("No links"): its repository is private and nothing runs yet, so the short study shows what it is, why it exists, its stack and the In progress label, with no Links part. The model allows an empty list only while a study is in progress; a shipped short study must have a link. Its why is the line T7SEN approved (D-112).

### D-107 The making-of study and its figures

- REQ-CNT-03, REQ-CNT-05, REQ-PERF-05, REQ-PERF-06, REQ-TIER-05, A1, A14. Every part is filled from the brief and the engine as built; the excerpt is src/engine/tier/decide.ts lines 18 to 40 as written, which a test finds in the file. The problem, constraints, role and what would change are drafted for T7SEN's check [T7SEN, 12 Nov 2026, "Draft, I check"].
- Frame times are a ceiling: "Under 4.2 ms, capped by a 240 Hz display" on tiers 1 and 2. On the production home page with the viewer in view, tier 1 (the probe's choice, 1,000,000 particles, five live cards) drew 2,380 frames in 10 s at a median of 4.20 ms, and tier 2 (navigator.gpu hidden, 250,000 particles, four live cards) 2,392 at 4.20 ms (e2e/headed/making-of.spec.ts; RTX 4060 Ti, 1280 by 800). The median is the display's refresh, so the GPU's own cost is lower and unmeasured. On the development page, five live cards and none gave the same median on both tiers.
- Payloads from the budget check, kept in the making-of results with the build they come from (docs/results/2026-11-12-making-of.md), since the day's budget file is written again at every gate: 238.9 KB on desktop tier 1, 244.6 KB on phones, 877.6 KB of stills on tier 3 with no three.js (build pg63VLh3PSL8Buzr_ghvM, after the review's fixes; the first build gave 238.6, 244.0 and 849.0 KB). The tier 3 figure is larger than tier 2's and is shown as measured.
- The screenshot is the field chapter's formed wordmark on tier 1 at twice the density, not the pass viewer the preview shows: at capture time the viewer's tier table still held markers, and at twice the density its live cards drew their passes in a middle band only.
- Every diagram is cut to three boxes, because four at 1280 px squeezed each box's line to one word a line: Coup Online's Worker, ArcheLab's tag registry and the making-of's point splat leave the diagrams and stay in the approach text.
- Left out of the drafts drawn from the two repositories: ArcheLab's claim that the game does not document its tags and its "first try" aim, which rest on an unpublished document; its 28.6 MB and 100 MB deploy figures, from an uncommitted file; a role line counting commits; and a property test's catch, for length.
- The voice test skips verbatim code excerpts, which keep their own characters (Coup Online's holds a not-equal operator, whose first character the scan would read as an exclamation mark).

### D-108 Lines drafted for T7SEN's check

- REQ-CNT-03, REQ-CNT-04, A1. Drafted on 12 Nov 2026 and listed for T7SEN's check [T7SEN, 12 Nov 2026, "Draft, I check" and "Draft from the repos"], which he takes after the commit, since he gave the commit and the push ahead of it the same day: the making-of's summary, problem, constraints, role, approach, diagram, hard part, what would change, excerpt caption and screenshot words; Coup Online's and ArcheLab's parts 2 to 6 from the public state of their repositories, each claim traced to a file; t7sen-url's why, "My links and stream in one place on my own domain, with short links that show what people click." (a longer line broke the one-screen check at 375 by 812); and the five tags, WebGPU, Real-time, Product, Links and Discord.

### D-109 Tests while working

- Decided by T7SEN on 12 Nov 2026 ("Go with your version"). Rule D9: while working, after a code change, only the tests of what changed run: the changed files' own unit tests and those of the files that import them, by path; the Playwright specs that cover the touched routes or features; the headed specs only for the engine, story or field part that changed; and on the whole project the typecheck, lint, format check and class scan, which take seconds and catch breaks in files nobody touched. The full gate, with the headed suites where they apply, runs only at gate run 1 and at the one rerun of each phase; the gate rules are unchanged.

## P4 review fixes, 12 Nov 2026

### D-110 The stylesheet is inlined into the HTML

- REQ-PERF-01, REQ-PERF-03. Gate run 1 measured the phone LCP of / at 2,232 ms in the gate and 2,020 ms alone (limit 2,000; P3.5 had 1,792), and 2,084 ms on tier 3. The largest paint is the hero headline at the first paint, which waited for the one render-blocking stylesheet: 10.3 KB that shared Slow 4G with three preloaded fonts and seven scripts, about 850 ms to arrive. next.config.ts now sets experimental.inlineCss, documented for 16.4.5 in node_modules/next/dist/docs (inlineCss.md): the stylesheet arrives inside the HTML as style elements. The home page's HTML grows from about 107 KB to 258,724 bytes raw (47,780 gzip), since the rules also sit in the page's own payload, as the docs say.
- Phone vitals, three runs of e2e/vitals.spec.ts on build pg63VLh3PSL8Buzr_ghvM (Slow 4G, a 4x CPU slowdown): / 1,164, 1,120 and 1,252 ms; / on tier 3 1,080, 1,204 and 1,240 ms; /work 1,064 to 1,156 ms; the three studies 1,020 to 1,168 ms. CLS stays 0 on / and on the Coup Online and ArcheLab studies, and 0.008 on /work as in gate run 1; /work/making-of measures 0.026 in all three runs, under 0.05. An earlier P4 gate run gave it 0.025 and gate run 1 0.000: the page now always paints before the web fonts arrive, so their swap at about 2.5 s moves the facts row and the screenshot every time.
- Trade-offs: a returning visitor downloads the rules with every page instead of from its cache, and P6's content security policy must allow these style elements, with 'unsafe-inline' for styles or a nonce [CONFIRM at P6, from the version-matched docs]. e2e/pages.spec.ts now reads the shipped rules from the style elements, and from any linked stylesheet, for the physical-property check.

### D-111 The Coup Online quote is credited by the player's nickname

- REQ-CNT-06, A15, A13. Decided by T7SEN on 12 Nov 2026 ("Use it, credit his nickname"), with the nickname he gave the same day, Rafael Borges. The coups.app feedback form asks for consent with a box, unticked by default, that reads "You may quote my comment on the site, credited to {nickname}." The site there is coups.app; T7SEN decided that the consent covers this portfolio too. The quote is credited exactly as the box promised, "Rafael Borges, Coup Online player", and its permission line reads "Rafael Borges through the coups.app post-game feedback form", 12 Nov 2026. A15: the quote is shown as given, with its source and permission, and nothing about the player beyond the nickname he typed.

### D-112 SystemSeven's why

- REQ-CNT-04, A1. Approved by T7SEN on 12 Nov 2026 ("Use the draft"): "A bot of my own for my stream's Discord server, starting with stream notifications." It replaces the marker, so no marker is left in the five studies, and the content test now says so.

### D-113 The burn checks measure at the full pixel ratio

- REQ-SCR-07, REQ-A11Y-05. In e2e/gpu/story.spec.ts each formed state now waits until the field draws at a pixel ratio of 1 before its burn rule is measured, and prints the ratio it had before. A cold page on the development server lowers the ratio to 0.75, and it rises again only after four seconds of fast frames (adaptive.ts), so a state measured three seconds in could still be drawn small. At 0.75 the faint dots of the lines fall under the lit line while the white ones stay: the wordmark measured 25.6% white of lit cells at 0.75 and 21.1 to 21.9% at 1, against the limit of 25%. The limits are unchanged and hold for the full ratio.

### D-114 Each card shows the sheet at its face's own shape, inside its rounded corners

- REQ-ENG-09, REQ-ENG-05, REQ-TIER-03. Supersedes D-095's crop. A card's picture is now the largest part of the making-of sheet (the frame's own shape at SHEET_FIT, 0.7, round its centre) with the face's width over height (sheetCrop in src/engine/runtime/pass-rules.ts), so the face is filled edge to edge; before, the crop took the whole frame's height and the sheet filled only the middle 0.7 of each face.
- PassCard gains two optional fields: the face's own size inside its border, which no turn changes (its clientWidth and clientHeight), and its corner radius there (the border radius less the border's width: 11 px from 1024 px, 9 px below). The crop takes the face's own width over height, so a face turned by rotateY(-34deg) with no perspective shows its picture narrowed with it, as a still on the same face is; before, it took the width over height as drawn and showed the picture about 1.2 times wide. How finely a card draws still comes from its size as drawn. The card's mesh discards every pixel past a corner's quarter ellipse on the face's own square (onRoundedFace, mirrored in TSL in passes.ts), so no pass shows past the face's rounded corners. Without a size the crop falls back to the face as drawn and the corners are square.
- The development page's ?pass=<id> now lays one card over the sheet's box instead of the whole canvas: that card shows the sheet at its own size, its final pass is the frame itself (no pixel differs by more than 2 of 255, on both tiers), and the five tier 3 stills are cut from the middle of the sheet as a live card is (D-093). The test cards of ?passes=1 send their own sizes.
- Measured on 12 Nov 2026 (e2e/gpu/passes.spec.ts): every live card lit 0.96 to 1.00 and changed 0.89 to 1.00, nothing outside the cards changed, and with five live cards the frame time kept its median of 4.20 ms on both tiers; on the production home page with the viewer in view, tiers 1 and 2 also kept 4.20 ms (docs/results/2026-11-12-making-of.md). The three.js chunk grows from 235.7 to 236.0 KB gzip.

### D-115 The ready event says which look draws

- REQ-ENG-03, REQ-ENG-09, A14. The ready event of a live tier now carries look, halftone or soft: the look the runtime really draws, which is soft where a half-float target cannot be rendered even though the halftone was asked for. The tier 3 still sends none, and the events stay three. The tier store mirrors it (look, null until a live tier is ready), the engine session writes it on the field's wrapper as data-look, and a pass card is live only on the halftone, whose own steps the passes are: on the soft look every card shows its still, where before the live cards stayed empty windows over a field that draws no pass. The gate's pass viewer test reads data-look for the cards it expects live.

### D-116 The making-of copy as the preview has it, and a tier table that names its GPU

- REQ-ENG-09, A14, A15. The link under the breakdown reads "Read the full making-of", as the preview has it, and the intro gains the preview's second line: "The render passes that draw this field, and what each device tier shows. Select a pass to read how it works." Every card is a button on every tier, so the line holds everywhere. The preview's first line, "The field you stirred", stays out, since tier 3 and calm cannot be stirred.
- The tier table's frame times read "Under 4.2 ms on an RTX 4060 Ti, capped by a 240 Hz display" on tiers 1 and 2. They were measured on one desktop PC and phones are not measured, so the row names the GPU and no visitor reads it as their own device's figure. The study's results already name it.

### D-117 Three checks measure what they claim again

- REQ-SCR-06: the stirring tests in e2e/headed/story.spec.ts measure on the making-of sheet, where since P4 the field also draws each live pass in its card, a picture of the whole sheet in a small window that shows no hole where the pointer is: in gate run 1 the finger's box sat on the final frame's card after the drag (hole light 1.56). Each test now takes the live passes off first, by removing the faces' data-live marks, so the story sends no card and every card shows its still, as on tier 3. Measured on 12 Nov 2026: the cursor kept 0.278 and 0.284 of its light on tiers 1 and 2 and the finger 0.083, the control boxes 1.006 and 1.032.
- REQ-A11Y-06: in e2e/headed/contrast.spec.ts the hero's control, the bare background at veil 1, also hides the field chapter's held plates: since D-097 that chapter starts at the fold, and the plates' soft edge reached into the hero's last row, where void over void came back #08080A instead of #07070A. The hero is now measured only once the page is at the top and the field in its hero state, and each line prints the brightest pixel's place and the text box it is in. Gate run 1's one bright frame at tier 1 at 1280 (#9B9AA1, text 2.39 to 1) did not come back: on 12 Nov 2026 every hero case kept 17.15 to 1 or more on tiers 1 and 2 and 11.90 to 1 on tier 3, with the control at #07070A.
- REQ-SCR-01: the shape sampler's 20 ms cold start is timed in src/engine/runtime/shapes/cold-start.test.ts, in a Vitest project of its own that runs in Node after every other test file has finished, and alone (vitest.config.mts, sequence.groupOrder 1), best of three cold starts. Under the full suite's load gate run 1 measured 29.7 ms; the limit is unchanged.
