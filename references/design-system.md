# Design System — Cyberpunk netrunner aesthetic

Companion to SKILL.md "Aesthetic copy" / "Styling" rules. Documents the
theme tokens, fonts, UI primitives, layout provider tree, and the copy
tone used across the portfolio.

The site is a **gamified, cyberpunk-themed personal product** — terminal
typography, neon accents, oklch-defined dark theme by default, custom
cursor, scanlines, hacker-text. Faithful to the netrunner mood; not a
generic shadcn theme.

---

## Tailwind v4 — CSS-first

There is **no `tailwind.config.js`**. Tailwind v4's CSS-first config
lives in [`src/app/globals.css`](../src/app/globals.css) via `@import`
and `@theme inline`.

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  /* … semantic shadcn color tokens map to CSS variables … */
}
```

`@theme inline` exposes the CSS variables as Tailwind utilities — so
`bg-background`, `text-muted-foreground`, `font-mono` all work without a
JS config.

**Do not** add `tailwind.config.js`. v4 doesn't read it; tokens go in
`globals.css`.

---

## Color tokens

Two palettes in `globals.css`: `:root` (light) and `.dark` (dark). The
project pins to dark via `defaultTheme="dark"` in `layout.tsx`'s
`ThemeProvider`, so the `.dark` palette is what users see by default.

**Semantic shadcn tokens** (standard set): `background`, `foreground`,
`card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
`destructive`, `border`, `input`, `ring`, plus sidebar and chart
sub-tokens.

All values are **oklch**. Sample dark palette:

```css
.dark {
  --background: oklch(0.145 0 0); /* near-black */
  --foreground: oklch(0.985 0 0); /* near-white */
  --primary: oklch(0.922 0 0); /* light gray on dark = "the cursor color" */
  --primary-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.704 0.191 22.216); /* warm red */
  /* … */
}
```

The light palette flips these — `--background: oklch(1 0 0)`,
`--foreground: oklch(0.145 0 0)`. Light mode is functional but the UI is
designed for dark.

**Do not** hardcode hex / rgb values in components — use the semantic
tokens (`bg-card`, `text-foreground`, etc.) so the future light pass
doesn't break.

---

## `color-scheme: dark` + body wiring

```css
html,
body {
  @apply text-foreground overflow-x-hidden;
  color-scheme: dark;
}

body {
  @apply bg-background text-foreground;
  transition:
    background-color 0.3s ease-in-out,
    color 0.3s ease-in-out;
}
```

`color-scheme: dark` is set on `html` / `body` unconditionally — that's
what removes the white flash on first paint. `color-scheme` is a browser
hint that tells the canvas to render dark before any CSS loads.

The body has a slow color transition so theme toggles fade in/out, not
snap.

---

## Fonts

Two Google fonts via `next/font/google` in
[`src/app/layout.tsx`](../src/app/layout.tsx):

```ts
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});
```

`@theme inline` in `globals.css` maps:

- `--font-sans` → `var(--font-geist-sans)` → `font-sans` utility (body
  default, sans-serif)
- `--font-mono` → `var(--font-geist-mono)` → `font-mono` utility (terminal
  text, code, telemetry, HUD overlays)

`<body>` has `className="… antialiased font-sans"` so Geist Sans is the
document default. Anything terminal-y (commands, HUD numbers, the chat
markdown, code blocks) uses `font-mono`.

Do **not** add new font families without an explicit reason — two fonts
is the design.

---

## Custom utilities — `globals.css`

The non-Tailwind utilities defined in `@layer utilities`:

| Utility / animation    | Purpose                                                                                                                                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.scrollbar-hide`      | Hides scrollbars on all engines (WebKit, FF, IE/Edge). Used in horizontal-scroll chip rails and the chat scroll body.                                                                                                        |
| `.invisible-hold`      | `opacity:0 !important; visibility:hidden !important;` — applied initially so content doesn't flash before GSAP gets to it; GSAP removes the class via `gsap.set(..., { clearProps: 'all' })` or by setting opacity directly. |
| `.reduce-motion *`     | Force-shortens animation / transition durations to 0.01ms. Added to `<html>` by `GlobalAppWrapper` when `prefers-reduced-motion: reduce` matches. See [`animations.md`](./animations.md).                                    |
| `.animate-scanline`    | 3-second linear scanline keyframe — the AI chat "hack mode" overlay uses this.                                                                                                                                               |
| `.animate-fade-in`     | 1-second fade + slide-up entrance.                                                                                                                                                                                           |
| `.animate-gradient-xy` | 6-second background-position oscillation for animated gradients.                                                                                                                                                             |

The custom `::-webkit-scrollbar` rules give the global scrollbar a slim
6px terminal feel with a faint primary tint that brightens on hover.
Firefox gets `scrollbar-width: thin` + `scrollbar-color: var(--primary)
transparent`.

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-thumb {
  @apply bg-primary/20 hover:bg-primary/80 transition-colors;
  border-radius: 2px;
}
```

---

## Cursor — hidden on md+

```css
@media (min-width: 768px) {
  :root,
  html,
  body,
  *,
  *::before,
  *::after {
    cursor: none !important;
  }
}
```

The native cursor is hidden on screens ≥ 768px, and `<Cursor />`
(`src/components/ui/cursor.tsx`, mounted by `GlobalAppWrapper`) draws a
custom one. Below 768px (touch / phone) the native cursor stays —
because there isn't one anyway.

If you add a component that **needs** the native cursor (an embedded
WYSIWYG, etc.), use Tailwind's `cursor-*` arbitrary values with
`!important` (`!cursor-text`) on the specific element. Do **not** strip
the global rule.

---

## View transitions

```css
::view-transition-group(root),
::view-transition-old(root),
::view-transition-new(root) {
  animation: none !important;
  mix-blend-mode: normal !important;
}

::view-transition-new(root) {
  z-index: 9999;
  clip-path: circle(0px at 50% 50%);
}
::view-transition-old(root) {
  z-index: 1;
  opacity: 1;
}
```

Custom overrides for the View Transitions API used by
`<TransitionLink />` (`src/components/ui/transition-link.tsx`). The
`clip-path: circle(0px ...)` on `new(root)` is the starting state of the
expanding-circle reveal animation that fires on every same-origin
navigation; GSAP / the component animates the radius.

Do **not** add `::view-transition-*` rules without coordinating with
`transition-link.tsx` — overlapping rules will fight.

---

## Liveblocks badge — hidden

```css
a[href*="liveblocks.io"] {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
  width: 0 !important;
  height: 0 !important;
}
#liveblocks-badge {
  display: none !important;
}
```

Liveblocks free-tier injects a "Powered by Liveblocks" badge into the
DOM. The CSS above hides it. **Do not remove these rules** — the badge
otherwise floats over chrome and breaks the netrunner aesthetic.

---

## Layout provider tree (the actual one)

[`src/app/layout.tsx`](../src/app/layout.tsx) nests providers in this
order (siblings noted):

```
<RealtimeProvider>                      ← Liveblocks (no-op without key)
  <JsonLd />                            ← SEO sibling
  <ThemeProvider defaultTheme="dark">   ← next-themes
    <SoundProvider>                     ← Web Audio context (gesture-deferred)
      <AchievementsProvider>            ← visitor-id + achievements state
        <SystemContextMenu />           ← right-click menu (sibling)
        <CyberChat />                   ← AI chat (sibling, hidden until opened)
        <AchievementsManager />         ← unlock notifier (sibling)
        <AdminProvider>                 ← SessionProvider + useAdmin
          <GlobalAppWrapper>            ← cursor, preloader, navbar, command menu, snake game
            <main>{children}</main>
            <Footer />                  ← cached "use cache" + cacheLife('days')
          </GlobalAppWrapper>
          <Toaster position="top-center" richColors />  ← sonner
        </AdminProvider>
      </AchievementsProvider>
    </SoundProvider>
  </ThemeProvider>
</RealtimeProvider>
```

**Do not reorder.** Notable invariants:

- `RealtimeProvider` wraps everything because `ActiveVisitors` and other
  `useOthers` callers live deep in the tree.
- `ThemeProvider` is inside `RealtimeProvider` because Liveblocks doesn't
  care about theme but theme does need to be aware of the SSR shell.
- `SoundProvider` wraps `AchievementsProvider` because achievement
  unlocks play sound on success.
- `SessionProvider` (via `AdminProvider`) is **deep in the tree**, not at
  the root — most of the app doesn't need it, and putting it deep keeps
  the SSR shell trivially cacheable.
- `Toaster` and `<Footer />` and the sibling components (`CyberChat`,
  `SystemContextMenu`, `AchievementsManager`) are mounted alongside the
  layout — they overlay the route content.

---

## UI primitives — `src/components/ui/`

A mix of stock shadcn primitives and bespoke ones:

**Stock-ish shadcn (with project tweaks):**

`button`, `input`, `textarea`, `dialog`, `hover-card`, `scroll-area`,
`command`, `skeleton`, `badge`. Imported via shadcn CLI; tweaked for the
cyberpunk palette via the `@theme inline` tokens.

**Bespoke (project-only):**

| Primitive                 | Role                                                                   |
| ------------------------- | ---------------------------------------------------------------------- |
| `cursor.tsx`              | The custom cursor (md+ only)                                           |
| `preloader.tsx`           | First-paint preloader, gated by `assetsLoaded` from `GlobalAppWrapper` |
| `background.tsx`          | Animated gradient + grid background                                    |
| `hud-header.tsx`          | The "HUD" telemetry header used on the guestbook / dashboard shells    |
| `hacker-text.tsx`         | Glitchy-reveal headings                                                |
| `magnetic-wrapper.tsx`    | Buttons / icons that pull toward the cursor                            |
| `transition-link.tsx`     | View-transition-API-driven navigation                                  |
| `tab-manager.tsx`         | Browser-tab title cycling when the tab is backgrounded                 |
| `sound-prompter.tsx`      | Gates the sound system on a first user gesture                         |
| `active-visitors.tsx`     | Liveblocks-driven live visitor count (no-op without key)               |
| `globe.tsx`               | The cobe-rendered globe                                                |
| `git-pulse.tsx`           | Pulse animation for the GitPulse latest-commit indicator               |
| `icons.tsx`               | Brand / provider icon set (uses `simple-icons` + `react-icons`)        |
| `system-context-menu.tsx` | The "ACCESS_DENIED // try sudo" right-click menu                       |
| `logo.tsx`                | The wordmark                                                           |
| `avatar-image.tsx`        | The hero avatar with onLoad signal                                     |
| `ping.tsx`                | Pulsing dot indicator                                                  |

**Icons:** `lucide-react` for general UI; `react-icons` and
`simple-icons` for brand marks (GitHub, Discord, Google, etc.).

**Class merge helper:** `cn()` from
[`src/lib/utils.ts`](../src/lib/utils.ts) — `clsx` + `tailwind-merge`,
one liner.

---

## UI copy tone — terminal / netrunner

Every user-facing string uses terminal / netrunner language. Examples
from the codebase:

- `ACCESS_DENIED // ENCRYPTION_LEVEL_TOO_HIGH` — chat refusal
- `NET_TRACE`, `INITIATING_UPLINK`, `COMMS_STATION_ACTIVE`
- `SYSTEM_ONLINE... WAITING_FOR_INPUT.` — chat boot
- `⚠️ SYSTEM ALERT: Bandwidth Exceeded.` — chat 429
- `DB_ACCESS`, `NODE: REDIS`, `WRITE_OK` — guestbook HUD telemetry
- `Signature encoded successfully.` — guestbook success toast
- `Transmission sent successfully.` — contact success
- `ERR: CONNECTION_LOST`, `Signal jamming detected (API Error).`
- `⚠️ INTRUSION DETECTED. BYPASSING FIREWALL... ACCESS GRANTED.` — `/hack`
- Achievement names: `SOCIAL_ENGINEER`, `SPEED_RUNNER`, `COMPLETIONIST`,
  `OMEGA-3`

Conventions:

- **ALLCAPS_SNAKE** for HUD labels, status codes, error categories.
- Backticks / monospace for "data" — `${pathname}`, IPs, secrets.
- Emojis sparingly — `⚠️` for warnings, `🧠` for AI, `⚡` for actions.
- Don't use everyday phrases ("Sorry!", "Oops!") — they break the tone.

Match this voice in new UI strings. If you find yourself writing "Sign
in", consider "INITIATE_AUTH" or "UPLINK_HANDSHAKE".

---

## Refusal triggers

- **Adding `tailwind.config.js`** — v4 is CSS-first. Tokens go in
  `globals.css`.
- **Hardcoding hex / rgb in components** — use semantic tokens.
- **Adding a new font family without justification** — Geist Sans +
  Geist Mono is the design.
- **Removing the `color-scheme: dark`** — that's what kills the white
  flash.
- **Removing the Liveblocks badge-hide CSS** — the badge intrudes
  visually.
- **Removing the `cursor: none` rule** — the custom cursor depends on it.
- **Reordering the layout provider tree** — the order is load-bearing.
- **Writing "Sign in" instead of `INITIATE_UPLINK`** — match the
  netrunner tone.
- **Replacing shadcn primitives with a different component library** —
  the existing tweaks for the palette would need to be redone.

---

## See also

- SKILL.md "Aesthetic copy" / "Styling" rules
- [`animations.md`](./animations.md) — the motion layer on top of these
  primitives
- [`coding-patterns.md`](./coding-patterns.md) — the Shell + Suspense
  pattern that the page shells follow
- Source: [`src/app/globals.css`](../src/app/globals.css),
  [`src/app/layout.tsx`](../src/app/layout.tsx),
  [`src/components/ui/`](../src/components/ui/),
  [`src/lib/utils.ts`](../src/lib/utils.ts)
