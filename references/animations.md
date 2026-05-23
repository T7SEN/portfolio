# Animations — GSAP via `useGSAP`

Companion to SKILL.md "Animation" rule and
[`design-system.md`](./design-system.md). Documents the motion layer:
GSAP setup, the two-mechanism reduced-motion strategy, and where the
~23 `useGSAP` usages live.

The portfolio uses **GSAP exclusively**. Framer Motion / `motion` is
**not** installed and must not be added — see
[`anti-hallucination.md`](./anti-hallucination.md).

---

## Stack

- **`gsap`** core (the `Flip` and `ScrollTrigger` plugins ship inside the
  package).
- **`@gsap/react`** for the `useGSAP` hook.
- **`canvas-confetti`** for the Konami easter-egg confetti shower
  (dynamic-imported in `GlobalAppWrapper`).
- **`cobe`** for the WebGL globe (animated via its own internal RAF, not
  GSAP).
- **`tw-animate-css`** — the `animate-*` utility set, imported in
  `globals.css`. Used for one-off `animate-pulse` / `animate-bounce`
  cosmetic loops that don't justify a `useGSAP`.

Tailwind utilities animate **transform + opacity only.** Do not animate
`filter: blur()` (mobile WebView repaint cost) or `box-shadow` (paint
storm). Glow is achieved via stacked radial gradients, not animated
`box-shadow`.

---

## `useGSAP` is the default

23 components use `useGSAP` (greppable; see source list at the bottom).
Pattern:

```tsx
"use client";
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

export function MyAnimated() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced) {
        gsap.set(".target", { y: 0, opacity: 1 }); // snap to final state
        return;
      }
      gsap.fromTo(
        ".target",
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
      );
    },
    { scope: ref, dependencies: [reduced] },
  );

  return (
    <div ref={ref}>
      <div className="target invisible-hold">…</div>
    </div>
  );
}
```

Conventions:

- **`'use client'`** on any component that calls `useGSAP`.
- **`scope: ref`** scopes selectors to the component so they don't bleed
  across the document.
- **`dependencies: [...]`** re-runs the hook callback when deps change
  (e.g., `[isOpen]`, `[reduced]`).
- **`opacity-0` / `invisible-hold`** on the initial DOM so content
  doesn't flash before GSAP gets the first frame.
- **Raw `gsap.to` outside `useGSAP`** is allowed only inside event
  handlers (where `useGSAP` can't run) — see the
  [`cyber-chat.tsx`](../src/components/cyber-chat.tsx) close handler.
  Everywhere else, use `useGSAP`.

---

## Reduced motion — two mechanisms

The portfolio respects `prefers-reduced-motion: reduce` via **both** a
React hook and a global GSAP-timeline override. Components use whichever
mechanism fits.

### Mechanism 1 — `usePrefersReducedMotion()`

[`src/hooks/use-prefers-reduced-motion.ts`](../src/hooks/use-prefers-reduced-motion.ts)
is the proper React way: a `useSyncExternalStore` wrapper around
`matchMedia('(prefers-reduced-motion: reduce)')`. SSR-safe (returns
`false` on the server), no hydration mismatch, auto-subscribes to media
query changes.

```ts
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
```

Components that need to **branch on motion preference** call this and
check inside `useGSAP`:

```tsx
const reduced = usePrefersReducedMotion();
useGSAP(
  () => {
    if (reduced) {
      gsap.set(".target", {
        /* final state */
      });
      return;
    }
    // full animation
  },
  { scope: ref, dependencies: [reduced] },
);
```

This is the pattern in `guestbook-client.tsx`, `dashboard-client.tsx`,
the hero, the contact page, etc.

### Mechanism 2 — Global timeline override

[`src/components/global-app-wrapper.tsx`](../src/components/global-app-wrapper.tsx)
attaches a top-level listener:

```ts
useEffect(() => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handle = (e) => {
    if (e.matches) {
      gsap.globalTimeline.timeScale(100); // animations finish ~instantly
      document.documentElement.classList.add("reduce-motion");
    } else {
      gsap.globalTimeline.timeScale(1);
      document.documentElement.classList.remove("reduce-motion");
    }
  };
  handle(mq);
  mq.addEventListener("change", handle);
  return () => mq.removeEventListener("change", handle);
}, []);
```

The `.reduce-motion` class is also styled in `globals.css`:

```css
.reduce-motion * {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
```

So even animations that **don't** check `usePrefersReducedMotion`
explicitly (e.g., CSS `@keyframes`-driven utilities like
`.animate-scanline`, `.animate-fade-in`, `.animate-gradient-xy`) get
shortened to imperceptible durations. GSAP tweens get sped up 100× by
the timeScale.

This is the safety net. Components should still use Mechanism 1 to set
final state cleanly — `timeScale(100)` "finishes" tweens but doesn't
skip the visual flash entirely on fast machines.

---

## What's animated

| Moment                                               | Where                                                                                | Trigger                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Preloader fade-out                                   | `src/components/ui/preloader.tsx`                                                    | `assetsLoaded` becomes `true` (4s timer in `GlobalAppWrapper` or earlier on avatar `onLoad`) |
| Cursor follow + magnetic pull                        | `src/components/ui/cursor.tsx`, `src/components/ui/magnetic-wrapper.tsx`             | `mousemove`; `<MagneticWrapper>` children scale toward cursor                                |
| Background gradient drift                            | `src/components/ui/background.tsx`                                                   | mount; loops                                                                                 |
| Navbar reveal / hide on scroll                       | `src/components/navbar.tsx`                                                          | scroll position                                                                              |
| Command-menu open / close                            | `src/components/command-menu.tsx`                                                    | Ctrl/Cmd+K, `/`                                                                              |
| Cyber-chat open / close                              | `src/components/cyber-chat.tsx`                                                      | `isOpen` toggle; `gsap.fromTo` on open via `useGSAP`, raw `gsap.to` in close handler         |
| Hacker-text glyph scramble                           | `src/components/ui/hacker-text.tsx`                                                  | mount + on text change                                                                       |
| Hero section entrance + 3D avatar                    | `src/components/home/hero-section.tsx`, `src/components/ui/avatar-image.tsx`         | mount; chained timeline                                                                      |
| Neural network particle field                        | `src/components/home/neural-network.tsx`                                             | mount; loops                                                                                 |
| Social links stagger                                 | `src/components/home/social-links.tsx`                                               | mount                                                                                        |
| Donation button pulse                                | `src/components/home/donation-button.tsx`                                            | mount; loops                                                                                 |
| Guestbook shell entrance (header, form, list, decor) | `src/components/pages/guestbook-client.tsx`                                          | mount; full pattern with `usePrefersReducedMotion` short-circuit                             |
| Achievements grid stagger                            | `src/components/pages/achievements-client.tsx`                                       | mount                                                                                        |
| Dashboard tiles entrance                             | `src/components/pages/dashboard-client.tsx`                                          | mount                                                                                        |
| About cards stagger                                  | `src/components/pages/about-client.tsx`                                              | mount                                                                                        |
| Contact multi-step transitions                       | `src/components/contact/contact-form.tsx`, `src/components/pages/contact-client.tsx` | step change                                                                                  |
| Uses grid stagger                                    | `src/components/pages/uses-client.tsx`                                               | mount                                                                                        |
| Theme-toggle morph                                   | `src/components/theme-toggle.tsx`                                                    | theme change                                                                                 |
| Sound-prompter slide-in                              | `src/components/ui/sound-prompter.tsx`                                               | first interaction needed for `AudioContext`                                                  |
| Tab title flicker on hidden tab                      | `src/components/ui/tab-manager.tsx`                                                  | `visibilitychange`                                                                           |
| Page transition cross-fade                           | `src/app/template.tsx`                                                               | route change                                                                                 |
| 404 entrance                                         | `src/app/not-found.tsx`                                                              | mount                                                                                        |
| Snake game open                                      | `src/components/snake/snake-terminal.tsx` (dynamic-imported)                         | Konami code or `open-snake-game` event                                                       |
| Konami confetti shower                               | `src/components/global-app-wrapper.tsx`                                              | Konami code                                                                                  |
| AI chat hack-mode scanline                           | `src/components/cyber-chat.tsx`                                                      | `/hack` command — CSS `.animate-scanline`                                                    |

---

## Sound — paired with motion

[`src/components/sound-provider.tsx`](../src/components/sound-provider.tsx)
synthesizes effects via the Web Audio API. `useSfx()` exposes
`play('click' | 'hover' | 'success' | 'error' | ...)`.

Constraints:

- **`AudioContext` initializes lazily on the first user gesture**
  (browser autoplay policy). `<SoundPrompter />` watches for first
  click/keydown/touch and unlocks the context.
- Do **not** call `play()` before the prompter has fired — it no-ops
  silently and you'll think your event hooked up wrong.
- Sounds are bundled as effects, not files — they're synthesized in JS,
  so there's no asset cost.

Pair sound with motion on **affirmative actions**: a successful action
(`play('success')`), a hover into a magnetic element (`play('hover')`),
a click (`play('click')`). Don't play sound on every render.

---

## Easter eggs

- **Konami code** (`useKonami` in
  [`src/hooks/use-konami.ts`](../src/hooks/use-konami.ts)): triggers a 3s
  confetti shower and opens the Snake terminal. Confetti is
  `await import('canvas-confetti')` — dynamic so it doesn't ship in the
  initial bundle.
- **Snake terminal** (`src/components/snake/snake-terminal.tsx`):
  dynamic-imported with `ssr: false` because it uses `requestAnimationFrame`
  and a tight render loop.
- **`/hack` chat command**: scanline overlay (CSS `.animate-scanline`)
  for 5 seconds.
- **`SystemContextMenu`** (`src/components/ui/system-context-menu.tsx`):
  the right-click menu replaces the browser default.

---

## Page transitions — `app/template.tsx`

`src/app/template.tsx` wraps every route with a GSAP-driven cross-fade.
This pairs with the `::view-transition-*` overrides in `globals.css`
(see [`design-system.md`](./design-system.md)) and
`<TransitionLink />` which calls `document.startViewTransition`.

If you add a new route, the transition applies automatically. Do not
opt out unless you have a specific reason (avoid breaking the consistent
nav feel).

---

## Refusal triggers

- **Adding `framer-motion` / `motion`** — banned. GSAP via `useGSAP` is
  the substitution.
- **Raw `useEffect(() => { gsap.to(...) }, [])`** — use `useGSAP`. The
  raw pattern leaks tweens on unmount, breaks Strict Mode, and doesn't
  scope selectors.
- **Animating `filter: blur()` or `box-shadow`** — mobile repaint cost.
  Use stacked radial gradients for glow.
- **Removing the `usePrefersReducedMotion` check** in a `useGSAP`
  callback that animates motion-heavy effects (parallax, scroll-driven,
  particle bursts). The user has asked for reduced motion; respect it.
- **Removing the `.reduce-motion` class wiring in `GlobalAppWrapper`** —
  it's the safety net for CSS-driven animations.
- **Importing `gsap/Flip` or `gsap/ScrollTrigger` from a separate
  package** — they ship inside `gsap` proper; just
  `import { Flip } from 'gsap/Flip'`.
- **Skipping `'use client'`** on a component that calls `useGSAP` —
  hooks can't run server-side.

---

## Known tech debt

| #   | Issue                                                                                                                                                                                                                                                                                                                                                              | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | `cyber-chat.tsx` close handler uses raw `gsap.to` outside `useGSAP`. The tween won't be reverted on unmount; if the user dismisses the chat and the component unmounts mid-tween, the leak is harmless but inconsistent with the rest of the codebase. Either accept (and document) or replace with `useGSAP({ dependencies: [isOpen] })` driving both directions. | Low      |
| 2   | `tw-animate-css` keyframes (`.animate-fade-in`, `.animate-gradient-xy`, `.animate-scanline`) don't read `prefers-reduced-motion` themselves — they rely on the `.reduce-motion *` global override. If `GlobalAppWrapper` ever unmounts (it doesn't, but in theory), the override stops applying. Low risk.                                                         | Low      |
| 3   | No central "motion enabled" kill-switch. The reduced-motion paths are the only way to disable GSAP en masse; a project-wide `MOTION_ENABLED` constant in `globals.css` or a dedicated `motion.ts` would help when perf-testing or shipping a "static" build for low-end devices.                                                                                   | Low      |

---

## See also

- SKILL.md "Animation: use GSAP via `useGSAP`"
- [`design-system.md`](./design-system.md) — the `.reduce-motion`
  utility, the `.invisible-hold` class, `tw-animate-css` utilities
- [`anti-hallucination.md`](./anti-hallucination.md) — the "no Framer
  Motion" rule
- Source: 23 `useGSAP` usages across `src/components/**` and
  `src/app/**`; the
  [`global-app-wrapper.tsx`](../src/components/global-app-wrapper.tsx)
  reduced-motion handler;
  [`use-prefers-reduced-motion.ts`](../src/hooks/use-prefers-reduced-motion.ts)
